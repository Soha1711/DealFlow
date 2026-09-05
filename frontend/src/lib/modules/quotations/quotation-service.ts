import "server-only";

import type { Prisma, Role } from "@prisma/client";

import { db } from "@/lib/db";
import {
  badRequest,
  conflict,
  forbidden,
  notFound,
} from "@/lib/modules/quotations/errors";
import { nextQuotationNumber } from "@/lib/modules/quotations/numbering";
import {
  calculateLinePricing,
  calculateQuotationTotals,
  roundMoney,
  toMoney,
} from "@/lib/modules/quotations/pricing";
import type { QuotationLineInput } from "@/lib/modules/quotations/validation";

/**
 * Server-side quotation business logic. Every write recalculates all monetary
 * totals with the pricing engine — values sent by the client are never
 * persisted verbatim. Multi-record writes run inside interactive Prisma
 * transactions so numbering, pricing and inserts are atomic.
 */

export type QuotationWithRelations = NonNullable<
  Awaited<ReturnType<typeof getQuotation>>
>;

type OwnedContext = {
  userId: string;
  role: Role;
};

const quotationInclude = {
  customer: true,
  salesRep: { select: { id: true, name: true, email: true } },
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: { product: true },
  },
} as const;

function assertEditable(
  existing: { status: string; salesRepId: string },
  context: OwnedContext,
  action: string
) {
  if (existing.status !== "DRAFT") {
    throw conflict(`Only DRAFT quotations can be ${action}.`);
  }
  if (existing.salesRepId !== context.userId) {
    throw forbidden("You can only modify your own quotations.");
  }
}

/**
 * Resolves products and computes authoritative, Decimal-safe pricing for a
 * set of lines. Throws 400 when any product is unknown.
 */
async function priceLines(
  tx: Prisma.TransactionClient,
  lines: QuotationLineInput[]
) {
  const products = await tx.product.findMany({
    where: { id: { in: lines.map((line) => line.productId) } },
  });
  const productById = new Map(products.map((product) => [product.id, product]));

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

export type CreateQuotationInput = {
  salesRepId: string;
  customerId: string;
  validUntil?: Date | null;
  lines: QuotationLineInput[];
};

export async function createQuotation(input: CreateQuotationInput) {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true },
    });
    if (!customer) {
      throw badRequest("Unknown customer.", "UNKNOWN_CUSTOMER");
    }

    const quotationNumber = await nextQuotationNumber(tx);
    const pricedLines = await priceLines(tx, input.lines);
    const totals = calculateQuotationTotals(pricedLines);

    return tx.quotation.create({
      data: {
        quotationNumber,
        customerId: input.customerId,
        salesRepId: input.salesRepId,
        status: "DRAFT",
        validUntil: input.validUntil ?? null,
        subtotal: totals.subtotal,
        discountTotal: totals.discountTotal,
        total: totals.total,
        margin: totals.margin,
        lines: {
          create: pricedLines.map((line) => ({
            productId: line.productId,
            quantity: line.quantity,
            unitPrice: line.unitPrice,
            discountPercent: line.discountPercent,
            discountAmount: line.discountAmount,
            lineTotal: line.lineTotal,
            margin: line.margin,
            isRecurring: line.isRecurring,
          })),
        },
      },
      include: quotationInclude,
    });
  });
}

export async function getQuotation(id: string) {
  return db.quotation.findUnique({
    where: { id },
    include: quotationInclude,
  });
}

export type ListQuotationsParams = {
  role: OwnedContext["role"];
  userId: string;
  page: number;
  pageSize: number;
  search?: string;
  status?: "DRAFT" | "PENDING_APPROVAL";
};

export async function listQuotations(params: ListQuotationsParams) {
  const where: Prisma.QuotationWhereInput = {
    ...(params.role === "SALES_REP" ? { salesRepId: params.userId } : {}),
    ...(params.status ? { status: params.status } : {}),
    ...(params.search
      ? {
          OR: [
            { quotationNumber: { contains: params.search, mode: "insensitive" } },
            { customer: { name: { contains: params.search, mode: "insensitive" } } },
            { salesRep: { name: { contains: params.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await db.quotation.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  // Clamp out-of-range page numbers instead of returning an empty page.
  const page = Math.min(params.page, totalPages);

  const data = await db.quotation.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      customer: true,
      salesRep: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
  });

  return {
    data,
    pagination: {
      page,
      pageSize: params.pageSize,
      total,
      totalPages,
    },
  };
}

export type UpdateDraftQuotationInput = {
  customerId?: string;
  validUntil?: Date | null;
  lines?: QuotationLineInput[];
};

export async function updateDraftQuotation(
  id: string,
  context: OwnedContext,
  input: UpdateDraftQuotationInput
) {
  const existing = await db.quotation.findUnique({ where: { id } });
  if (!existing) {
    throw notFound("Quotation not found.");
  }
  assertEditable(existing, context, "edited");

  return db.$transaction(async (tx) => {
    if (input.customerId !== undefined) {
      const customer = await tx.customer.findUnique({
        where: { id: input.customerId },
        select: { id: true },
      });
      if (!customer) {
        throw badRequest("Unknown customer.", "UNKNOWN_CUSTOMER");
      }
    }

    let pricedLines: Awaited<ReturnType<typeof priceLines>> | undefined;
    if (input.lines !== undefined) {
      pricedLines = await priceLines(tx, input.lines);
      await tx.quotationLine.deleteMany({ where: { quotationId: id } });
      await tx.quotationLine.createMany({
        data: pricedLines.map((line) => ({
          quotationId: id,
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
    }

    const totals = pricedLines
      ? calculateQuotationTotals(pricedLines)
      : {
          subtotal: existing.subtotal,
          discountTotal: existing.discountTotal,
          total: existing.total,
          margin: existing.margin,
        };

    return tx.quotation.update({
      where: { id },
      data: {
        ...(input.customerId !== undefined ? { customerId: input.customerId } : {}),
        ...(input.validUntil !== undefined
          ? { validUntil: input.validUntil === null ? null : input.validUntil }
          : {}),
        ...(pricedLines ? totals : {}),
      },
      include: quotationInclude,
    });
  });
}

export async function submitQuotation(id: string, context: OwnedContext) {
  const existing = await db.quotation.findUnique({
    where: { id },
    select: { id: true, status: true, salesRepId: true },
  });
  if (!existing) {
    throw notFound("Quotation not found.");
  }
  if (existing.status !== "DRAFT") {
    throw conflict("Only DRAFT quotations can be submitted.");
  }
  if (existing.salesRepId !== context.userId) {
    throw forbidden("You can only submit your own quotations.");
  }

  return db.quotation.update({
    where: { id },
    data: { status: "PENDING_APPROVAL" },
    include: quotationInclude,
  });
}