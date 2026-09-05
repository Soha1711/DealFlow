import type {
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
  QuotationStatus,
} from "@prisma/client";

export const CUSTOMER_TIER_LABELS: Record<CustomerTier, string> = {
  STANDARD: "Standard",
  SILVER: "Silver",
  GOLD: "Gold",
  PLATINUM: "Platinum",
};

export const APPROVAL_LEVEL_LABELS: Record<DiscountApprovalLevel, string> = {
  NONE: "No approval",
  MANAGER: "Sales manager",
  MANAGER_AND_FINANCE: "Manager + Finance",
};

export const BILLING_INTERVAL_LABELS: Record<BillingInterval, string> = {
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  ANNUAL: "Annual",
};

export const QUOTATION_STATUS_LABELS: Record<QuotationStatus, string> = {
  DRAFT: "Draft",
  PENDING_APPROVAL: "Pending approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  UNDER_NEGOTIATION: "Under negotiation",
  CONFIRMED: "Confirmed",
  FULFILLING: "Fulfilling",
  COMPLETED: "Completed",
};

/**
 * Tailwind class sets for the quotation status badge. Kept in the same subtle,
 * light-on-white palette used elsewhere in the app (e.g. recurring product badges).
 */
export const QUOTATION_STATUS_BADGE_CLASSES: Record<QuotationStatus, string> = {
  DRAFT: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  PENDING_APPROVAL: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  APPROVED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  REJECTED: "bg-red-50 text-red-700 hover:bg-red-50",
  UNDER_NEGOTIATION: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  CONFIRMED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  FULFILLING: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  COMPLETED: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};