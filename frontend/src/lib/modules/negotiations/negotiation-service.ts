import { Prisma, type Role } from "@prisma/client";

import { db } from "@/lib/db";
import { routeSubmittedQuotation } from "@/lib/modules/approvals/approval-service";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "./negotiation-errors";
import {
  canSalesRepActOnNegotiation,
  sanitizeQuotationForCustomer,
} from "./negotiation-guards";
import {
  canCustomerAcceptQuotation,
  canInitiateNegotiation,
  resolveNegotiationStatusTransition,
} from "./negotiation-transitions";
import type {
  AcceptNegotiationInput,
  CounterNegotiationInput,
  CustomerAcceptCounterInput,
  CustomerRejectCounterInput,
  ListPortalQuotationsQuery,
  RejectNegotiationInput,
  RespondNegotiationInput,
  SubmitNegotiationInput,
} from "./negotiation-validation";
import {
  calculateLinePricing,
  calculateQuotationTotals,
  roundMoney,
  toMoney,
} from "@/lib/modules/quotations/pricing";
import type { QuotationLineInput } from "@/lib/modules/quotations/validation";

/**
 * Service handling Customer Portal queries and Quotation Negotiation workflows.
 *
 * Reuses:
 * - Pricing engine: `calculateLinePricing` & `calculateQuotationTotals` from `pricing.ts`
 * - Approval routing & discount-risk scoring: `routeSubmittedQuotation` from `approval-service.ts`
 */

const portalQuotationInclude = {
  customer: { select: { id: true, name: true, email: true, tier: true } },
  salesRep: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          category: true,
          price: true,
          isRecurring: true,
        },
      },
    },
  },
  negotiations: {
    orderBy: { createdAt: "asc" as const },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      actedBy: { select: { id: true, name: true, email: true } },
    },
  },
} as const;

/**
 * Lists quotations visible in the Customer Portal for a specific customer.
 */
export async function listCustomerQuotations(
  customerId: string,
  params: ListPortalQuotationsQuery
) {
  const allowedStatuses = [
    "APPROVED",
    "UNDER_NEGOTIATION",
    "CONFIRMED",
    "FULFILLING",
    "COMPLETED",
  ] as const;

  const where: Prisma.QuotationWhereInput = {
    customerId,
    status: params.status
      ? params.status
      : { in: allowedStatuses as unknown as import("@prisma/client").QuotationStatus[] },
    ...(params.search
      ? {
          OR: [
            { quotationNumber: { contains: params.search, mode: "insensitive" } },
            { salesRep: { name: { contains: params.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await db.quotation.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.quotation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      customer: { select: { id: true, name: true, email: true, tier: true } },
      salesRep: { select: { id: true, name: true, email: true } },
      _count: { select: { lines: true } },
      negotiations: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: {
          id: true,
          status: true,
          message: true,
          responseMessage: true,
          createdAt: true,
          actedAt: true,
        },
      },
    },
  });

  const sanitizedData = data.map((q) => {
    const copy = { ...q };
    delete (copy as { margin?: unknown }).margin;
    delete (copy as { riskScore?: unknown }).riskScore;
    delete (copy as { riskLevel?: unknown }).riskLevel;
    delete (copy as { requiredApprovalLevel?: unknown }).requiredApprovalLevel;
    return copy;
  });

  return {
    data: sanitizedData,
    pagination: {
      page,
      pageSize: params.pageSize,
      total,
      totalPages,
    },
  };
}

/**
 * Retrieves a single quotation for the Customer Portal with strict IDOR protection.
 */
export async function getCustomerQuotation(
  quotationId: string,
  customerId: string
) {
  const quotation = await db.quotation.findUnique({
    where: { id: quotationId },
    include: portalQuotationInclude,
  });

  if (!quotation || quotation.customerId !== customerId) {
    throw notFound("Quotation not found.");
  }

  // Internal draft/review states are not visible to the customer
  if (
    quotation.status === "DRAFT" ||
    quotation.status === "DISCOUNT_CHECK" ||
    quotation.status === "PENDING_APPROVAL" ||
    quotation.status === "PENDING_MANAGER" ||
    quotation.status === "PENDING_FINANCE"
  ) {
    throw notFound("Quotation not found.");
  }

  return sanitizeQuotationForCustomer(quotation);
}

/**
 * Customer submits a negotiation or change request on an APPROVED quotation.
 */
export async function submitCustomerNegotiation(
  quotationId: string,
  customerId: string,
  userId: string,
  input: SubmitNegotiationInput
) {
  return db.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, customerId: true, status: true },
    });

    if (!quotation || quotation.customerId !== customerId) {
      throw notFound("Quotation not found.");
    }

    if (!canInitiateNegotiation(quotation.status)) {
      throw conflict(
        `Only approved quotations can be negotiated. Current status: ${quotation.status}.`
      );
    }

    // Ensure no pending negotiation is currently active
    const activeNegotiation = await tx.quotationNegotiation.findFirst({
      where: {
        quotationId,
        status: { in: ["PENDING", "COUNTERED"] },
      },
    });

    if (activeNegotiation) {
      throw conflict(
        "There is already an active negotiation round for this quotation."
      );
    }

    // Transition quotation to UNDER_NEGOTIATION
    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: "UNDER_NEGOTIATION" },
    });

    // Create the negotiation record
    const negotiation = await tx.quotationNegotiation.create({
      data: {
        quotationId,
        customerId,
        createdById: userId,
        status: "PENDING",
        message: input.message,
        proposedChanges:
          input.targetTotal || input.proposedLines
            ? {
                targetTotal: input.targetTotal,
                proposedLines: input.proposedLines,
              }
            : undefined,
      },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
      },
    });

    return negotiation;
  });
}

/**
 * Customer accepts an APPROVED quotation as-is.
 */
export async function customerAcceptQuotation(
  quotationId: string,
  customerId: string,
  _userId: string
) {
  void _userId;
  return db.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, customerId: true, status: true },
    });

    if (!quotation || quotation.customerId !== customerId) {
      throw notFound("Quotation not found.");
    }

    if (!canCustomerAcceptQuotation(quotation.status)) {
      throw conflict(
        `Only approved quotations can be accepted. Current status: ${quotation.status}.`
      );
    }

    return tx.quotation.update({
      where: { id: quotationId },
      data: { status: "CONFIRMED" },
      include: portalQuotationInclude,
    });
  });
}

/**
 * Customer responds to a counter-proposal from the sales representative.
 */
export async function customerRespondToCounter(
  negotiationId: string,
  customerId: string,
  _userId: string,
  input: RespondNegotiationInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: { quotation: { select: { id: true, status: true } } },
    });

    if (!negotiation || negotiation.customerId !== customerId) {
      throw notFound("Negotiation not found.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "respond"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const updated = await tx.quotationNegotiation.update({
      where: { id: negotiationId },
      data: {
        status: "PENDING",
        message: `${negotiation.message}\n\n[Customer Update]: ${input.message}`,
      },
    });

    return updated;
  });
}

/**
 * Customer accepts a sales representative's counter-offer.
 * Updates the negotiation to ACCEPTED and confirms the quotation (CONFIRMED).
 */
export async function customerAcceptCounter(
  negotiationId: string,
  customerId: string,
  userId: string,
  input?: CustomerAcceptCounterInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: {
        quotation: {
          select: { id: true, customerId: true, status: true },
        },
      },
    });

    if (
      !negotiation ||
      negotiation.customerId !== customerId ||
      negotiation.quotation.customerId !== customerId
    ) {
      throw notFound("Negotiation not found.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "accept"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const claimed = await tx.quotationNegotiation.updateMany({
      where: { id: negotiationId, status: "COUNTERED" },
      data: {
        status: "ACCEPTED",
        responseMessage: input?.message
          ? `${negotiation.responseMessage ? negotiation.responseMessage + "\n\n" : ""}[Customer Accepted]: ${input.message}`
          : negotiation.responseMessage,
        actedById: userId,
        actedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict("Negotiation was already updated by another action.");
    }

    const updatedQuotation = await tx.quotation.update({
      where: { id: negotiation.quotationId },
      data: { status: "CONFIRMED" },
      include: portalQuotationInclude,
    });

    return sanitizeQuotationForCustomer(updatedQuotation);
  });
}

/**
 * Customer declines / rejects a sales representative's counter-offer.
 * Updates the negotiation to REJECTED and reverts the quotation to APPROVED
 * so the customer can accept the original quotation or start fresh.
 */
export async function customerRejectCounter(
  negotiationId: string,
  customerId: string,
  userId: string,
  input?: CustomerRejectCounterInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: {
        quotation: {
          select: { id: true, customerId: true, status: true },
        },
      },
    });

    if (
      !negotiation ||
      negotiation.customerId !== customerId ||
      negotiation.quotation.customerId !== customerId
    ) {
      throw notFound("Negotiation not found.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "reject"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const claimed = await tx.quotationNegotiation.updateMany({
      where: { id: negotiationId, status: "COUNTERED" },
      data: {
        status: "REJECTED",
        responseMessage: input?.reason
          ? `${negotiation.responseMessage ? negotiation.responseMessage + "\n\n" : ""}[Customer Declined]: ${input.reason}`
          : negotiation.responseMessage,
        actedById: userId,
        actedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict("Negotiation was already updated by another action.");
    }

    const updatedQuotation = await tx.quotation.update({
      where: { id: negotiation.quotationId },
      data: { status: "APPROVED" },
      include: portalQuotationInclude,
    });

    return sanitizeQuotationForCustomer(updatedQuotation);
  });
}


export type SalesActor = {
  userId: string;
  role: Role;
};

/**
 * Sales Rep counters a customer negotiation request.
 */
export async function counterNegotiation(
  negotiationId: string,
  actor: SalesActor,
  input: CounterNegotiationInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: { quotation: { select: { id: true, status: true, salesRepId: true } } },
    });

    if (!negotiation) {
      throw notFound("Negotiation not found.");
    }

    if (
      !canSalesRepActOnNegotiation({
        role: actor.role,
        userId: actor.userId,
        salesRepId: negotiation.quotation.salesRepId,
        quotationStatus: negotiation.quotation.status,
      })
    ) {
      throw forbidden("You are not authorized to act on this negotiation.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "counter"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const claimed = await tx.quotationNegotiation.updateMany({
      where: { id: negotiationId, status: "PENDING" },
      data: {
        status: "COUNTERED",
        responseMessage: input.message,
        actedById: actor.userId,
        actedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict("Negotiation was already updated by another action.");
    }

    return tx.quotationNegotiation.findUniqueOrThrow({
      where: { id: negotiationId },
      include: {
        actedBy: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

/**
 * Sales Rep rejects a customer negotiation request, reverting quotation to APPROVED.
 */
export async function rejectNegotiation(
  negotiationId: string,
  actor: SalesActor,
  input: RejectNegotiationInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: { quotation: { select: { id: true, status: true, salesRepId: true } } },
    });

    if (!negotiation) {
      throw notFound("Negotiation not found.");
    }

    if (
      !canSalesRepActOnNegotiation({
        role: actor.role,
        userId: actor.userId,
        salesRepId: negotiation.quotation.salesRepId,
        quotationStatus: negotiation.quotation.status,
      })
    ) {
      throw forbidden("You are not authorized to act on this negotiation.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "reject"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const claimed = await tx.quotationNegotiation.updateMany({
      where: { id: negotiationId, status: { in: ["PENDING", "COUNTERED"] } },
      data: {
        status: "REJECTED",
        responseMessage: input.reason,
        actedById: actor.userId,
        actedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict("Negotiation was already updated by another action.");
    }

    // Revert quotation to APPROVED
    await tx.quotation.update({
      where: { id: negotiation.quotationId },
      data: { status: "APPROVED" },
    });

    return tx.quotationNegotiation.findUniqueOrThrow({
      where: { id: negotiationId },
      include: {
        actedBy: { select: { id: true, name: true, email: true } },
      },
    });
  });
}

/**
 * Helper to reprice lines using the authoritative Phase 2 pricing engine.
 */
async function priceLines(
  tx: Prisma.TransactionClient,
  lines: QuotationLineInput[]
) {
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
  });
  const productById = new Map(products.map((p) => [p.id, p]));

  const missing = lines
    .filter((line) => !productById.has(line.productId))
    .map((line) => line.productId);
  if (missing.length > 0) {
    throw badRequest(`Unknown product(s): ${missing.join(", ")}`, "UNKNOWN_PRODUCT");
  }

  return lines.map((line) => {
    const product = productById.get(line.productId)!;
    const pricing = calculateLinePricing({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      cost: product.cost,
    });
    return {
      productId: line.productId,
      quantity: line.quantity,
      unitPrice: roundMoney(toMoney(line.unitPrice)),
      discountPercent: line.discountPercent,
      isRecurring: product.isRecurring,
      ...pricing,
    };
  });
}

/**
 * Sales Rep accepts a negotiation request.
 *
 * If commercial changes (lines) are provided:
 * - Line pricing is recalculated using `pricing.ts`
 * - Quotation totals are recalculated
 * - Re-runs discount-risk engine and approval routing via `routeSubmittedQuotation(tx, quoteId)`!
 *   (If risk is LOW -> APPROVED; if risk is higher -> PENDING_MANAGER)
 *
 * If no line changes are provided:
 * - Quotation returns to APPROVED.
 */
export async function acceptNegotiation(
  negotiationId: string,
  actor: SalesActor,
  input: AcceptNegotiationInput
) {
  return db.$transaction(async (tx) => {
    const negotiation = await tx.quotationNegotiation.findUnique({
      where: { id: negotiationId },
      include: { quotation: { select: { id: true, status: true, salesRepId: true } } },
    });

    if (!negotiation) {
      throw notFound("Negotiation not found.");
    }

    if (
      !canSalesRepActOnNegotiation({
        role: actor.role,
        userId: actor.userId,
        salesRepId: negotiation.quotation.salesRepId,
        quotationStatus: negotiation.quotation.status,
      })
    ) {
      throw forbidden("You are not authorized to act on this negotiation.");
    }

    const transition = resolveNegotiationStatusTransition(
      negotiation.status,
      "accept"
    );
    if (!transition.ok) {
      throw conflict(transition.message);
    }

    const claimed = await tx.quotationNegotiation.updateMany({
      where: { id: negotiationId, status: { in: ["PENDING", "COUNTERED"] } },
      data: {
        status: "ACCEPTED",
        responseMessage: input.message ?? "Accepted by sales representative.",
        actedById: actor.userId,
        actedAt: new Date(),
      },
    });

    if (claimed.count === 0) {
      throw conflict("Negotiation was already updated by another action.");
    }

    const quotationId = negotiation.quotationId;

    if (input.lines && input.lines.length > 0) {
      // 1. Authoritatively reprice lines with Phase 2 pricing engine
      const pricedLines = await priceLines(tx, input.lines);
      const totals = calculateQuotationTotals(pricedLines);

      // 2. Replace lines in database
      await tx.quotationLine.deleteMany({ where: { quotationId } });
      await tx.quotationLine.createMany({
        data: pricedLines.map((line) => ({
          quotationId,
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          margin: line.margin,
          isRecurring: line.isRecurring,
        })),
      });

      // 3. Update totals
      await tx.quotation.update({
        where: { id: quotationId },
        data: totals,
      });

      // 4. Re-run Phase 3 discount governance & approval workflow
      await routeSubmittedQuotation(tx, quotationId);
    } else {
      // Accepted as-is without changing commercial values -> APPROVED
      await tx.quotation.update({
        where: { id: quotationId },
        data: { status: "APPROVED" },
      });
    }

    return tx.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      include: {
        customer: true,
        salesRep: { select: { id: true, name: true, email: true } },
        lines: {
          orderBy: { createdAt: "asc" },
          include: { product: true },
        },
        negotiations: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });
  });
}

/**
 * Lists all negotiations for a given quotation (used on sales quotation detail page).
 */
export async function listNegotiationsForQuotation(quotationId: string) {
  return db.quotationNegotiation.findMany({
    where: { quotationId },
    orderBy: { createdAt: "desc" },
    include: {
      createdBy: { select: { id: true, name: true, email: true } },
      actedBy: { select: { id: true, name: true, email: true } },
    },
  });
}
