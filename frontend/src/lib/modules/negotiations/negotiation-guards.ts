import type { QuotationStatus, Role } from "@prisma/client";

/**
 * Pure authorization and data sanitization helpers for the customer portal
 * and quotation negotiation workflow.
 *
 * Security guarantees:
 * 1. Strict customer scoping (IDOR prevention): A customer can only view or act
 *    on quotations where `quotation.customerId === session.user.customerId`.
 * 2. Information hiding: Product cost, margins, discount-risk scores, and
 *    internal approval workflows are NEVER exposed to the customer.
 */

export type CustomerAccessContext = {
  role: Role;
  customerId?: string | null;
  quotationCustomerId: string;
};

/**
 * Verifies if the caller has permission to view a customer portal quotation.
 */
export function canCustomerAccessQuotation(context: CustomerAccessContext): boolean {
  if (context.role === "ADMIN") return true;
  if (context.role === "CUSTOMER") {
    return Boolean(context.customerId && context.customerId === context.quotationCustomerId);
  }
  return false;
}

export type SalesNegotiationActionContext = {
  role: Role;
  userId: string;
  salesRepId: string;
  quotationStatus: QuotationStatus;
};

/**
 * Verifies if a sales representative or manager can act on a negotiation request.
 */
export function canSalesRepActOnNegotiation(
  context: SalesNegotiationActionContext
): boolean {
  if (context.quotationStatus !== "UNDER_NEGOTIATION") {
    return false;
  }
  if (context.role === "ADMIN" || context.role === "SALES_MANAGER") {
    return true;
  }
  if (context.role === "SALES_REP") {
    return context.userId === context.salesRepId;
  }
  return false;
}

/**
 * Sanitizes a quotation object before returning it to a customer-facing client.
 * Completely strips:
 * - Product.cost
 * - Quotation.margin
 * - QuotationLine.margin
 * - Quotation.riskScore, riskLevel, requiredApprovalLevel
 * - Quotation.approvals
 */
export function sanitizeQuotationForCustomer<
  T extends {
    id: string;
    quotationNumber: string;
    customerId: string;
    salesRepId: string;
    status: QuotationStatus;
    subtotal: unknown;
    discountTotal: unknown;
    total: unknown;
    validUntil: Date | null;
    createdAt: Date;
    updatedAt: Date;
    margin?: unknown;
    riskScore?: unknown;
    riskLevel?: unknown;
    requiredApprovalLevel?: unknown;
    approvals?: unknown;
    customer?: { id: string; name: string; email: string; tier: unknown };
    salesRep?: { id: string; name: string; email: string };
    lines?: Array<{
      id: string;
      productId: string;
      quantity: number;
      unitPrice: unknown;
      discountPercent: number;
      discountAmount: unknown;
      lineTotal: unknown;
      margin?: unknown;
      isRecurring: boolean;
      product?: {
        id: string;
        name: string;
        sku: string;
        category: string;
        price: unknown;
        cost?: unknown;
        maxDiscountPercent?: unknown;
        isRecurring: boolean;
      };
    }>;
    negotiations?: unknown;
  },
>(quotation: T) {
  const {
    margin: _margin,
    riskScore: _riskScore,
    riskLevel: _riskLevel,
    requiredApprovalLevel: _requiredApprovalLevel,
    approvals: _approvals,
    lines,
    ...rest
  } = quotation;

  return {
    ...rest,
    lines: lines?.map((line) => {
      const { margin: _lineMargin, product, ...lineRest } = line;
      let sanitizedProduct = undefined;
      if (product) {
        const { cost: _cost, maxDiscountPercent: _maxDiscount, ...prodRest } = product;
        sanitizedProduct = prodRest;
      }
      return {
        ...lineRest,
        ...(sanitizedProduct ? { product: sanitizedProduct } : {}),
      };
    }),
  };
}
