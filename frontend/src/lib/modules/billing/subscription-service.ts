import { BillingInterval, Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { addBillingInterval } from "./billing-calculation";
import {
  assertCanManageBilling,
  assertCanViewBillingArea,
  type BillingActor,
} from "./billing-guards";
import { badRequest, conflict, notFound } from "./billing-errors";
import { createInvoiceInTransaction } from "./invoice-service";
import { resolveSubscriptionTransition } from "./billing-transitions";
import type { ListBillingQuery } from "./billing-validation";

/**
 * Subscription service.
 *
 * A subscription is created from a recurring quotation line at billing time.
 * The recurring amount is the quotation line's finalized net total (already
 * discounted), snapshotted at billing — never re-read from today's catalog.
 * The billing interval comes from the product's SubscriptionPlan (falling
 * back to MONTHLY), so monthly and yearly subscription cycles are both
 * supported.
 *
 * Subscription billing is manual/internal in Phase 6: `billSubscription`
 * generates the invoice + billing schedule for the next period inside one
 * transaction, guarded by a DB unique (subscriptionId, periodStart) so the
 * same period can never be billed twice.
 */

export type SubscriptionActor = BillingActor;

/** Deterministic FNV-1a advisory-lock key for a subscription id. */
function subscriptionLockKey(id: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    hash ^= id.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function recurringIntervalForProduct(product: {
  subscriptionPlan?: { billingInterval: BillingInterval } | null;
}): BillingInterval {
  return product.subscriptionPlan?.billingInterval ?? BillingInterval.MONTHLY;
}

/**
 * Creates a subscription for a recurring quotation line. Runs inside the
 * caller's transaction (billing creation is atomic with the one-time invoice).
 */
export async function createSubscriptionInTransaction(
  tx: Prisma.TransactionClient,
  input: {
    customerId: string;
    quotationId: string;
    quotationLineId: string;
    productId: string;
    subscriptionPlanId: string | null;
    recurringAmount: Prisma.Decimal;
    billingInterval: BillingInterval;
    startDate?: Date;
  }
) {
  const startDate = input.startDate ?? new Date();
  const subscription = await tx.subscription.create({
    data: {
      customerId: input.customerId,
      quotationId: input.quotationId,
      quotationLineId: input.quotationLineId,
      productId: input.productId,
      subscriptionPlanId: input.subscriptionPlanId,
      status: "ACTIVE",
      billingInterval: input.billingInterval,
      recurringAmount: input.recurringAmount.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
      startDate,
      nextBillingDate: addBillingInterval(startDate, input.billingInterval),
    },
  });

  // The first billing schedule covers the period [startDate, nextBillingDate).
  // It is created immediately (so a subscription always has an upcoming
  // schedule) but only billed when `billSubscription` runs.
  await tx.billingSchedule.create({
    data: {
      subscriptionId: subscription.id,
      periodStart: startDate,
      periodEnd: subscription.nextBillingDate,
      dueDate: subscription.nextBillingDate,
      amount: subscription.recurringAmount,
      status: "SCHEDULED",
    },
  });

  return subscription;
}

export type ListSubscriptionsParams = Pick<ListBillingQuery, "page" | "pageSize" | "q" | "status">;

export async function listSubscriptions(actor: BillingActor, params: ListSubscriptionsParams) {
  assertCanViewBillingArea(actor.role);

  const where: Prisma.SubscriptionWhereInput = {
    ...(params.status ? { status: params.status as never } : {}),
    ...(actor.role === "SALES_REP" ? { quotation: { salesRepId: actor.userId } } : {}),
    ...(params.q
      ? {
          OR: [
            { customer: { name: { contains: params.q, mode: "insensitive" } } },
            { product: { name: { contains: params.q, mode: "insensitive" } } },
            { quotation: { quotationNumber: { contains: params.q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const total = await db.subscription.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.subscription.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      customer: { select: { name: true } },
      product: { select: { name: true } },
      quotation: { select: { quotationNumber: true } },
      subscriptionPlan: { select: { name: true, billingInterval: true } },
    },
  });

  return {
    data,
    pagination: { page, pageSize: params.pageSize, total, totalPages },
  };
}

export const subscriptionInclude = {
  customer: { select: { id: true, name: true, email: true } },
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
    orderBy: { periodStart: "asc" as const },
    include: { invoice: { select: { id: true, invoiceNumber: true, status: true, total: true } } },
  },
} as const;

export async function getSubscription(id: string, actor: BillingActor) {
  assertCanViewBillingArea(actor.role);

  const subscription = await db.subscription.findUnique({
    where: { id },
    include: subscriptionInclude,
  });
  if (!subscription) {
    throw notFound("Subscription not found.");
  }

  // Sales reps may only view subscriptions on their own quotations.
  if (
    actor.role === "SALES_REP" &&
    subscription.quotation.salesRep.id !== actor.userId
  ) {
    throw notFound("Subscription not found.");
  }

  return subscription;
}

/**
 * Bills the next subscription period: creates the next BillingSchedule and a
 * DRAFT RECURRING invoice for it, inside one transaction. The DB unique
 * constraint (subscriptionId, periodStart) and the invoice billing key
 * guarantee a period is billed exactly once even under concurrent requests.
 */
export async function billSubscription(id: string, actor: BillingActor) {
  assertCanManageBilling(actor.role);

  const subscription = await db.subscription.findUnique({ where: { id } });
  if (!subscription) {
    throw notFound("Subscription not found.");
  }
  if (subscription.status !== "ACTIVE") {
    throw badRequest("Only active subscriptions can be billed.", "SUBSCRIPTION_NOT_ACTIVE");
  }

  return db.$transaction(async (tx) => {
    // Serialize concurrent billing of the same subscription.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(${subscriptionLockKey(id)})`;

    const current = await tx.subscription.findUniqueOrThrow({
      where: { id },
      include: {
        quotation: true,
        customer: { select: { id: true } },
        product: { select: { id: true, name: true, isRecurring: true } },
        subscriptionPlan: { select: { id: true, billingInterval: true } },
        schedules: { orderBy: { periodStart: "desc" as const }, take: 1 },
      },
    });

    // Next period starts where the latest schedule ended (or the subscription
    // start date when no schedule exists yet).
    const lastSchedule = current.schedules[0];
    const periodStart = lastSchedule ? new Date(lastSchedule.periodEnd) : current.startDate;
    const periodEnd = addBillingInterval(periodStart, current.billingInterval);

    // DB unique (subscriptionId, periodStart) guards this in any race.
    const schedule = await tx.billingSchedule.create({
      data: {
        subscriptionId: current.id,
        periodStart,
        periodEnd,
        dueDate: periodEnd,
        amount: current.recurringAmount,
        status: "SCHEDULED",
      },
    });

    // The recurring invoice mirrors the subscription amount (finalized net
    // total), not today's catalog price.
    const invoice = await createInvoiceInTransaction(tx, {
      type: "RECURRING",
      customerId: current.customer.id,
      quotationId: current.quotation.id,
      subscriptionId: current.id,
      billingKey: `schedule:${schedule.id}`,
      lines: [
        {
          productId: current.product.id,
          description: `${current.product.name} — ${current.billingInterval.toLowerCase()} subscription`,
          quantity: 1,
          unitPrice: current.recurringAmount,
          discountAmount: new Prisma.Decimal(0),
          lineTotal: current.recurringAmount,
          isRecurring: true,
        },
      ],
    });

    await tx.billingSchedule.update({
      where: { id: schedule.id },
      data: { invoiceId: invoice.id, status: "DUE" },
    });

    await tx.subscription.update({
      where: { id: current.id },
      data: { nextBillingDate: periodEnd },
    });

    return { scheduleId: schedule.id, invoiceId: invoice.id };
  });
}

/**
 * Pause/resume/cancel/complete are intentionally simple state helpers backed
 * by the pure transition rules; cancel also stops future billing because
 * `billSubscription` refuses non-ACTIVE subscriptions.
 */
export async function transitionSubscription(
  id: string,
  actor: BillingActor,
  action: "pause" | "resume" | "cancel" | "complete"
) {
  assertCanManageBilling(actor.role);

  return db.$transaction(async (tx) => {
    const current = await tx.subscription.findUnique({ where: { id } });
    if (!current) {
      throw notFound("Subscription not found.");
    }
    const transition = resolveSubscriptionTransition(current.status, action);
    if (!transition.ok) {
      throw conflict(transition.message, "SUBSCRIPTION_STATE_CONFLICT");
    }
    return tx.subscription.update({
      where: { id },
      data: {
        status: transition.nextStatus,
        ...(transition.nextStatus === "CANCELLED" ? { cancelledAt: new Date() } : {}),
      },
    });
  });
} 