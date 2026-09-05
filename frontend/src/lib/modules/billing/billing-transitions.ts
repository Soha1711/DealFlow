import type {
  BillingScheduleStatus,
  InvoiceStatus,
  SubscriptionStatus,
} from "@prisma/client";
import { Prisma } from "@prisma/client";

/**
 * Pure state-machine rules for billing.
 *
 * Invoice lifecycle:
 *
 *   DRAFT ──issue──▶ ISSUED ──payment──▶ PARTIALLY_PAID ──payment──▶ PAID
 *     │                │                     │
 *     │                └────mark overdue────▶ OVERDUE ──payment──▶ PAID
 *     └──void──▶ VOID
 *
 *   - DRAFT → ISSUED      (issue)
 *   - DRAFT → VOID        (void an unissued draft)
 *   - ISSUED → VOID       (void before any payment has been recorded)
 *   - ISSUED/PARTIALLY_PAID → PAID            (payments complete the total)
 *   - ISSUED/PARTIALLY_PAID → PARTIALLY_PAID  (partial payments)
 *   - ISSUED/PARTIALLY_PAID → OVERDUE         (past due, manual/derived)
 *   - PAID and VOID are terminal.
 *
 * BillingSchedule lifecycle:
 *
 *   SCHEDULED → DUE → PAID
 *       │        │
 *       └──CANCELLED   (subscription cancelled before billing)
 *       DUE → FAILED   (payment attempt failed)
 *
 * Subscription lifecycle (phase 6 controls only creation + recurring billing;
 * pause/resume/cancel/complete transitions are provided for completeness):
 *
 *   ACTIVE → PAUSED → ACTIVE
 *   ACTIVE → CANCELLED
 *   ACTIVE → COMPLETED
 */

export type InvoiceAction = "issue" | "void" | "recordPayment" | "markOverdue";

export type InvoiceTransitionContext = {
  status: InvoiceStatus;
  /** Sum of successful payments already recorded (Decimal). */
  paidAmount: Prisma.Decimal;
  /** Invoice total — used to derive PARTIALLY_PAID vs PAID. */
  total: Prisma.Decimal;
};

export type InvoiceTransitionResult =
  | { ok: true; nextStatus: InvoiceStatus }
  | { ok: false; reason: "INVALID_STATE" | "VOID_WITH_PAYMENTS"; message: string };

export function resolveInvoiceTransition(
  context: InvoiceTransitionContext,
  action: InvoiceAction
): InvoiceTransitionResult {
  const { status, paidAmount, total } = context;

  if (action === "issue") {
    if (status !== "DRAFT") {
      return {
        ok: false,
        reason: "INVALID_STATE",
        message: "Only DRAFT invoices can be issued.",
      };
    }
    return { ok: true, nextStatus: "ISSUED" };
  }

  if (action === "void") {
    if (status !== "DRAFT" && status !== "ISSUED") {
      return {
        ok: false,
        reason: "INVALID_STATE",
        message: "Only DRAFT or ISSUED invoices can be voided.",
      };
    }
    if (paidAmount.gt(0)) {
      return {
        ok: false,
        reason: "VOID_WITH_PAYMENTS",
        message: "An invoice with recorded payments cannot be voided.",
      };
    }
    return { ok: true, nextStatus: "VOID" };
  }

  if (action === "markOverdue") {
    if (status !== "ISSUED" && status !== "PARTIALLY_PAID") {
      return {
        ok: false,
        reason: "INVALID_STATE",
        message: "Only issued invoices can become overdue.",
      };
    }
    return { ok: true, nextStatus: "OVERDUE" };
  }

  // recordPayment — derive the status after a payment that brings the
  // cumulative paid amount to `paidAmount` (caller passes the NEW total).
  if (action === "recordPayment") {
    if (!["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(status)) {
      return {
        ok: false,
        reason: "INVALID_STATE",
        message: "Payments can only be recorded on an issued invoice.",
      };
    }
    if (paidAmount.gte(total)) {
      return { ok: true, nextStatus: "PAID" };
    }
    if (paidAmount.gt(0)) {
      return { ok: true, nextStatus: "PARTIALLY_PAID" };
    }
    return { ok: true, nextStatus: "ISSUED" };
  }

  return {
    ok: false,
    reason: "INVALID_STATE",
    message: "Unknown invoice action.",
  };
}

export type ScheduleAction = "makeDue" | "markPaid" | "fail" | "cancel";

export function resolveBillingScheduleTransition(
  status: BillingScheduleStatus,
  action: ScheduleAction
): { ok: true; nextStatus: BillingScheduleStatus } | { ok: false; message: string } {
  switch (action) {
    case "makeDue":
      if (status !== "SCHEDULED") {
        return { ok: false, message: "Only scheduled periods can become due." };
      }
      return { ok: true, nextStatus: "DUE" };
    case "markPaid":
      if (status !== "SCHEDULED" && status !== "DUE") {
        return { ok: false, message: "Only scheduled or due periods can be paid." };
      }
      return { ok: true, nextStatus: "PAID" };
    case "fail":
      if (status !== "DUE") {
        return { ok: false, message: "Only a due period can be marked failed." };
      }
      return { ok: true, nextStatus: "FAILED" };
    case "cancel":
      if (status !== "SCHEDULED" && status !== "DUE") {
        return { ok: false, message: "Only scheduled or due periods can be cancelled." };
      }
      return { ok: true, nextStatus: "CANCELLED" };
    default:
      return { ok: false, message: "Unknown schedule action." };
  }
}

export type SubscriptionAction =
  | "pause"
  | "resume"
  | "cancel"
  | "complete";

export function resolveSubscriptionTransition(
  status: SubscriptionStatus,
  action: SubscriptionAction
): { ok: true; nextStatus: SubscriptionStatus } | { ok: false; message: string } {
  switch (action) {
    case "pause":
      if (status !== "ACTIVE") {
        return { ok: false, message: "Only an active subscription can be paused." };
      }
      return { ok: true, nextStatus: "PAUSED" };
    case "resume":
      if (status !== "PAUSED") {
        return { ok: false, message: "Only a paused subscription can be resumed." };
      }
      return { ok: true, nextStatus: "ACTIVE" };
    case "cancel":
      if (status !== "ACTIVE" && status !== "PAUSED") {
        return { ok: false, message: "Only an active or paused subscription can be cancelled." };
      }
      return { ok: true, nextStatus: "CANCELLED" };
    case "complete":
      if (status !== "ACTIVE") {
        return { ok: false, message: "Only an active subscription can be completed." };
      }
      return { ok: true, nextStatus: "COMPLETED" };
    default:
      return { ok: false, message: "Unknown subscription action." };
  }
}

/** Quotation states that have passed governance and may be billed. */
export const BILLABLE_QUOTATION_STATUSES = [
  "APPROVED",
  "CONFIRMED",
  "FULFILLING",
  "COMPLETED",
] as const;

export function isBillableQuotationStatus(
  status: string
): status is (typeof BILLABLE_QUOTATION_STATUSES)[number] {
  return (BILLABLE_QUOTATION_STATUSES as readonly string[]).includes(status);
} 