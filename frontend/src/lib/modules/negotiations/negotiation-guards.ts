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
      } | null;
    }>;
    negotiations?: unknown;
  },
>(quotation: T) {
  const rest = { ...quotation };
  delete (rest as { margin?: unknown }).margin;
  delete (rest as { riskScore?: unknown }).riskScore;
  delete (rest as { riskLevel?: unknown }).riskLevel;
  delete (rest as { requiredApprovalLevel?: unknown }).requiredApprovalLevel;
  delete (rest as { approvals?: unknown }).approvals;

  const sanitizedLines = quotation.lines?.map((line) => {
    const lineCopy = { ...line };
    delete (lineCopy as { margin?: unknown }).margin;
    if (line.product) {
      const prodCopy = { ...line.product };
      delete (prodCopy as { cost?: unknown }).cost;
      delete (prodCopy as { maxDiscountPercent?: unknown }).maxDiscountPercent;
      lineCopy.product = prodCopy;
    }
    return lineCopy;
  });

  return {
    ...rest,
    lines: sanitizedLines,
  };
}

export type RawQuotationLineForNegotiation = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: { toString(): string } | number | string;
  discountPercent: number;
  product: {
    id: string;
    name: string;
    sku: string;
    price: { toString(): string } | number | string;
  };
};

export type SerializedNegotiationLine = {
  id: string;
  productId: string;
  quantity: number;
  unitPrice: string;
  discountPercent: number;
  product: {
    id: string;
    name: string;
    sku: string;
    price: string;
  };
};

export type RawNegotiationRecord = {
  id: string;
  status: import("@prisma/client").NegotiationStatus;
  message: string;
  proposedChanges?: unknown;
  responseMessage: string | null;
  createdAt: Date | string;
  actedAt?: Date | string | null;
  createdBy?: { name: string; email: string } | null;
  actedBy?: { name: string; email: string } | null;
};

export type SerializedNegotiationRecord = {
  id: string;
  status: import("@prisma/client").NegotiationStatus;
  message: string;
  proposedChanges?: unknown;
  responseMessage: string | null;
  createdAt: string;
  actedAt: string | null;
  createdBy?: { name: string; email: string };
  actedBy?: { name: string; email: string } | null;
};

/**
 * Serializes quotation lines before passing them across the Server Component ->
 * Client Component boundary (e.g. NegotiationPanel), converting Prisma Decimal
 * values into plain strings and omitting internal/sensitive cost data.
 */
export function serializeNegotiationLines(
  lines: RawQuotationLineForNegotiation[]
): SerializedNegotiationLine[] {
  return lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toString(),
    discountPercent: line.discountPercent,
    product: {
      id: line.product.id,
      name: line.product.name,
      sku: line.product.sku,
      price: line.product.price.toString(),
    },
  }));
}

/**
 * Serializes negotiation records before passing them across the Server Component ->
 * Client Component boundary, ensuring Date instances are converted to ISO strings
 * and objects are plain JSON-compatible records.
 */
export function serializeNegotiations(
  negotiations: RawNegotiationRecord[]
): SerializedNegotiationRecord[] {
  return negotiations.map((n) => ({
    id: n.id,
    status: n.status,
    message: n.message,
    proposedChanges: n.proposedChanges ?? null,
    responseMessage: n.responseMessage,
    createdAt: typeof n.createdAt === "string" ? n.createdAt : n.createdAt.toISOString(),
    actedAt: n.actedAt
      ? typeof n.actedAt === "string"
        ? n.actedAt
        : n.actedAt.toISOString()
      : null,
    createdBy: n.createdBy
      ? { name: n.createdBy.name, email: n.createdBy.email }
      : undefined,
    actedBy: n.actedBy
      ? { name: n.actedBy.name, email: n.actedBy.email }
      : null,
  }));
}

