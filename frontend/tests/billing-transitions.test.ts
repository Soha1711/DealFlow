import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import {
  isBillableQuotationStatus,
  resolveBillingScheduleTransition,
  resolveInvoiceTransition,
  resolveSubscriptionTransition,
  type InvoiceTransitionContext,
} from "../src/lib/modules/billing/billing-transitions.ts";

const { Decimal } = Prisma;

function context(
  status: InvoiceTransitionContext["status"],
  paid: string,
  total: string
): InvoiceTransitionContext {
  return { status, paidAmount: new Decimal(paid), total: new Decimal(total) };
}

describe("invoice state machine", () => {
  it("issues a DRAFT invoice", () => {
    const result = resolveInvoiceTransition(context("DRAFT", "0", "1000"), "issue");
    assert.ok(result.ok);
    assert.equal(result.nextStatus, "ISSUED");
  });

  it("refuses to issue anything but DRAFT (ISSUED, PAID, VOID)", () => {
    for (const status of ["ISSUED", "PAID", "VOID", "PARTIALLY_PAID", "OVERDUE"] as const) {
      const result = resolveInvoiceTransition(context(status, "0", "1000"), "issue");
      assert.ok(!result.ok);
      assert.equal(result.reason, "INVALID_STATE");
    }
  });

  it("voids an unissued DRAFT or an ISSUED invoice with no payments", () => {
    const draft = resolveInvoiceTransition(context("DRAFT", "0", "1000"), "void");
    assert.ok(draft.ok);
    assert.equal(draft.nextStatus, "VOID");

    const issued = resolveInvoiceTransition(context("ISSUED", "0", "1000"), "void");
    assert.ok(issued.ok);
    assert.equal(issued.nextStatus, "VOID");
  });

  it("refuses to void a paid invoice or one with recorded payments", () => {
    // A PAID invoice is terminal — voiding is an invalid state, not merely
    // blocked by recorded payments.
    const paid = resolveInvoiceTransition(context("PAID", "1000", "1000"), "void");
    assert.ok(!paid.ok);
    assert.equal(paid.reason, "INVALID_STATE");

    // An ISSUED invoice that already has payments cannot be voided.
    const partial = resolveInvoiceTransition(context("ISSUED", "400", "1000"), "void");
    assert.ok(!partial.ok);
    assert.equal(partial.reason, "VOID_WITH_PAYMENTS");
  });

  it("marks issued invoices overdue", () => {
    for (const status of ["ISSUED", "PARTIALLY_PAID"] as const) {
      const result = resolveInvoiceTransition(context(status, "0", "1000"), "markOverdue");
      assert.ok(result.ok);
      assert.equal(result.nextStatus, "OVERDUE");
    }
  });

  it("refuses to mark DRAFT/PAID/VOID invoices overdue", () => {
    for (const status of ["DRAFT", "PAID", "VOID"] as const) {
      const result = resolveInvoiceTransition(context(status, "0", "1000"), "markOverdue");
      assert.ok(!result.ok);
    }
  });

  it("full payment on an issued invoice moves it to PAID", () => {
    const result = resolveInvoiceTransition(
      context("ISSUED", "1000", "1000"),
      "recordPayment"
    );
    assert.ok(result.ok);
    assert.equal(result.nextStatus, "PAID");
  });

  it("a partial payment moves the invoice to PARTIALLY_PAID", () => {
    const result = resolveInvoiceTransition(context("ISSUED", "400", "1000"), "recordPayment");
    assert.ok(result.ok);
    assert.equal(result.nextStatus, "PARTIALLY_PAID");
  });

  it("payments settle an OVERDUE invoice back to PAID", () => {
    const result = resolveInvoiceTransition(context("OVERDUE", "1000", "1000"), "recordPayment");
    assert.ok(result.ok);
    assert.equal(result.nextStatus, "PAID");
  });

  it("refuses payments on DRAFT, PAID and VOID invoices", () => {
    for (const status of ["DRAFT", "PAID", "VOID"] as const) {
      const result = resolveInvoiceTransition(context(status, "0", "1000"), "recordPayment");
      assert.ok(!result.ok);
      assert.equal(result.reason, "INVALID_STATE");
    }
  });

  it("PAID → DRAFT / PAID → ISSUED / VOID → PAID are all invalid", () => {
    const paidToDraft = resolveInvoiceTransition(context("PAID", "1000", "1000"), "issue");
    assert.ok(!paidToDraft.ok);
    const paidToIssued = resolveInvoiceTransition(context("PAID", "1000", "1000"), "issue");
    assert.ok(!paidToIssued.ok);
    const voidToPaid = resolveInvoiceTransition(context("VOID", "0", "1000"), "recordPayment");
    assert.ok(!voidToPaid.ok);
  });
});

describe("billing schedule state machine", () => {
  it("advances SCHEDULED → DUE → PAID", () => {
    const due = resolveBillingScheduleTransition("SCHEDULED", "makeDue");
    assert.ok(due.ok);
    assert.equal(due.nextStatus, "DUE");

    const paid = resolveBillingScheduleTransition("DUE", "markPaid");
    assert.ok(paid.ok);
    assert.equal(paid.nextStatus, "PAID");
  });

  it("marks a due period failed", () => {
    const result = resolveBillingScheduleTransition("DUE", "fail");
    assert.ok(result.ok);
    assert.equal(result.nextStatus, "FAILED");
  });

  it("cancels scheduled or due periods", () => {
    for (const status of ["SCHEDULED", "DUE"] as const) {
      const result = resolveBillingScheduleTransition(status, "cancel");
      assert.ok(result.ok);
      assert.equal(result.nextStatus, "CANCELLED");
    }
  });

  it("refuses to make a non-scheduled period due, or pay an already-paid one twice", () => {
    assert.ok(!resolveBillingScheduleTransition("PAID", "makeDue").ok);
    assert.ok(!resolveBillingScheduleTransition("PAID", "markPaid").ok);
    assert.ok(!resolveBillingScheduleTransition("CANCELLED", "markPaid").ok);
    assert.ok(!resolveBillingScheduleTransition("SCHEDULED", "fail").ok);
  });
});

describe("subscription state machine", () => {
  it("pauses and resumes", () => {
    const paused = resolveSubscriptionTransition("ACTIVE", "pause");
    assert.ok(paused.ok);
    assert.equal(paused.nextStatus, "PAUSED");
    const resumed = resolveSubscriptionTransition("PAUSED", "resume");
    assert.ok(resumed.ok);
    assert.equal(resumed.nextStatus, "ACTIVE");
  });

  it("cancels active/paused and completes active", () => {
    const cancelActive = resolveSubscriptionTransition("ACTIVE", "cancel");
    const cancelPaused = resolveSubscriptionTransition("PAUSED", "cancel");
    const completeActive = resolveSubscriptionTransition("ACTIVE", "complete");
    assert.ok(cancelActive.ok);
    assert.ok(cancelPaused.ok);
    assert.ok(completeActive.ok);
    assert.equal(cancelActive.ok && cancelActive.nextStatus, "CANCELLED");
    assert.equal(cancelPaused.ok && cancelPaused.nextStatus, "CANCELLED");
    assert.equal(completeActive.ok && completeActive.nextStatus, "COMPLETED");
  });

  it("rejects invalid transitions", () => {
    assert.ok(!resolveSubscriptionTransition("CANCELLED", "pause").ok);
    assert.ok(!resolveSubscriptionTransition("CANCELLED", "resume").ok);
    assert.ok(!resolveSubscriptionTransition("COMPLETED", "pause").ok);
    assert.ok(!resolveSubscriptionTransition("ACTIVE", "resume").ok);
    assert.ok(!resolveSubscriptionTransition("CANCELLED", "complete").ok);
  });
});

describe("quotation billing eligibility", () => {
  it("only finalized quotation statuses are billable", () => {
    for (const status of ["APPROVED", "CONFIRMED", "FULFILLING", "COMPLETED"]) {
      assert.equal(isBillableQuotationStatus(status), true, status);
    }
    for (const status of [
      "DRAFT",
      "PENDING_APPROVAL",
      "DISCOUNT_CHECK",
      "PENDING_MANAGER",
      "PENDING_FINANCE",
      "REJECTED",
      "UNDER_NEGOTIATION",
    ]) {
      assert.equal(isBillableQuotationStatus(status), false, status);
    }
  });
});
