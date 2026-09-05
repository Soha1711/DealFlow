import type { Role } from "@prisma/client";

import { forbidden } from "./billing-errors";

/**
 * Server-side authorization rules for the billing domain.
 *
 *   FINANCE       — create/issue invoices, record payments, run subscription
 *                   billing (mutations)
 *   ADMIN         — everything FINANCE can do
 *   SALES_MANAGER — read-only billing visibility (all quotations)
 *   SALES_REP     — read-only billing visibility for their own quotations
 *   OPERATIONS    — no billing access
 *   CUSTOMER      — portal-safe read access only (Phase 7); no internal
 *                   finance data is exposed here
 *
 * Area-level access is enforced by `hasAreaAccess(role, "billing")`, which
 * gates who may reach the billing API at all. These helpers layer the
 * mutation permission and record-level visibility rules on top, and are pure
 * so they can be unit-tested. All authorization is enforced server-side.
 */

export type BillingActor = {
  role: Role;
  userId: string;
};

/** Mutation access: create/issue invoices, record payments, bill subscriptions. */
export function canManageBilling(role: Role): boolean {
  return role === "FINANCE" || role === "ADMIN";
}

/** Whether the role may list invoices/subscriptions across the tenant. */
export function canViewAllBilling(role: Role): boolean {
  return role === "FINANCE" || role === "ADMIN" || role === "SALES_MANAGER";
}

/** SALES_REP sees only billing tied to their own quotations. */
export function salesRepSeesOwnQuotationsOnly(role: Role): boolean {
  return role === "SALES_REP";
}

/**
 * Whether the actor may view a billing record tied to a given quotation owner.
 * Sales reps are limited to their own quotations; everyone with billing area
 * access (finance/admin/manager) may view it.
 */
export function canViewBillingForQuotation(
  actor: BillingActor,
  salesRepId: string
): boolean {
  if (actor.role === "FINANCE" || actor.role === "ADMIN" || actor.role === "SALES_MANAGER") {
    return true;
  }
  if (actor.role === "SALES_REP") {
    return actor.userId === salesRepId;
  }
  return false;
}

/** Throws 403 when the actor may not perform billing mutations. */
export function assertCanManageBilling(role: Role): void {
  if (!canManageBilling(role)) {
    throw forbidden(
      "You are not authorized to perform billing operations.",
      "BILLING_FORBIDDEN"
    );
  }
}

/** Throws 403 when the actor may not view this quotation's billing records. */
export function assertCanViewBillingForQuotation(
  actor: BillingActor,
  salesRepId: string
): void {
  if (!canViewBillingForQuotation(actor, salesRepId)) {
    throw forbidden(
      "You cannot view this billing record.",
      "BILLING_FORBIDDEN"
    );
  }
}

/** Throws 403 when the role cannot reach the billing area at all. */
export function assertCanViewBillingArea(role: Role): void {
  const allowed =
    role === "FINANCE" ||
    role === "ADMIN" ||
    role === "SALES_MANAGER" ||
    role === "SALES_REP";
  if (!allowed) {
    throw forbidden("You do not have access to billing.", "BILLING_FORBIDDEN");
  }
} 