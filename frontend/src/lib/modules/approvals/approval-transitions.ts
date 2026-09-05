import type {
  ApprovalLevel,
  ApprovalStatus,
  DiscountApprovalLevel,
  QuotationStatus,
} from "@prisma/client";

/**
 * Pure state-machine rules for the approval workflow.
 *
 *   DRAFT → DISCOUNT_CHECK → APPROVED                        (LOW risk)
 *   DRAFT → DISCOUNT_CHECK → PENDING_MANAGER → APPROVED       (MEDIUM/HIGH risk)
 *   DRAFT → DISCOUNT_CHECK → PENDING_MANAGER → PENDING_FINANCE → APPROVED
 *                                                             (CRITICAL risk)
 *
 * A rejection from any approval stage moves the quotation to REJECTED.
 *
 * The functions here are pure and unit-testable. The service layer enforces
 * the same rules atomically inside a transaction, guarded by a conditional
 * update so stale or duplicate actions fail with a conflict.
 */

export type ApprovalAction = "approve" | "reject";

export type ApprovalTransitionContext = {
  approvalStatus: ApprovalStatus;
  approvalLevel: ApprovalLevel;
  quotationStatus: QuotationStatus;
  /** Quotation-level required approval depth, set at submit time. */
  requiredApprovalLevel: DiscountApprovalLevel | null;
};

export type TransitionResult =
  | { ok: true; nextQuotationStatus: QuotationStatus }
  | {
      ok: false;
      reason: "ALREADY_ACTED" | "STATUS_MISMATCH";
      message: string;
    };

const MISMATCH_MESSAGE =
  "This approval is not actionable in the quotation's current state.";

/**
 * Resolves the valid next quotation status for an approval action, or the
 * reason the action is invalid. An approval that is no longer PENDING can
 * never be acted on again.
 */
export function resolveApprovalTransition(
  context: ApprovalTransitionContext,
  action: ApprovalAction
): TransitionResult {
  if (context.approvalStatus !== "PENDING") {
    return {
      ok: false,
      reason: "ALREADY_ACTED",
      message: "This approval has already been acted on.",
    };
  }

  if (action === "approve") {
    if (context.approvalLevel === "MANAGER") {
      if (context.quotationStatus !== "PENDING_MANAGER") {
        return { ok: false, reason: "STATUS_MISMATCH", message: MISMATCH_MESSAGE };
      }
      const nextQuotationStatus: QuotationStatus =
        context.requiredApprovalLevel === "MANAGER_AND_FINANCE"
          ? "PENDING_FINANCE"
          : "APPROVED";
      return { ok: true, nextQuotationStatus };
    }

    if (context.approvalLevel === "FINANCE") {
      if (context.quotationStatus !== "PENDING_FINANCE") {
        return { ok: false, reason: "STATUS_MISMATCH", message: MISMATCH_MESSAGE };
      }
      return { ok: true, nextQuotationStatus: "APPROVED" };
    }
  }

  if (action === "reject") {
    if (context.approvalLevel === "MANAGER") {
      if (context.quotationStatus !== "PENDING_MANAGER") {
        return { ok: false, reason: "STATUS_MISMATCH", message: MISMATCH_MESSAGE };
      }
      return { ok: true, nextQuotationStatus: "REJECTED" };
    }

    if (context.approvalLevel === "FINANCE") {
      if (context.quotationStatus !== "PENDING_FINANCE") {
        return { ok: false, reason: "STATUS_MISMATCH", message: MISMATCH_MESSAGE };
      }
      return { ok: true, nextQuotationStatus: "REJECTED" };
    }
  }

  return { ok: false, reason: "STATUS_MISMATCH", message: MISMATCH_MESSAGE };
}