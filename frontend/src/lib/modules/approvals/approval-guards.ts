import type { ApprovalLevel, Role } from "@prisma/client";

import { forbidden } from "./approval-errors";

/**
 * Server-side authorization rules for the approval workflow.
 *
 *   SALES_MANAGER — may act on MANAGER-level approvals
 *   FINANCE       — may act on FINANCE-level approvals only (never bypasses
 *                   the manager stage, including for CRITICAL quotations)
 *   ADMIN         — may act on any level
 *   SALES_REP / OPERATIONS / CUSTOMER — never
 *
 * Self-approval is always forbidden: no actor may approve or reject a
 * quotation they created (quotation.salesRepId === actor.userId).
 *
 * These helpers are pure and unit-testable; the service layer calls
 * `assertCanActOnApproval` on every request so the rules are enforced
 * server-side, never only in the UI.
 */

export type ApprovalActor = {
  role: Role;
  userId: string;
};

export type ApprovalGuardContext = {
  actor: ApprovalActor;
  level: ApprovalLevel;
  /** Quotation owner — self-approval is checked against this. */
  salesRepId: string;
};

export type ApprovalAccessDecision =
  | { allowed: true }
  | { allowed: false; message: string };

export function canActOnApproval(
  context: ApprovalGuardContext
): ApprovalAccessDecision {
  const { actor, level, salesRepId } = context;

  if (actor.role !== "ADMIN" && actor.role !== "SALES_MANAGER" && actor.role !== "FINANCE") {
    return {
      allowed: false,
      message: "You are not authorized to act on approvals.",
    };
  }

  if (actor.role === "SALES_MANAGER" && level !== "MANAGER") {
    return {
      allowed: false,
      message: "Sales managers can only act on manager-level approvals.",
    };
  }

  if (actor.role === "FINANCE" && level !== "FINANCE") {
    return {
      allowed: false,
      message:
        "Finance cannot act on manager-level approvals; the manager stage must complete first.",
    };
  }

  if (actor.userId === salesRepId) {
    return {
      allowed: false,
      message: "You cannot approve or reject your own quotation.",
    };
  }

  return { allowed: true };
}

/** Throws an `ApprovalError` (403) when the actor is not permitted. */
export function assertCanActOnApproval(context: ApprovalGuardContext): void {
  const decision = canActOnApproval(context);
  if (!decision.allowed) {
    throw forbidden(decision.message, "APPROVAL_FORBIDDEN");
  }
}

/** Whether the role may view the approval queue/detail at all. */
export function canViewApprovals(role: Role): boolean {
  return role === "ADMIN" || role === "SALES_MANAGER" || role === "FINANCE";
}