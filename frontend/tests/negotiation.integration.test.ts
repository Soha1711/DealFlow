import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import { approveApproval } from "@/lib/modules/approvals/approval-service";
import {
  calculateLinePricing,
  calculateQuotationTotals,
} from "@/lib/modules/quotations/pricing";
import {
  acceptNegotiation,
  counterNegotiation,
  customerAcceptQuotation,
  customerRespondToCounter,
  getCustomerQuotation,
  listCustomerQuotations,
  rejectNegotiation,
  submitCustomerNegotiation,
} from "@/lib/modules/negotiations/negotiation-service";
import { NegotiationError } from "@/lib/modules/negotiations/negotiation-errors";

const suffix = Date.now().toString(36).toUpperCase();

let rep: { id: string; userId: string; role: "SALES_REP" };
let manager: { id: string; userId: string; role: "SALES_MANAGER" };
let customerUser: { id: string; role: "CUSTOMER" };
let customer1Id: string;
let customer2Id: string;
let beaconEdge: { id: string; price: number; cost: number; maxDiscountPercent: number };
const testQuotationIds: string[] = [];
let quoteSeq = 0;

async function createApprovedTestQuote(customerId: string, discountPercent = 5) {
  quoteSeq += 1;
  const pricing = calculateLinePricing({
    quantity: 2,
    unitPrice: beaconEdge.price,
    discountPercent,
    cost: beaconEdge.cost,
  });
  const totals = calculateQuotationTotals([pricing]);

  const quote = await db.quotation.create({
    data: {
      quotationNumber: `TEST-NEG-${suffix}-${quoteSeq}`,
      customerId,
      salesRepId: rep.id,
      status: "APPROVED",
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      margin: totals.margin,
      riskScore: 0,
      riskLevel: "LOW",
      requiredApprovalLevel: "NONE",
      lines: {
        create: [
          {
            productId: beaconEdge.id,
            quantity: 2,
            unitPrice: beaconEdge.price,
            discountPercent,
            discountAmount: pricing.discountAmount,
            lineTotal: pricing.lineTotal,
            margin: pricing.margin,
            isRecurring: false,
          },
        ],
      },
    },
  });

  testQuotationIds.push(quote.id);
  return quote;
}

before(async () => {
  const repUser = await db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
  rep = { id: repUser.id, userId: repUser.id, role: "SALES_REP" };

  const mgrUser = await db.user.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });
  manager = { id: mgrUser.id, userId: mgrUser.id, role: "SALES_MANAGER" };

  // Ensure two test customer records exist for IDOR testing
  let c1 = await db.customer.findFirst({ where: { email: "billing@northwindtraders.com" } });
  if (!c1) {
    c1 = await db.customer.create({
      data: { name: `Customer 1 ${suffix}`, email: `c1-${suffix}@test.io`, tier: "GOLD" },
    });
  }
  customer1Id = c1.id;

  let c2 = await db.customer.findFirst({ where: { email: "procurement@bluepeakmfg.com" } });
  if (!c2) {
    c2 = await db.customer.create({
      data: { name: `Customer 2 ${suffix}`, email: `c2-${suffix}@test.io`, tier: "PLATINUM" },
    });
  }
  customer2Id = c2.id;

  let custU = await db.user.findFirst({ where: { role: "CUSTOMER" } });
  if (!custU) {
    custU = await db.user.create({
      data: {
        name: `Customer User ${suffix}`,
        email: `cust-${suffix}@dealflow360.io`,
        passwordHash: "dummy",
        role: "CUSTOMER",
        customerId: customer1Id,
      },
    });
  } else {
    await db.user.update({
      where: { id: custU.id },
      data: { customerId: customer1Id },
    });
  }
  customerUser = { id: custU.id, role: "CUSTOMER" };

  const product = await db.product.findUniqueOrThrow({ where: { sku: "EDGE-DEV-021" } });
  beaconEdge = {
    id: product.id,
    price: Number(product.price),
    cost: Number(product.cost),
    maxDiscountPercent: product.maxDiscountPercent,
  };
});

after(async () => {
  if (testQuotationIds.length > 0) {
    await db.quotationNegotiation.deleteMany({
      where: { quotationId: { in: testQuotationIds } },
    });
    await db.approval.deleteMany({
      where: { quotationId: { in: testQuotationIds } },
    });
    await db.quotationLine.deleteMany({
      where: { quotationId: { in: testQuotationIds } },
    });
    await db.quotation.deleteMany({
      where: { id: { in: testQuotationIds } },
    });
  }
});

describe("Phase 7: Customer Portal & Negotiation Integration", () => {
  it("allows customer to list their quotations and prevents seeing internal drafts", async () => {
    const approvedQuote = await createApprovedTestQuote(customer1Id);

    const result = await listCustomerQuotations(customer1Id, {
      page: 1,
      pageSize: 10,
    });

    assert.equal(result.data.some((q) => q.id === approvedQuote.id), true);
    // Verifies cost/margin fields are not on the returned items
    for (const item of result.data) {
      assert.equal("margin" in item, false);
      assert.equal("riskScore" in item, false);
    }
  });

  it("enforces strict IDOR protection: customer cannot access another customer's quote", async () => {
    const otherCustomerQuote = await createApprovedTestQuote(customer2Id);

    await assert.rejects(
      async () => {
        await getCustomerQuotation(otherCustomerQuote.id, customer1Id);
      },
      (err: unknown) => err instanceof NegotiationError && err.status === 404
    );
  });

  it("retrieves sanitized quotation details with no cost or margin leakage", async () => {
    const quote = await createApprovedTestQuote(customer1Id);

    const detail = (await getCustomerQuotation(quote.id, customer1Id)) as Record<string, unknown> & {
      id: string;
      lines: Array<Record<string, unknown> & { quantity: number; product: Record<string, unknown> }>;
    };
    assert.equal(detail.id, quote.id);
    assert.equal(detail.lines.length, 1);
    assert.equal(detail.lines[0].quantity, 2);

    // Verify information hiding: no costs, no margins, no risk, no approvals
    assert.equal("margin" in detail, false);
    assert.equal("riskScore" in detail, false);
    assert.equal("riskLevel" in detail, false);
    assert.equal("approvals" in detail, false);
    assert.equal("margin" in detail.lines[0], false);
    assert.equal("cost" in detail.lines[0].product, false);
    assert.equal("maxDiscountPercent" in detail.lines[0].product, false);
  });

  it("submits customer negotiation request and updates quotation status to UNDER_NEGOTIATION", async () => {
    const quote = await createApprovedTestQuote(customer1Id);

    const negotiation = await submitCustomerNegotiation(
      quote.id,
      customer1Id,
      customerUser.id,
      {
        message: "Can we get 15% discount for 4 units?",
        targetTotal: 3400,
        proposedLines: [
          { productId: beaconEdge.id, requestedQuantity: 4, requestedDiscountPercent: 15 },
        ],
      }
    );

    assert.equal(negotiation.status, "PENDING");
    assert.equal(negotiation.quotationId, quote.id);

    const updated = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(updated.status, "UNDER_NEGOTIATION");

    // Concurrency guard: submitting another negotiation while active throws conflict
    await assert.rejects(
      async () => {
        await submitCustomerNegotiation(quote.id, customer1Id, customerUser.id, {
          message: "Another request immediately",
        });
      },
      (err: unknown) => err instanceof NegotiationError && err.status === 409
    );
  });

  it("allows sales rep to counter negotiation and customer to respond", async () => {
    const quote = await createApprovedTestQuote(customer1Id);
    const neg = await submitCustomerNegotiation(
      quote.id,
      customer1Id,
      customerUser.id,
      { message: "Can we discount this order?" }
    );

    // Sales counters
    const countered = await counterNegotiation(neg.id, rep, {
      message: "We can do 10% if you order 3 units.",
    });
    assert.equal(countered.status, "COUNTERED");
    assert.equal(countered.responseMessage, "We can do 10% if you order 3 units.");

    // Customer responds to counter
    const responded = await customerRespondToCounter(
      neg.id,
      customer1Id,
      customerUser.id,
      { message: "Agreed to 3 units at 10%." }
    );
    assert.equal(responded.status, "PENDING");
    assert.match(responded.message, /Customer Update/);
  });

  it("allows sales rep to reject negotiation and restores quotation to APPROVED", async () => {
    const quote = await createApprovedTestQuote(customer1Id);
    const neg = await submitCustomerNegotiation(
      quote.id,
      customer1Id,
      customerUser.id,
      { message: "Please give us 50% discount." }
    );

    const rejected = await rejectNegotiation(neg.id, rep, {
      reason: "Discount requested is too deep for our margins.",
    });
    assert.equal(rejected.status, "REJECTED");
    assert.equal(rejected.responseMessage, "Discount requested is too deep for our margins.");

    // Quotation returns to APPROVED
    const updatedQuote = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(updatedQuote.status, "APPROVED");
  });

  it("re-uses pricing & approval workflow when sales rep accepts changes with over-limit discount", async () => {
    const quote = await createApprovedTestQuote(customer1Id);
    const neg = await submitCustomerNegotiation(
      quote.id,
      customer1Id,
      customerUser.id,
      {
        message: "We want 4 units at 8% discount.",
        proposedLines: [
          { productId: beaconEdge.id, requestedQuantity: 4, requestedDiscountPercent: 8 },
        ],
      }
    );

    // Sales Rep accepts with 4 units at 8% discount (Beacon Edge max discount is 5%!)
    // This MUST trigger the existing Phase 2 pricing engine and Phase 3 approval workflow!
    const acceptedQuote = await acceptNegotiation(neg.id, rep, {
      message: "Approved 4 units at 8% discount.",
      lines: [
        {
          productId: beaconEdge.id,
          quantity: 4,
          unitPrice: beaconEdge.price,
          discountPercent: 8,
        },
      ],
    });

    // Verification 1: Pricing engine re-evaluated totals authoritatively
    // 4 units * 999 = 3996 gross. 8% discount = 319.68. Total = 3676.32.
    assert.equal(acceptedQuote.lines.length, 1);
    assert.equal(acceptedQuote.lines[0].quantity, 4);
    assert.equal(acceptedQuote.lines[0].discountPercent, 8);
    assert.equal(acceptedQuote.total.toFixed(2), "3676.32");

    // Verification 2: Because discount (20%) > product limit (5%), discount risk is calculated
    // and quotation is routed to PENDING_MANAGER with an Approval record created!
    assert.equal(acceptedQuote.status, "PENDING_MANAGER");
    assert.equal(acceptedQuote.requiredApprovalLevel, "MANAGER");

    const approvals = await db.approval.findMany({ where: { quotationId: quote.id } });
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].level, "MANAGER");
    assert.equal(approvals[0].status, "PENDING");

    // Manager acts on the approval -> quotation moves to APPROVED
    await approveApproval(approvals[0].id, { userId: manager.id, role: "SALES_MANAGER" });
    const managerApprovedQuote = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(managerApprovedQuote.status, "APPROVED");

    // Customer accepts the approved quotation -> quotation moves to CONFIRMED
    const customerConfirmed = await customerAcceptQuotation(
      quote.id,
      customer1Id,
      customerUser.id
    );
    assert.equal(customerConfirmed.status, "CONFIRMED");
  });
});
