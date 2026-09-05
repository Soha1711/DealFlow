import type {
  BillingInterval,
  CustomerTier,
  DiscountApprovalLevel,
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