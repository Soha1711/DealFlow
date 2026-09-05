import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canCustomerAccessQuotation,
  canSalesRepActOnNegotiation,
  sanitizeQuotationForCustomer,
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
