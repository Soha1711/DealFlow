import type { Role } from "@prisma/client";

/**
 * Coarse-grained application areas that Phase 1 pages map to. Future business
 * permissions (quotation approval depth, fulfillment limits, etc.) will be
 * layered on top of this foundation.
 */
export type AppArea =
  | "dashboard"
  | "portal"
  | "quotations"
  | "approvals"
  | "fulfillment"
  | "billing"
  | "deal-health"
  | "admin"
  | "admin-products"
  | "admin-customers"
  | "admin-discounts"
  | "admin-warehouses"
  | "admin-subscriptions";

const allowedRoles = (...roles: Role[]) => roles;

const AREA_ACCESS: Record<AppArea, Role[]> = {
  dashboard: allowedRoles("ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS", "CUSTOMER"),
  portal: allowedRoles("ADMIN", "CUSTOMER"),
  quotations: allowedRoles("ADMIN", "SALES_REP", "SALES_MANAGER"),
  approvals: allowedRoles("ADMIN", "SALES_MANAGER", "FINANCE"),
  fulfillment: allowedRoles("ADMIN", "OPERATIONS"),
  billing: allowedRoles("ADMIN", "FINANCE", "SALES_MANAGER", "SALES_REP"),
  "deal-health": allowedRoles("ADMIN", "SALES_MANAGER", "FINANCE", "OPERATIONS"),
  admin: allowedRoles("ADMIN"),
  "admin-products": allowedRoles("ADMIN"),
  "admin-customers": allowedRoles("ADMIN"),
  "admin-discounts": allowedRoles("ADMIN"),
  "admin-warehouses": allowedRoles("ADMIN"),
  "admin-subscriptions": allowedRoles("ADMIN"),
};

export function hasAreaAccess(role: Role, area: AppArea): boolean {
  return AREA_ACCESS[area].includes(role);
}