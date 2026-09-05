import type {
  ApprovalLevel,
  ApprovalStatus,
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
  DiscountRiskLevel,
  FulfillmentAllocationStatus,
  FulfillmentLineStatus,
  FulfillmentStatus,
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
  DISCOUNT_CHECK: "Discount check",
  PENDING_MANAGER: "Pending manager approval",
  PENDING_FINANCE: "Pending finance approval",
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
  DISCOUNT_CHECK: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  PENDING_MANAGER: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  PENDING_FINANCE: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  APPROVED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  REJECTED: "bg-red-50 text-red-700 hover:bg-red-50",
  UNDER_NEGOTIATION: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  CONFIRMED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  FULFILLING: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  COMPLETED: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};

export const APPROVAL_STATUS_LABELS: Record<ApprovalStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

export const APPROVAL_STATUS_BADGE_CLASSES: Record<ApprovalStatus, string> = {
  PENDING: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  APPROVED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  REJECTED: "bg-red-50 text-red-700 hover:bg-red-50",
};

export const APPROVAL_LEVEL_STAGE_LABELS: Record<ApprovalLevel, string> = {
  MANAGER: "Manager approval",
  FINANCE: "Finance approval",
};

export const DISCOUNT_RISK_LABELS: Record<DiscountRiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export const DISCOUNT_RISK_BADGE_CLASSES: Record<DiscountRiskLevel, string> = {
  LOW: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  MEDIUM: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  HIGH: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  CRITICAL: "bg-red-50 text-red-700 hover:bg-red-50",
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  PENDING_ALLOCATION: "Pending allocation",
  ALLOCATED: "Allocated",
  PARTIALLY_ALLOCATED: "Partially allocated",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export const FULFILLMENT_STATUS_BADGE_CLASSES: Record<FulfillmentStatus, string> = {
  PENDING_ALLOCATION: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  ALLOCATED: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  PARTIALLY_ALLOCATED: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  PARTIALLY_FULFILLED: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  FULFILLED: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  COMPLETED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  CANCELLED: "bg-red-50 text-red-700 hover:bg-red-50",
};

export const FULFILLMENT_LINE_STATUS_LABELS: Record<FulfillmentLineStatus, string> = {
  REQUESTED: "Requested",
  ALLOCATED: "Allocated",
  PARTIALLY_FULFILLED: "Partially fulfilled",
  FULFILLED: "Fulfilled",
  BACKORDERED: "Backordered",
  CANCELLED: "Cancelled",
};

export const FULFILLMENT_LINE_STATUS_BADGE_CLASSES: Record<FulfillmentLineStatus, string> = {
  REQUESTED: "bg-slate-100 text-slate-700 hover:bg-slate-100",
  ALLOCATED: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  PARTIALLY_FULFILLED: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  FULFILLED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  BACKORDERED: "bg-red-50 text-red-700 hover:bg-red-50",
  CANCELLED: "bg-red-50 text-red-700 hover:bg-red-50",
};

export const FULFILLMENT_ALLOCATION_STATUS_LABELS: Record<FulfillmentAllocationStatus, string> = {
  ALLOCATED: "Allocated",
  FULFILLED: "Fulfilled",
  RELEASED: "Released",
};

export const FULFILLMENT_ALLOCATION_STATUS_BADGE_CLASSES: Record<FulfillmentAllocationStatus, string> = {
  ALLOCATED: "bg-blue-50 text-blue-700 hover:bg-blue-50",
  FULFILLED: "bg-emerald-50 text-emerald-700 hover:bg-emerald-50",
  RELEASED: "bg-slate-100 text-slate-700 hover:bg-slate-100",
};