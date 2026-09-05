import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { conflict, forbidden, notFound } from "./billing-errors";
import {
  assertCanManageBilling,
  assertCanViewBillingArea,
  type BillingActor,
} from "./billing-guards";
import { createInvoiceInTransaction, invoiceInclude } from "./invoice-service";
import {
  createSubscriptionInTransaction,
  recurringIntervalForProduct,
} from "./subscription-service";
import { isBillableQuotationStatus } from "./billing-transitions";
import { listInvoices } from "./invoice-service";
import { listSubscriptions } from "./subscription-service";
import type { ListBillingQuery } from "./billing-validation";

/**
 * Hybrid billing orchestrator.
 *
 * `createBillingFromQuotation` is the single Phase 6 entry point that turns a
 * finalized quotation into billing objects:
 *
 *   - one-time (non-recurring) lines  → ONE_TIME invoice with historical
 *     line snapshots,
 *   - recurring lines                 → one Subscription each, with its first
 *     billing schedule, and the first period's RECURRING invoice.
 *
 * Everything runs in one transaction: if any step fails the whole billing run
 * rolls back — no invoice-without-subscription or subscription-without-invoice
 * states can survive. Idempotency is enforced two ways: an advisory lock on
 * the quotation serializes concurrent "Generate billing" clicks, and DB
 * unique constraints (`invoice.billingKey`, subscription's unique quotation
 * line) make a duplicate billing run impossible.
 */

/** Deterministic FNV-1a advisory-lock key for a quotation id. */
function quotationLockKey(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

type BillingSubscriptionWithRelations = NonNullable<
  Awaited<ReturnType<typeof getBillingSubscriptionByIdTx>>
>;

export type CreateBillingResult = {
  oneTimeInvoice: NonNullable<Awaited<ReturnType<typeof getBillingInvoiceByIdTx>>> | null;
  subscriptions: BillingSubscriptionWithRelations[];
  type: "ONE_TIME" | "RECURRING" | "HYBRID";
};

async function getBillingInvoiceByIdTx(tx: Prisma.TransactionClient, id: string) {
  return tx.invoice.findUnique({ where: { id }, include: invoiceInclude });
}

async function getBillingSubscriptionByIdTx(tx: Prisma.TransactionClient, id: string) {
  return tx.subscription.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, name: true } },
      product: { select: { id: true, name: true, sku: true } },
      quotation: {
        select: {
          id: true,
          quotationNumber: true,
          salesRep: { select: { id: true, name: true } },
        },
      },
      subscriptionPlan: { select: { id: true, name: true, billingInterval: true } },
      schedules: {
        orderBy: { periodStart: "asc" },
        include: { invoice: { select: { id: true, invoiceNumber: true, status: true } } },
      },
    },
  });
}

export async function createBillingFromQuotation(
  quotationId: string,
  actor: BillingActor
): Promise<CreateBillingResult> {
  assertCanManageBilling(actor.role);

  return db.$transaction(async (tx) => {
    // Serialize concurrent billing attempts for the same quotation.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${quotationLockKey(quotationId)})`;

    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      include: {
        lines: {
          orderBy: { createdAt: "asc" },
          include: { product: { include: { subscriptionPlan: true } } },
        },
      },
    });
    if (!quotation) {
      throw notFound("Quotation not found.");
    }

    // Billing is only possible once the quotation has cleared governance.
    if (!isBillableQuotationStatus(quotation.status)) {
      throw conflict(
        "Billing may only be created for quotations that have been approved (or are confirmed/fulfilling/completed).",
        "QUOTATION_NOT_BILLABLE"
      );
    }

    // Idempotency check: a one-time invoice for this quotation already exists
    // (or subscriptions were already created from its lines).
    const existingOneTime = await tx.invoice.findUnique({
      where: { billingKey: `ot:${quotationId}` },
      select: { id: true },
    });
    if (existingOneTime) {
      throw conflict(
        "Billing has already been generated for this quotation.",
        "BILLING_ALREADY_CREATED"
      );
    }
    const existingSubscription = await tx.subscription.findFirst({
      where: { quotationId },
      select: { id: true },
    });
    if (existingSubscription) {
      throw conflict(
        "Billing has already been generated for this quotation.",
        "BILLING_ALREADY_CREATED"
      );
    }

    const oneTimeLines = quotation.lines.filter((line) => !line.product.isRecurring);
    const recurringLines = quotation.lines.filter((line) => line.product.isRecurring);

    // ---- One-time portion ------------------------------------------------
    let oneTimeInvoiceId: string | null = null;
    if (oneTimeLines.length > 0) {
      const invoice = await createInvoiceInTransaction(tx, {
        type: "ONE_TIME",
        customerId: quotation.customerId,
        quotationId,
        subscriptionId: null,
        billingKey: `ot:${quotationId}`,
        lines: oneTimeLines.map((line) => ({
          productId: line.productId,
          description: `${line.product.name} (${line.product.sku})`,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          isRecurring: false,
        })),
      });
      oneTimeInvoiceId = invoice.id;
    }

    // ---- Recurring portion ----------------------------------------------
    const subscriptionIds: string[] = [];
    for (const line of recurringLines) {
      const billingInterval = recurringIntervalForProduct(line.product);
      const subscription = await createSubscriptionInTransaction(tx, {
        customerId: quotation.customerId,
        quotationId,
        quotationLineId: line.id,
        productId: line.productId,
        subscriptionPlanId: line.product.subscriptionPlanId,
        recurringAmount: line.lineTotal,
        billingInterval,
      });
      subscriptionIds.push(subscription.id);

      // The first billing period's invoice is generated immediately so a
      // hybrid quote yields both a one-time invoice and a recurring invoice
      // for the subscription's first cycle.
      const schedule = await tx.billingSchedule.findFirstOrThrow({
        where: { subscriptionId: subscription.id },
        orderBy: { periodStart: "asc" },
      });
      const invoice = await createInvoiceInTransaction(tx, {
        type: "RECURRING",
        customerId: quotation.customerId,
        quotationId,
        subscriptionId: subscription.id,
        billingKey: `schedule:${schedule.id}`,
        lines: [
          {
            productId: line.productId,
            description: `${line.product.name} — ${billingInterval.toLowerCase()} subscription`,
            quantity: 1,
            unitPrice: line.lineTotal,
            discountAmount: new Prisma.Decimal(0),
            lineTotal: line.lineTotal,
            isRecurring: true,
          },
        ],
      });
      await tx.billingSchedule.update({
        where: { id: schedule.id },
        data: { invoiceId: invoice.id, status: "DUE" },
      });
    }

    return {
      type: oneTimeLines.length > 0 && recurringLines.length > 0
        ? "HYBRID"
        : recurringLines.length > 0
          ? "RECURRING"
          : "ONE_TIME",
      oneTimeInvoice: oneTimeInvoiceId
        ? await getBillingInvoiceByIdTx(tx, oneTimeInvoiceId)
        : null,
      subscriptions: (
        await Promise.all(
          subscriptionIds.map((id) => getBillingSubscriptionByIdTx(tx, id))
        )
      ).filter((sub): sub is NonNullable<typeof sub> => sub !== null),
    };
  });
}

/** Reads all billing records tied to a quotation (detail-page display). */
export async function getBillingForQuotation(
  quotationId: string,
  actor: BillingActor
) {
  assertCanViewBillingArea(actor.role);

  const [invoices, subscriptions] = await Promise.all([
    db.invoice.findMany({
      where: { quotationId },
      orderBy: { createdAt: "asc" },
      include: invoiceInclude,
    }),
    db.subscription.findMany({
      where: { quotationId },
      orderBy: { createdAt: "asc" },
      include: {
        customer: { select: { id: true, name: true } },
        product: { select: { id: true, name: true } },
        subscriptionPlan: { select: { id: true, name: true, billingInterval: true } },
        quotation: { select: { id: true, quotationNumber: true, salesRepId: true } },
      },
    }),
  ]);

  // Sales reps may only see billing on quotations they own.
  if (actor.role === "SALES_REP") {
    const ownedByRep = (salesRepId: string | undefined) =>
      salesRepId === actor.userId;
    const invoicesVisible = invoices.every((invoice) =>
      ownedByRep(invoice.quotation?.salesRep?.id)
    );
    const subscriptionsVisible = subscriptions.every((subscription) =>
      ownedByRep(subscription.quotation.salesRepId)
    );
    if (!invoicesVisible || !subscriptionsVisible) {
      throw forbidden("You cannot view this quotation's billing.", "BILLING_FORBIDDEN");
    }
  }

  return { invoices, subscriptions };
}

/**
 * Approved/finalized quotations that have no billing artifacts yet — the
 * pool Finance/Admin can generate billing from. Server-driven so the UI never
 * guesses eligibility.
 */
export async function listBillableQuotations(actor: BillingActor) {
  assertCanManageBilling(actor.role);

  const quotations = await db.quotation.findMany({
    where: {
      status: { in: ["APPROVED", "CONFIRMED", "FULFILLING", "COMPLETED"] },
      // No billing yet: no one-time invoice and no subscription.
      invoices: { none: { type: "ONE_TIME" } },
      subscriptions: { none: {} },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      quotationNumber: true,
      customer: { select: { name: true } },
      salesRep: { select: { name: true } },
      total: true,
      createdAt: true,
    },
  });

  return quotations;
}

export type BillingListParams = Pick<ListBillingQuery, "page" | "pageSize" | "q" | "status" | "type">;

export const billingDashboard = {
  listInvoices: (actor: BillingActor, params: BillingListParams) =>
    listInvoices(actor, params),
  listSubscriptions: (
    actor: BillingActor,
    params: Omit<BillingListParams, "type">
  ) => listSubscriptions(actor, params),
}; 