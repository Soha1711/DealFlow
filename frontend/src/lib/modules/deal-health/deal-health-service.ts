import type { Prisma, Role } from "@prisma/client";

import { db } from "@/lib/db";
import { assertCanViewDealHealth, canAccessDealHealthArea } from "./deal-health-guards";
import { forbidden, notFound } from "./deal-health-errors";
import { evaluateDealHealth } from "./deal-health-engine";
import type {
  DealHealthPortfolioItem,
  DealHealthPortfolioSummary,
  DealHealthResult,
} from "./deal-health-types";
import type { ListDealHealthQuery } from "./deal-health-validation";

export type DealHealthActor = {
  userId: string;
  role: Role;
};

const dealHealthQuotationInclude = {
  customer: {
    select: { id: true, name: true, tier: true, email: true },
  },
  salesRep: {
    select: { id: true, name: true, email: true },
  },
  lines: {
    include: {
      product: {
        select: {
          id: true,
          name: true,
          sku: true,
          cost: true,
          maxDiscountPercent: true,
          isRecurring: true,
          inventory: {
            select: { quantity: true, reservedQuantity: true },
          },
        },
      },
    },
  },
  approvals: {
    orderBy: { createdAt: "desc" as const },
    include: {
      approver: { select: { id: true, name: true } },
    },
  },
  fulfillments: {
    orderBy: { createdAt: "desc" as const },
    include: {
      lines: true,
    },
  },
  invoices: {
    orderBy: { createdAt: "desc" as const },
    include: {
      payments: { select: { status: true } },
    },
  },
  negotiations: {
    orderBy: { createdAt: "desc" as const },
  },
} satisfies Prisma.QuotationInclude;

/**
 * Retrieves the full deal health evaluation for a single quotation.
 * Enforces server-side authorization (sales reps can only view their own).
 */
export async function getDealHealth(
  quotationId: string,
  actor: DealHealthActor
): Promise<DealHealthResult & { customer: { id: string; name: string }; salesRep: { id: string; name: string } }> {
  if (!canAccessDealHealthArea(actor.role)) {
    throw forbidden("Customers cannot access deal health intelligence.");
  }

  const quotation = await db.quotation.findUnique({
    where: { id: quotationId },
    include: dealHealthQuotationInclude,
  });

  if (!quotation) {
    throw notFound("Quotation not found.");
  }

  assertCanViewDealHealth({
    role: actor.role,
    userId: actor.userId,
    salesRepId: quotation.salesRepId,
  });

  const evaluation = evaluateDealHealth({
    quotation: {
      id: quotation.id,
      quotationNumber: quotation.quotationNumber,
      status: quotation.status,
      subtotal: quotation.subtotal.toNumber(),
      discountTotal: quotation.discountTotal.toNumber(),
      total: quotation.total.toNumber(),
      margin: quotation.margin.toNumber(),
      validUntil: quotation.validUntil,
      riskScore: quotation.riskScore,
      riskLevel: quotation.riskLevel,
      requiredApprovalLevel: quotation.requiredApprovalLevel,
      createdAt: quotation.createdAt,
      updatedAt: quotation.updatedAt,
    },
    lines: quotation.lines.map((l) => ({
      id: l.id,
      productId: l.productId,
      quantity: l.quantity,
      unitPrice: l.unitPrice.toNumber(),
      discountPercent: l.discountPercent,
      margin: l.margin.toNumber(),
      isRecurring: l.isRecurring,
      product: l.product
        ? {
            id: l.product.id,
            name: l.product.name,
            sku: l.product.sku,
            cost: l.product.cost.toNumber(),
            maxDiscountPercent: l.product.maxDiscountPercent,
            isRecurring: l.product.isRecurring,
            inventory: l.product.inventory,
          }
        : null,
    })),
    approvals: quotation.approvals.map((a) => ({
      id: a.id,
      level: a.level,
      status: a.status,
      reason: a.reason,
      createdAt: a.createdAt,
      actedAt: a.actedAt,
      approver: a.approver,
    })),
    fulfillments: quotation.fulfillments.map((f) => ({
      id: f.id,
      status: f.status,
      lines: f.lines.map((fl) => ({
        id: fl.id,
        requestedQuantity: fl.requestedQuantity,
        allocatedQuantity: fl.allocatedQuantity,
        fulfilledQuantity: fl.fulfilledQuantity,
        backorderQuantity: fl.backorderQuantity,
      })),
    })),
    invoices: quotation.invoices.map((inv) => ({
      id: inv.id,
      invoiceNumber: inv.invoiceNumber,
      status: inv.status,
      total: inv.total.toNumber(),
      paidAmount: inv.paidAmount.toNumber(),
      dueDate: inv.dueDate,
      payments: inv.payments.map((p) => ({ status: p.status })),
    })),
    negotiations: quotation.negotiations.map((n) => ({
      id: n.id,
      status: n.status,
      message: n.message,
      createdAt: n.createdAt,
      actedAt: n.actedAt,
    })),
  });

  return {
    ...evaluation,
    customer: quotation.customer,
    salesRep: quotation.salesRep,
  };
}

/**
 * Lists quotations with evaluated deal health scores, filtering and portfolio KPI summary.
 */
export async function listPortfolioDealHealth(
  actor: DealHealthActor,
  params: ListDealHealthQuery
): Promise<{
  items: DealHealthPortfolioItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  summary: DealHealthPortfolioSummary;
}> {
  if (!canAccessDealHealthArea(actor.role)) {
    throw forbidden("Customers cannot access deal health intelligence.");
  }

  const where: Prisma.QuotationWhereInput = {
    ...(actor.role === "SALES_REP" ? { salesRepId: actor.userId } : {}),
    ...(params.salesRepId && actor.role !== "SALES_REP" ? { salesRepId: params.salesRepId } : {}),
    ...(params.q
      ? {
          OR: [
            { quotationNumber: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
            { salesRep: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const quotations = await db.quotation.findMany({
    where,
    include: dealHealthQuotationInclude,
    orderBy: { updatedAt: "desc" },
  });

  // Evaluate each quotation dynamically
  const evaluatedItems: DealHealthPortfolioItem[] = [];
  let totalPortfolioValue = 0;
  let healthyCount = 0;
  let atRiskCount = 0;
  let criticalCount = 0;
  let criticalAlertsCount = 0;
  let scoreSum = 0;

  for (const q of quotations) {
    const evaluation = evaluateDealHealth({
      quotation: {
        id: q.id,
        quotationNumber: q.quotationNumber,
        status: q.status,
        subtotal: q.subtotal.toNumber(),
        discountTotal: q.discountTotal.toNumber(),
        total: q.total.toNumber(),
        margin: q.margin.toNumber(),
        validUntil: q.validUntil,
        riskScore: q.riskScore,
        riskLevel: q.riskLevel,
        requiredApprovalLevel: q.requiredApprovalLevel,
        createdAt: q.createdAt,
        updatedAt: q.updatedAt,
      },
      lines: q.lines.map((l) => ({
        id: l.id,
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice.toNumber(),
        discountPercent: l.discountPercent,
        margin: l.margin.toNumber(),
        isRecurring: l.isRecurring,
        product: l.product
          ? {
              id: l.product.id,
              name: l.product.name,
              sku: l.product.sku,
              cost: l.product.cost.toNumber(),
              maxDiscountPercent: l.product.maxDiscountPercent,
              isRecurring: l.product.isRecurring,
              inventory: l.product.inventory,
            }
          : null,
      })),
      approvals: q.approvals.map((a) => ({
        id: a.id,
        level: a.level,
        status: a.status,
        reason: a.reason,
        createdAt: a.createdAt,
        actedAt: a.actedAt,
        approver: a.approver,
      })),
      fulfillments: q.fulfillments.map((f) => ({
        id: f.id,
        status: f.status,
        lines: f.lines.map((fl) => ({
          id: fl.id,
          requestedQuantity: fl.requestedQuantity,
          allocatedQuantity: fl.allocatedQuantity,
          fulfilledQuantity: fl.fulfilledQuantity,
          backorderQuantity: fl.backorderQuantity,
        })),
      })),
      invoices: q.invoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        status: inv.status,
        total: inv.total.toNumber(),
        paidAmount: inv.paidAmount.toNumber(),
        dueDate: inv.dueDate,
        payments: inv.payments.map((p) => ({ status: p.status })),
      })),
      negotiations: q.negotiations.map((n) => ({
        id: n.id,
        status: n.status,
        message: n.message,
        createdAt: n.createdAt,
        actedAt: n.actedAt,
      })),
    });

    const totalNum = q.total.toNumber();
    totalPortfolioValue += totalNum;
    scoreSum += evaluation.score;

    if (evaluation.level === "HEALTHY") healthyCount++;
    else if (evaluation.level === "AT_RISK") atRiskCount++;
    else if (evaluation.level === "CRITICAL") criticalCount++;

    const critAnomalies = evaluation.anomalies.filter((a) => a.severity === "CRITICAL");
    criticalAlertsCount += critAnomalies.length;

    const primaryRisk =
      evaluation.anomalies.length > 0
        ? evaluation.anomalies[0].title
        : evaluation.factors.find((f) => f.severity === "WARNING" || f.severity === "CRITICAL")?.title;

    evaluatedItems.push({
      id: q.id,
      quotationNumber: q.quotationNumber,
      status: q.status,
      total: totalNum,
      margin: q.margin.toNumber(),
      marginRate: totalNum > 0 ? q.margin.toNumber() / totalNum : 0,
      customer: q.customer,
      salesRep: q.salesRep,
      health: {
        score: evaluation.score,
        level: evaluation.level,
        primaryRisk,
        anomaliesCount: evaluation.anomalies.length,
      },
      validUntil: q.validUntil?.toISOString() ?? null,
      createdAt: q.createdAt.toISOString(),
    });
  }

  // Filter by requested level if specified (and not ALL)
  let filteredItems = evaluatedItems;
  if (params.level && params.level !== "ALL") {
    filteredItems = evaluatedItems.filter((i) => i.health.level === params.level);
  }

  // Sort by lowest health score first (so most critical deals appear on top)
  filteredItems.sort((a, b) => a.health.score - b.health.score);

  const total = filteredItems.length;
  const page = Math.max(1, params.page);
  const pageSize = Math.max(1, params.pageSize);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const clampedPage = Math.min(page, totalPages);
  const offset = (clampedPage - 1) * pageSize;
  const paginatedItems = filteredItems.slice(offset, offset + pageSize);

  const averageScore =
    quotations.length > 0 ? Math.round(scoreSum / quotations.length) : 100;

  return {
    items: paginatedItems,
    pagination: {
      page: clampedPage,
      pageSize,
      total,
      totalPages,
    },
    summary: {
      averageScore,
      healthyCount,
      atRiskCount,
      criticalCount,
      criticalAlertsCount,
      totalDeals: quotations.length,
      totalPortfolioValue,
    },
  };
}
