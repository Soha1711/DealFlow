import type { QuotationStatus, Role } from "@prisma/client";

/**
 * Pure authorization helpers for the quotation engine. They take plain
 * primitives so they can be unit-tested without a database and are reused by
 * both the service layer and the API routes. All authorization is enforced
 * server-side — the UI only reflects these rules.
 *
 * Area-level access (who may enter the Quotations area at all) is enforced by
 * the existing `hasAreaAccess(role, "quotations")` RBAC layer, which grants
 * ADMIN, SALES_REP and SALES_MANAGER. These guards layer record-level rules on
 * top of it.
 */

export type QuotationAccessContext = {
  role: Role;
  userId: string;
  salesRepId: string;
  status: QuotationStatus;
};

/** Whether the user may view a given quotation. */
export function canViewQuotation(context: QuotationAccessContext): boolean {
  if (context.role === "ADMIN" || context.role === "SALES_MANAGER") {
    return true;
  }
  if (context.role === "SALES_REP") {
    return context.userId === context.salesRepId;
  }
  return false;
}

/** Whether the user may edit a quotation: owner and still a DRAFT. */
export function canEditQuotation(context: QuotationAccessContext): boolean {
  return context.status === "DRAFT" && context.userId === context.salesRepId;
}

/** Whether the user may submit a quotation: same rule as editing (owner + DRAFT). */
export function canSubmitQuotation(context: QuotationAccessContext): boolean {
  return canEditQuotation(context);
}

/** Only DRAFT quotations are editable in Phase 2. */
export function isEditableStatus(status: QuotationStatus): boolean {
  return status === "DRAFT";
}