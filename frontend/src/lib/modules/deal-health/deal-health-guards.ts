import type { Role } from "@prisma/client";
import { forbidden } from "./deal-health-errors";

export type DealHealthViewContext = {
  role: Role;
  userId: string;
  salesRepId: string;
};

/**
 * Checks if a user has baseline access to the deal health intelligence module.
 * Customers are strictly prohibited.
 */
export function canAccessDealHealthArea(role: Role): boolean {
  return (
    role === "ADMIN" ||
    role === "SALES_MANAGER" ||
    role === "FINANCE" ||
    role === "OPERATIONS" ||
    role === "SALES_REP"
  );
}

/**
 * Checks if a user can view the deal health of a specific quotation.
 *
 * Rules:
 * - CUSTOMER: Always false (403 forbidden).
 * - SALES_REP: True ONLY if assigned as the quotation's salesRepId.
 * - ADMIN, SALES_MANAGER, FINANCE, OPERATIONS: True (organization-wide view).
 */
export function canViewDealHealth(context: DealHealthViewContext): boolean {
  if (context.role === "CUSTOMER") {
    return false;
  }

  if (context.role === "SALES_REP") {
    return context.userId === context.salesRepId;
  }

  return (
    context.role === "ADMIN" ||
    context.role === "SALES_MANAGER" ||
    context.role === "FINANCE" ||
    context.role === "OPERATIONS"
  );
}

export function assertCanViewDealHealth(context: DealHealthViewContext): void {
  if (!canViewDealHealth(context)) {
    throw forbidden("You do not have permission to view deal health for this quotation.");
  }
}
