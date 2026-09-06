import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import {
  canCustomerAccessQuotation,
  canSalesRepActOnNegotiation,
  sanitizeQuotationForCustomer,
  serializeNegotiationLines,
  serializeNegotiations,
} from "../src/lib/modules/negotiations/negotiation-guards.ts";

describe("canCustomerAccessQuotation", () => {
  it("allows a customer to view their own quotation", () => {
    const allowed = canCustomerAccessQuotation({
      role: "CUSTOMER",
      customerId: "cust-123",
      quotationCustomerId: "cust-123",
    });
    assert.equal(allowed, true);
  });

  it("blocks a customer from viewing another customer's quotation (IDOR protection)", () => {
    const allowed = canCustomerAccessQuotation({
      role: "CUSTOMER",
      customerId: "cust-123",
      quotationCustomerId: "cust-999",
    });
    assert.equal(allowed, false);
  });

  it("blocks a customer user who has no linked customer account", () => {
    const allowed = canCustomerAccessQuotation({
      role: "CUSTOMER",
      customerId: null,
      quotationCustomerId: "cust-123",
    });
    assert.equal(allowed, false);
  });

  it("allows an admin to view any customer quotation", () => {
    const allowed = canCustomerAccessQuotation({
      role: "ADMIN",
      customerId: null,
      quotationCustomerId: "cust-123",
    });
    assert.equal(allowed, true);
  });

  it("blocks internal sales rep from using the customer portal guard", () => {
    const allowed = canCustomerAccessQuotation({
      role: "SALES_REP",
      customerId: "cust-123",
      quotationCustomerId: "cust-123",
    });
    assert.equal(allowed, false);
  });
});

describe("canSalesRepActOnNegotiation", () => {
  it("allows the assigned sales rep to act when status is UNDER_NEGOTIATION", () => {
    const allowed = canSalesRepActOnNegotiation({
      role: "SALES_REP",
      userId: "rep-1",
      salesRepId: "rep-1",
      quotationStatus: "UNDER_NEGOTIATION",
    });
    assert.equal(allowed, true);
  });

  it("blocks a different sales rep from acting", () => {
    const allowed = canSalesRepActOnNegotiation({
      role: "SALES_REP",
      userId: "rep-2",
      salesRepId: "rep-1",
      quotationStatus: "UNDER_NEGOTIATION",
    });
    assert.equal(allowed, false);
  });

  it("blocks action if quotation is not UNDER_NEGOTIATION", () => {
    const allowed = canSalesRepActOnNegotiation({
      role: "SALES_REP",
      userId: "rep-1",
      salesRepId: "rep-1",
      quotationStatus: "APPROVED",
    });
    assert.equal(allowed, false);
  });

  it("allows managers and admins to act when UNDER_NEGOTIATION", () => {
    assert.equal(
      canSalesRepActOnNegotiation({
        role: "SALES_MANAGER",
        userId: "mgr-1",
        salesRepId: "rep-1",
        quotationStatus: "UNDER_NEGOTIATION",
      }),
      true
    );
    assert.equal(
      canSalesRepActOnNegotiation({
        role: "ADMIN",
        userId: "admin-1",
        salesRepId: "rep-1",
        quotationStatus: "UNDER_NEGOTIATION",
      }),
      true
    );
  });
});

describe("sanitizeQuotationForCustomer", () => {
  it("strips internal commercial margins, costs, risk scores, and approvals", () => {
    const rawQuotation = {
      id: "q-1",
      quotationNumber: "QUOT-2026-0001",
      customerId: "c-1",
      salesRepId: "u-1",
      status: "APPROVED" as const,
      subtotal: 1000,
      discountTotal: 100,
      total: 900,
      validUntil: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      // Internal fields to strip:
      margin: 450,
      riskScore: 35,
      riskLevel: "MEDIUM" as const,
      requiredApprovalLevel: "MANAGER" as const,
      approvals: [{ id: "app-1", level: "MANAGER", status: "APPROVED" }],
      lines: [
        {
          id: "ql-1",
          productId: "p-1",
          quantity: 2,
          unitPrice: 500,
          discountPercent: 10,
          discountAmount: 100,
          lineTotal: 900,
          margin: 450,
          isRecurring: false,
          product: {
            id: "p-1",
            name: "Server",
            sku: "SRV-01",
            category: "Hardware",
            price: 500,
            cost: 250,
            maxDiscountPercent: 20,
            isRecurring: false,
          },
        },
      ],
    };

    const sanitized = sanitizeQuotationForCustomer(rawQuotation) as Record<string, unknown> & {
      id: string;
      quotationNumber: string;
      total: number;
      lines: Array<{ lineTotal: number; product: { name: string } }>;
    };

    // Verify customer visible fields are preserved
    assert.equal(sanitized.id, "q-1");
    assert.equal(sanitized.quotationNumber, "QUOT-2026-0001");
    assert.equal(sanitized.total, 900);
    assert.equal(sanitized.lines[0].lineTotal, 900);
    assert.equal(sanitized.lines[0].product.name, "Server");

    // Verify internal sensitive fields are completely omitted
    assert.equal("margin" in sanitized, false);
    assert.equal("riskScore" in sanitized, false);
    assert.equal("riskLevel" in sanitized, false);
    assert.equal("requiredApprovalLevel" in sanitized, false);
    assert.equal("approvals" in sanitized, false);
    assert.equal("margin" in sanitized.lines[0], false);
    assert.equal("cost" in sanitized.lines[0].product, false);
    assert.equal("maxDiscountPercent" in sanitized.lines[0].product, false);
  });
});

describe("serializeNegotiationLines", () => {
  it("serializes Prisma Decimal fields to plain strings and preserves line data", () => {
    const rawLines = [
      {
        id: "line-1",
        productId: "prod-1",
        quantity: 3,
        unitPrice: new Prisma.Decimal("125.50"),
        discountPercent: 10,
        product: {
          id: "prod-1",
          name: "Acme Widget",
          sku: "WIDGET-01",
          price: new Prisma.Decimal("150.00"),
        },
      },
    ];

    const serialized = serializeNegotiationLines(rawLines);

    assert.equal(serialized.length, 1);
    assert.equal(serialized[0].id, "line-1");
    assert.equal(serialized[0].productId, "prod-1");
    assert.equal(serialized[0].quantity, 3);
    assert.equal(serialized[0].discountPercent, 10);
    assert.equal(typeof serialized[0].unitPrice, "string");
    assert.equal(serialized[0].unitPrice, "125.5");
    assert.equal(serialized[0].product.name, "Acme Widget");
    assert.equal(typeof serialized[0].product.price, "string");
    assert.equal(serialized[0].product.price, "150");

    // Must be plain primitive strings (safe for Server -> Client boundary)
    assert.equal(typeof serialized[0].unitPrice, "string");
    assert.equal(typeof serialized[0].product.price, "string");

    // Deep JSON serializability check
    assert.deepEqual(JSON.parse(JSON.stringify(serialized)), serialized);
  });

  it("handles number and string unit prices safely", () => {
    const rawLines = [
      {
        id: "line-2",
        productId: "prod-2",
        quantity: 1,
        unitPrice: 99.99,
        discountPercent: 0,
        product: {
          id: "prod-2",
          name: "Gadget",
          sku: "GAD-02",
          price: "99.99",
        },
      },
    ];

    const serialized = serializeNegotiationLines(rawLines);
    assert.equal(serialized[0].unitPrice, "99.99");
    assert.equal(serialized[0].product.price, "99.99");
  });
});

describe("serializeNegotiations", () => {
  it("serializes Date instances to ISO strings for client boundary safety", () => {
    const createdDate = new Date("2026-03-01T12:00:00.000Z");
    const actedDate = new Date("2026-03-02T15:30:00.000Z");

    const rawNegotiations = [
      {
        id: "neg-1",
        status: "PENDING" as const,
        message: "Can we get 15% discount?",
        proposedChanges: { targetTotal: 1000 },
        responseMessage: null,
        createdAt: createdDate,
        actedAt: null,
        createdBy: { name: "Alice Customer", email: "alice@customer.com" },
        actedBy: null,
      },
      {
        id: "neg-2",
        status: "COUNTERED" as const,
        message: "Earlier round",
        proposedChanges: null,
        responseMessage: "How about 10%?",
        createdAt: createdDate,
        actedAt: actedDate,
        createdBy: { name: "Alice Customer", email: "alice@customer.com" },
        actedBy: { name: "Bob SalesRep", email: "bob@dealflow.com" },
      },
    ];

    const serialized = serializeNegotiations(rawNegotiations);

    assert.equal(serialized.length, 2);

    // Date objects converted to primitive ISO strings
    assert.equal(typeof serialized[0].createdAt, "string");
    assert.equal(serialized[0].createdAt, "2026-03-01T12:00:00.000Z");
    assert.equal(serialized[0].actedAt, null);

    assert.equal(typeof serialized[1].createdAt, "string");
    assert.equal(typeof serialized[1].actedAt, "string");
    assert.equal(serialized[1].actedAt, "2026-03-02T15:30:00.000Z");

    // Deep JSON serializability check
    assert.deepEqual(JSON.parse(JSON.stringify(serialized)), serialized);
  });
});

