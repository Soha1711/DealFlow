import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { nextInvoiceNumber } from "./invoice-numbering";
import { dueDateForIssue } from "./billing-calculation";
import {
  assertCanManageBilling,
  assertCanViewBillingArea,
  assertCanViewBillingForQuotation,
  type BillingActor,
} from "./billing-guards";
import { conflict, notFound } from "./billing-errors";
import { resolveInvoiceTransition } from "./billing-transitions";
import type { ListBillingQuery } from "./billing-validation";

/**
 * Invoice service.
 *
 * Invoices are historical documents: their line items snapshot the finalized
 * amounts at the moment billing was created, so later changes to product
 * prices or discount policies can never alter a recorded invoice. Invoice
 * numbers are generated server-side inside the same transaction that creates
 * the invoice (advisory-lock serialized, like quotation numbers).
 *
 * This module intentionally has no `server-only` import so the workflow can be
 * exercised by integration tests. It is only imported from server code paths.
 */

export const invoiceInclude = {
  customer: { select: { id: true, name: true, email: true } },
  quotation: {
    select: {
      id: true,
      quotationNumber: true,
      salesRep: { select: { id: true, name: true } },
    },
  },
  subscription: {
    select: {
      id: true,
      status: true,
      recurringAmount: true,
      billingInterval: true,
      product: { select: { id: true, name: true } },
    },
  },
  lines: { orderBy: { createdAt: "asc" as const } },
  payments: { orderBy: { createdAt: "asc" as const } },
} as const;

type SalesRepScoped = { salesRepId: string | null };

async function loadSalesRepScope(
  invoice: { quotationId: string | null; subscriptionId: string | null }
): Promise<SalesRepScoped> {
  if (invoice.quotationId) {
    const quotation = await db.quotation.findUnique({
      where: { id: invoice.quotationId },
      select: { salesRepId: true },
    });
    return { salesRepId: quotation?.salesRepId ?? null };
  }
  return { salesRepId: null };
}

/**
 * Creates an invoice inside the caller's transaction. `billingKey` is the
 * idempotency anchor — unique at the DB level, so a retry of the same billing
 * operation can never create a second invoice.
 */
export async function createInvoiceInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    type: "ONE_TIME" | "RECURRING";
    customerId: string;
    quotationId: string | null;
    subscriptionId?: string | null;
    billingKey: string;
    lines: {
      productId: string | null;
      description: string;
      quantity: number;
      unitPrice: Prisma.Decimal;
      discountAmount: Prisma.Decimal;
      lineTotal: Prisma.Decimal;
      isRecurring: boolean;
    }[];
  }
) {
  const invoiceNumber = await nextInvoiceNumber(tx);

  const subtotal = input.lines.reduce(
    (sum, line) => sum.plus(line.unitPrice.times(line.quantity)),
    new Prisma.Decimal(0)
  );
  const discountTotal = input.lines.reduce(
    (sum, line) => sum.plus(line.discountAmount),
    new Prisma.Decimal(0)
  );
  const total = input.lines.reduce(
    (sum, line) => sum.plus(line.lineTotal),
    new Prisma.Decimal(0)
  );

  const invoice = await tx.invoice.create({
    data: {
      invoiceNumber,
      type: input.type,
      status: "DRAFT",
      customerId: input.customerId,
      quotationId: input.quotationId,
      subscriptionId: input.subscriptionId ?? null,
      billingKey: input.billingKey,
      subtotal: subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      discountTotal: discountTotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      total: total.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      lines: {
        create: input.lines.map((line) => ({
          productId: line.productId,
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          discountAmount: line.discountAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          lineTotal: line.lineTotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
          isRecurring: line.isRecurring,
        })),
      },
    },
    include: { lines: true },
  });

  return invoice;
}

export type ListInvoicesParams = Pick<ListBillingQuery, "page" | "pageSize" | "q" | "status" | "type">;

export async function listInvoices(actor: BillingActor, params: ListInvoicesParams) {
  assertCanViewBillingArea(actor.role);

  const where: Prisma.InvoiceWhereInput = {
    ...(params.status ? { status: params.status as never } : {}),
    ...(params.type ? { type: params.type as never } : {}),
    // Sales reps only ever see billing for their own quotations.
    ...(actor.role === "SALES_REP"
      ? { quotation: { salesRepId: actor.userId } }
      : {}),
    ...(params.q
      ? {
          OR: [
            { invoiceNumber: { contains: params.q, mode: "insensitive" } },
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await db.invoice.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      customer: { select: { name: true } },
      quotation: { select: { quotationNumber: true } },
      subscription: { select: { id: true } },
    },
  });

  return {
    data,
    pagination: { page, pageSize: params.pageSize, total, totalPages },
  };
}

export async function getInvoice(id: string, actor: BillingActor) {
  assertCanViewBillingArea(actor.role);

  const invoice = await db.invoice.findUnique({
    where: { id },
    include: invoiceInclude,
  });
  if (!invoice) {
    throw notFound("Invoice not found.");
  }

  const scope = await loadSalesRepScope(invoice);
  if (!scope.salesRepId) {
    // Invoices without a quotation (unexpected in this phase) are visible to
    // finance/admin/manager only.
    if (actor.role !== "FINANCE" && actor.role !== "ADMIN" && actor.role !== "SALES_MANAGER") {
      throw notFound("Invoice not found.");
    }
  } else {
    assertCanViewBillingForQuotation(actor, scope.salesRepId);
  }

  return invoice;
}

/**
 * Transitions an invoice DRAFT → ISSUED and stamps issue/due dates. When the
 * invoice belongs to a subscription billing schedule, the schedule moves
 * SCHEDULED → DUE.
 */
export async function issueInvoice(id: string, actor: BillingActor) {
  assertCanManageBilling(actor.role);

  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw notFound("Invoice not found.");
    }

    const transition = resolveInvoiceTransition(
      { status: invoice.status, paidAmount: invoice.paidAmount, total: invoice.total },
      "issue"
    );
    if (!transition.ok) {
      throw conflict(transition.message, "INVOICE_STATE_CONFLICT");
    }

    const issueDate = new Date();
    const updated = await tx.invoice.update({
      where: { id },
      data: {
        status: transition.nextStatus,
        issueDate,
        dueDate: dueDateForIssue(issueDate),
      },
      include: invoiceInclude,
    });

    // A recurring invoice belongs to a billing schedule (schedule holds the
    // invoice FK); issuing it moves the schedule SCHEDULED → DUE.
    const schedule = await tx.billingSchedule.findUnique({
      where: { invoiceId: id },
      select: { id: true, status: true },
    });
    if (schedule && schedule.status === "SCHEDULED") {
      await tx.billingSchedule.update({
        where: { id: schedule.id },
        data: { status: "DUE" },
      });
    }

    return updated;
  });
}

/**
 * Voids a DRAFT or ISSUED invoice that has no recorded payments. Terminal.
 */
export async function voidInvoice(id: string, actor: BillingActor) {
  assertCanManageBilling(actor.role);

  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({
      where: { id },
      include: { schedule: true },
    });
    if (!invoice) {
      throw notFound("Invoice not found.");
    }

    const transition = resolveInvoiceTransition(
      { status: invoice.status, paidAmount: invoice.paidAmount, total: invoice.total },
      "void"
    );
    if (!transition.ok) {
      throw conflict(transition.message, "INVOICE_STATE_CONFLICT");
    }

    const updated = await tx.invoice.update({
      where: { id },
      data: { status: transition.nextStatus },
      include: invoiceInclude,
    });

    // Recurring invoices void their schedule (no double-billing on retry).
    const schedule = await tx.billingSchedule.findUnique({
      where: { invoiceId: id },
      select: { id: true },
    });
    if (schedule) {
      await tx.billingSchedule.update({
        where: { id: schedule.id },
        data: { status: "CANCELLED" },
      });
    }

    return updated;
  });
} 