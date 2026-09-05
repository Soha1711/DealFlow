import type { Role } from "@prisma/client";

export const ROLE_LABELS: Record<Role, string> = {
  ADMIN: "Administrator",
  SALES_REP: "Sales Representative",
  SALES_MANAGER: "Sales Manager",
  FINANCE: "Finance",
  OPERATIONS: "Operations",
  CUSTOMER: "Customer",
};

export function roleLabel(role: Role): string {
  return ROLE_LABELS[role];
}