import type { DealHealthLevel } from "@/lib/labels";
import type {
  ApprovalLevel,
  ApprovalStatus,
  DiscountApprovalLevel,
  DiscountRiskLevel,
  FulfillmentStatus,
  InvoiceStatus,
  NegotiationStatus,
  QuotationStatus,
} from "@prisma/client";

export type { DealHealthLevel };

export type DealHealthCategory =
  | "DISCOUNT"
  | "MARGIN"
  | "APPROVAL"
  | "FULFILLMENT"
  | "BILLING"
  | "NEGOTIATION"
  | "EXPIRY"
  | "VELOCITY";

export type HealthFactorSeverity = "POSITIVE" | "INFO" | "WARNING" | "CRITICAL";

export type HealthFactor = {
  id: string;
  category: DealHealthCategory;
  severity: HealthFactorSeverity;
  /** Points deducted from the starting score of 100 (e.g. -15, 0). */
  impact: number;
  title: string;
  description: string;
};

export type AnomalySeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type DealAnomalyCode =
  | "NEGATIVE_MARGIN"
  | "RAZOR_THIN_MARGIN"
  | "LOSS_MAKING_LINE"
  | "CRITICAL_DISCOUNT_OVERAGE"
  | "REJECTED_APPROVAL"
  | "STALLED_APPROVAL"
  | "ACTIVE_BACKORDER"
  | "INSUFFICIENT_STOCK"
  | "OVERDUE_INVOICE"
  | "FAILED_PAYMENT"
  | "STALLED_NEGOTIATION"
  | "PROTRACTED_NEGOTIATION"
  | "EXPIRED_QUOTATION"
  | "EXPIRING_SOON"
  | "STAGNANT_DRAFT";

export type DealAnomaly = {
  id: string;
  code: DealAnomalyCode;
  severity: AnomalySeverity;
  title: string;
  description: string;
  suggestedAction: string;
};

export type DealRecommendation = {
  id: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
  category: DealHealthCategory;
  action: string;
  reason: string;
};

export type DealHealthEvaluationInput = {
  quotation: {
    id: string;
    quotationNumber: string;
    status: QuotationStatus;
    subtotal: number | string;
    discountTotal: number | string;
    total: number | string;
    margin: number | string;
    validUntil?: Date | string | null;
    riskScore?: number | null;
    riskLevel?: DiscountRiskLevel | null;
    requiredApprovalLevel?: DiscountApprovalLevel | null;
    createdAt: Date | string;
    updatedAt: Date | string;
  };
  lines: Array<{
    id: string;
    productId: string;
    quantity: number;
    unitPrice: number | string;
    discountPercent: number;
    margin: number | string;
    isRecurring: boolean;
    product?: {
      id: string;
      name: string;
      sku: string;
      cost: number | string;
      maxDiscountPercent: number;
      isRecurring: boolean;
      inventory?: Array<{ quantity: number; reservedQuantity: number }>;
    } | null;
  }>;
  approvals: Array<{
    id: string;
    level: ApprovalLevel;
    status: ApprovalStatus;
    reason?: string | null;
    createdAt: Date | string;
    actedAt?: Date | string | null;
    approver?: { id: string; name: string } | null;
  }>;
  fulfillments: Array<{
    id: string;
    status: FulfillmentStatus;
    lines: Array<{
      id: string;
      requestedQuantity: number;
      allocatedQuantity: number;
      fulfilledQuantity: number;
      backorderQuantity: number;
    }>;
  }>;
  invoices: Array<{
    id: string;
    invoiceNumber: string;
    status: InvoiceStatus;
    total: number | string;
    paidAmount: number | string;
    dueDate?: Date | string | null;
    payments?: Array<{ status: string }>;
  }>;
  negotiations: Array<{
    id: string;
    status: NegotiationStatus;
    message: string;
    createdAt: Date | string;
    actedAt?: Date | string | null;
  }>;
  /** Optional reference time for testing, defaults to new Date(). */
  now?: Date;
};

export type DealHealthResult = {
  quotationId: string;
  quotationNumber: string;
  score: number;
  level: DealHealthLevel;
  evaluatedAt: string;
  factors: HealthFactor[];
  anomalies: DealAnomaly[];
  recommendations: DealRecommendation[];
  metrics: {
    marginRate: number;
    total: number;
    margin: number;
    discountPercentAggregate: number;
    riskScore: number;
    pendingApprovalsCount: number;
    activeBackorderUnits: number;
    overdueInvoicesCount: number;
    activeNegotiationRounds: number;
  };
};

export type DealHealthPortfolioItem = {
  id: string;
  quotationNumber: string;
  status: QuotationStatus;
  total: number;
  margin: number;
  marginRate: number;
  customer: { id: string; name: string };
  salesRep: { id: string; name: string; email: string };
  health: {
    score: number;
    level: DealHealthLevel;
    primaryRisk?: string;
    anomaliesCount: number;
  };
  validUntil?: string | null;
  createdAt: string;
};

export type DealHealthPortfolioSummary = {
  averageScore: number;
  healthyCount: number;
  atRiskCount: number;
  criticalCount: number;
  criticalAlertsCount: number;
  totalDeals: number;
  totalPortfolioValue: number;
};
