import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import { createQuotation, submitQuotation } from "@/lib/modules/quotations/quotation-service";
import { approveApproval } from "@/lib/modules/approvals/approval-service";
import {
  getCustomerQuotation,
  submitCustomerNegotiation,
  acceptNegotiation,
} from "@/lib/modules/negotiations/negotiation-service";
import {
  createFulfillment,
  allocateFulfillment,
  fulfillFulfillment,
} from "@/lib/modules/fulfillment/fulfillment-service";
import { createBillingFromQuotation } from "@/lib/modules/billing/billing-service";
import { issueInvoice } from "@/lib/modules/billing/invoice-service";
import { recordPayment } from "@/lib/modules/billing/payment-service";
import { getDealHealth } from "@/lib/modules/deal-health/deal-health-service";

const suffix = Date.now().toString(36).toUpperCase();

let salesRep: { id: string; userId: string; role: "SALES_REP" };
let salesManager: { id: string; userId: string; role: "SALES_MANAGER" };
let finance: { id: string; userId: string; role: "FINANCE" };
let operations: { id: string; userId: string; role: "OPERATIONS" };
let customerUser: { id: string; userId: string; role: "CUSTOMER" };
let customerId: string;
let physicalProduct: { id: string; price: number; cost: number; maxDiscountPercent: number };
const createdQuotationIds: string[] = [];

before(async () => {
  const repUser = await db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
  salesRep = { id: repUser.id, userId: repUser.id, role: "SALES_REP" };

  const mgrUser = await db.user.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });
  salesManager = { id: mgrUser.id, userId: mgrUser.id, role: "SALES_MANAGER" };

  const finUser = await db.user.findFirstOrThrow({ where: { role: "FINANCE" } });
  finance = { id: finUser.id, userId: finUser.id, role: "FINANCE" };

  const opsUser = await db.user.findFirstOrThrow({ where: { role: "OPERATIONS" } });
  operations = { id: opsUser.id, userId: opsUser.id, role: "OPERATIONS" };

  const customer = await db.customer.create({
    data: {
      name: `E2E Enterprise Corp ${suffix}`,
      email: `e2e-${suffix}@enterprise.test`,
      tier: "PLATINUM",
    },
  });
  customerId = customer.id;

  const custUser = await db.user.create({
    data: {
      name: `E2E Customer Contact ${suffix}`,
      email: `contact-${suffix}@enterprise.test`,
      passwordHash: "dummy",
      role: "CUSTOMER",
      customerId: customer.id,
    },
  });
  customerUser = { id: custUser.id, userId: custUser.id, role: "CUSTOMER" };

  const prod = await db.product.findFirstOrThrow({ where: { isRecurring: false } });
  physicalProduct = {
    id: prod.id,
    price: Number(prod.price),
    cost: Number(prod.cost),
    maxDiscountPercent: prod.maxDiscountPercent,
  };
});

after(async () => {
  for (const qid of createdQuotationIds) {
    try {
      const fulfillments = await db.fulfillment.findMany({
        where: { quotationId: qid },
        select: { id: true, lines: { select: { id: true } } },
      });
      for (const f of fulfillments) {
        for (const l of f.lines) {
          const allocations = await db.fulfillmentAllocation.findMany({
            where: { fulfillmentLineId: l.id },
            select: { id: true },
          });
          await db.inventoryReservation.deleteMany({
            where: { allocationId: { in: allocations.map((a) => a.id) } },
          });
          await db.fulfillmentAllocation.deleteMany({ where: { fulfillmentLineId: l.id } });
        }
        await db.fulfillmentLine.deleteMany({ where: { fulfillmentId: f.id } });
        await db.fulfillment.delete({ where: { id: f.id } });
      }

      const invoices = await db.invoice.findMany({
        where: { quotationId: qid },
        select: { id: true },
      });
      for (const inv of invoices) {
        await db.payment.deleteMany({ where: { invoiceId: inv.id } });
        await db.invoiceLine.deleteMany({ where: { invoiceId: inv.id } });
        await db.billingSchedule.deleteMany({ where: { invoiceId: inv.id } });
        await db.invoice.delete({ where: { id: inv.id } });
      }
      await db.subscription.deleteMany({ where: { quotationId: qid } });
      await db.quotationNegotiation.deleteMany({ where: { quotationId: qid } });
      await db.approval.deleteMany({ where: { quotationId: qid } });
      await db.quotationLine.deleteMany({ where: { quotationId: qid } });
      await db.quotation.delete({ where: { id: qid } });
    } catch {
      // Best-effort cleanup
    }
  }

  if (customerUser?.id) {
    await db.user.delete({ where: { id: customerUser.id } }).catch(() => {});
  }
  if (customerId) {
    await db.customer.delete({ where: { id: customerId } }).catch(() => {});
  }
});

describe("Phase 9: Comprehensive End-to-End Enterprise Lifecycle", () => {
  it("executes the complete DealFlow360 business cycle across all 8 integrated modules", async () => {
    // -------------------------------------------------------------------------
    // STEP 1: Quotation Creation & Pricing (Phase 2)
    // -------------------------------------------------------------------------
    const quote = await createQuotation({
      salesRepId: salesRep.userId,
      customerId,
      lines: [
        {
          productId: physicalProduct.id,
          quantity: 4,
          unitPrice: physicalProduct.price,
          discountPercent: 15, // Higher than Beacon Edge 5% max -> requires manager approval
        },
      ],
    });
    createdQuotationIds.push(quote.id);

    assert.equal(quote.status, "DRAFT");
    assert.equal(quote.lines.length, 1);
    assert.ok(Number(quote.total) > 0);

    // -------------------------------------------------------------------------
    // STEP 2: Submission, Discount Governance & Approvals (Phase 3)
    // -------------------------------------------------------------------------
    const submitted = await submitQuotation(quote.id, salesRep);
    assert.ok(submitted.status === "PENDING_MANAGER" || submitted.status === "PENDING_APPROVAL");

    // Manager Ravi Patel approves stage 1
    const managerApproval = await db.approval.findFirstOrThrow({
      where: { quotationId: quote.id, level: "MANAGER", status: "PENDING" },
    });
    await approveApproval(managerApproval.id, salesManager);

    // If quotation requires finance approval, Finance Priya Nair approves stage 2
    const financeApproval = await db.approval.findFirst({
      where: { quotationId: quote.id, level: "FINANCE", status: "PENDING" },
    });
    if (financeApproval) {
      await approveApproval(financeApproval.id, finance);
    }

    const approvedQuote = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(approvedQuote.status, "APPROVED");

    // -------------------------------------------------------------------------
    // STEP 3: Customer Portal & Negotiation Workflow (Phase 7)
    // -------------------------------------------------------------------------
    // Customer views sanitized quote (IDOR protected, no internal margins/costs)
    const portalView = (await getCustomerQuotation(quote.id, customerId)) as Record<string, unknown>;
    assert.equal(portalView.id, quote.id);
    assert.equal("margin" in portalView, false);
    assert.equal("riskScore" in portalView, false);

    // Customer requests volume discount for 6 units at 20% discount
    const negotiation = await submitCustomerNegotiation(
      quote.id,
      customerId,
      customerUser.userId,
      {
        message: "Can we increase to 6 units if we get 20% discount?",
        proposedLines: [
          {
            productId: physicalProduct.id,
            requestedQuantity: 6,
            requestedDiscountPercent: 20,
          },
        ],
      }
    );
    assert.equal(negotiation.status, "PENDING");

    const underNegQuote = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(underNegQuote.status, "UNDER_NEGOTIATION");

    // Sales rep accepts customer negotiation terms
    // Acceptance recalculates pricing and re-triggers approval governance!
    const repAcceptResult = await acceptNegotiation(
      negotiation.id,
      salesRep,
      {
        message: "Accepted with approval required for 20% volume tier.",
        lines: [
          {
            productId: physicalProduct.id,
            quantity: 6,
            discountPercent: 20,
            unitPrice: physicalProduct.price,
          },
        ],
      }
    );

    // Because 20% exceeds the 5% product limit, it triggers manager approval again!
    assert.ok(
      repAcceptResult.status === "PENDING_MANAGER" ||
      repAcceptResult.status === "PENDING_FINANCE" ||
      repAcceptResult.status === "APPROVED"
    );

    // Complete re-approval if required (handling two-stage escalation)
    const pendingManagerApproval = await db.approval.findFirst({
      where: { quotationId: quote.id, level: "MANAGER", status: "PENDING" },
    });
    if (pendingManagerApproval) {
      await approveApproval(pendingManagerApproval.id, salesManager);
    }

    const pendingFinanceApproval = await db.approval.findFirst({
      where: { quotationId: quote.id, level: "FINANCE", status: "PENDING" },
    });
    if (pendingFinanceApproval) {
      await approveApproval(pendingFinanceApproval.id, finance);
    }

    const reApprovedQuote = await db.quotation.findUniqueOrThrow({ where: { id: quote.id } });
    assert.equal(reApprovedQuote.status, "APPROVED");

    // -------------------------------------------------------------------------
    // STEP 4: Fulfillment & Warehouse Allocation (Phase 5)
    // -------------------------------------------------------------------------
    // Operations Diego Ramos initiates fulfillment on the approved quotation
    const fulfillment = await createFulfillment(quote.id, operations);
    assert.equal(fulfillment.status, "PENDING_ALLOCATION");

    // Allocate inventory across distribution warehouses
    const allocated = await allocateFulfillment(fulfillment.id, operations);
    assert.ok(
      allocated.status === "ALLOCATED" ||
      allocated.status === "PARTIALLY_ALLOCATED"
    );

    // Fulfill all allocated stock
    const completedFulfillment = await fulfillFulfillment(fulfillment.id, operations);
    assert.ok(
      completedFulfillment.status === "FULFILLED" ||
      completedFulfillment.status === "COMPLETED" ||
      completedFulfillment.status === "PARTIALLY_FULFILLED"
    );

    // -------------------------------------------------------------------------
    // STEP 5: Billing, Invoicing & Payments (Phase 6)
    // -------------------------------------------------------------------------
    // Finance Priya Nair generates hybrid billing from the quotation
    const billingResult = await createBillingFromQuotation(quote.id, finance);
    assert.ok(billingResult.oneTimeInvoice !== null);

    const invoice = billingResult.oneTimeInvoice;
    assert.equal(invoice.status, "DRAFT");

    // Issue invoice
    const issuedInvoice = await issueInvoice(invoice.id, finance);
    assert.equal(issuedInvoice.status, "ISSUED");

    // Record full payment
    const paymentResult = await recordPayment(invoice.id, finance, {
      amount: issuedInvoice.total.toString(),
      method: "BANK_TRANSFER",
      reference: `E2E-PAY-${suffix}`,
    });
    assert.equal(paymentResult.invoice.status, "PAID");

    const paidInvoice = await db.invoice.findUniqueOrThrow({ where: { id: invoice.id } });
    assert.equal(paidInvoice.status, "PAID");

    // -------------------------------------------------------------------------
    // STEP 6: Deal Health & Risk Intelligence (Phase 8)
    // -------------------------------------------------------------------------
    // Deal Health evaluates the finalized deal
    const health = await getDealHealth(quote.id, salesRep);
    assert.ok(health.score >= 0 && health.score <= 100);
    assert.ok(["HEALTHY", "AT_RISK", "CRITICAL"].includes(health.level));
    assert.ok(Array.isArray(health.factors));
    assert.ok(Array.isArray(health.anomalies));

    // Confirm that because payment is settled and fulfillment succeeded, no unpaid invoice anomaly exists
    const hasUnpaidAnomaly = health.anomalies.some((a) => a.code === "OVERDUE_INVOICE");
    assert.equal(hasUnpaidAnomaly, false);
  });
});
