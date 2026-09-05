import { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { toMoney } from "./billing-calculation";
import { badRequest, conflict, notFound } from "./billing-errors";
import { assertCanManageBilling, type BillingActor } from "./billing-guards";
import { resolveInvoiceTransition } from "./billing-transitions";
import type { RecordPaymentInput } from "./billing-validation";

/**
 * Payment recording service.
 *
 * Payments are recorded internally (no external gateway in Phase 6) but the
 * design is webhook-ready: each payment may carry a caller-supplied
 * `idempotencyKey` and a provider `externalEventId`, both unique at the DB
 * level so a webhook retry or a double-click can never credit an invoice
 * twice. Amounts are validated server-side against the authoritative invoice
 * total — overpayment is rejected.
 *
 * Recording a successful payment atomically:
 *   1. creates the payment row,
 *   2. recomputes the invoice paid amount,
 *   3. derives the invoice status (PARTIALLY_PAID → PAID),
 *   4. when the invoice becomes PAID and belongs to a subscription schedule,
 *      the schedule is marked PAID too.
 */

export type PaymentInput = RecordPaymentInput & {
  /** Unique provider event id — used by webhook integrations. */
  externalEventId?: string;
};

export async function recordPayment(
  invoiceId: string,
  actor: BillingActor,
  input: PaymentInput
) {
  assertCanManageBilling(actor.role);

  return db.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId } });
    if (!invoice) {
      throw notFound("Invoice not found.");
    }

    if (input.idempotencyKey) {
      const existing = await tx.payment.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        select: { id: true },
      });
      if (existing) {
        throw conflict(
          "A payment with this idempotency key has already been recorded.",
          "PAYMENT_IDEMPOTENCY_CONFLICT"
        );
      }
    }
    if (input.externalEventId) {
      const existing = await tx.payment.findUnique({
        where: { externalEventId: input.externalEventId },
        select: { id: true },
      });
      if (existing) {
        throw conflict(
          "This payment event has already been processed.",
          "PAYMENT_EVENT_DUPLICATE"
        );
      }
    }

    const amount = toMoney(input.amount);
    if (amount.lte(0)) {
      throw badRequest("Payment amount must be greater than zero.", "PAYMENT_AMOUNT_INVALID");
    }

    const transitionGuard = resolveInvoiceTransition(
      { status: invoice.status, paidAmount: invoice.paidAmount, total: invoice.total },
      "recordPayment"
    );
    if (!transitionGuard.ok) {
      throw conflict(transitionGuard.message, "INVOICE_STATE_CONFLICT");
    }

    const newPaidAmount = invoice.paidAmount.plus(amount);
    if (newPaidAmount.gt(invoice.total)) {
      throw badRequest(
        `Payment of ${amount.toString()} would exceed the outstanding balance (${invoice.total.minus(invoice.paidAmount).toString()}).`,
        "PAYMENT_OVERPAYMENT"
      );
    }

    await tx.payment.create({
      data: {
        invoiceId,
        amount,
        status: "SUCCEEDED",
        method: input.method ?? "INTERNAL",
        reference: input.reference,
        idempotencyKey: input.idempotencyKey,
        externalEventId: input.externalEventId,
        paidAt: new Date(),
      },
    });

    const paidTransition = resolveInvoiceTransition(
      { status: invoice.status, paidAmount: newPaidAmount, total: invoice.total },
      "recordPayment"
    );
    const nextStatus = paidTransition.ok ? paidTransition.nextStatus : invoice.status;

    const updated = await tx.invoice.update({
      where: { id: invoiceId },
      data: { paidAmount: newPaidAmount, status: nextStatus },
    });

    // A fully paid recurring invoice settles its billing schedule. The
    // schedule holds the invoice FK, so we look it up from the invoice id.
    if (nextStatus === "PAID") {
      const schedule = await tx.billingSchedule.findUnique({
        where: { invoiceId },
        select: { id: true },
      });
      if (schedule) {
        await tx.billingSchedule.update({
          where: { id: schedule.id },
          data: { status: "PAID" },
        });
      }
    }

    return { payment: { amount, method: input.method ?? "INTERNAL" }, invoice: updated };
  });
}

/** Lists the payments recorded against an invoice (finance/admin/manager view). */
export async function listPaymentsForInvoice(invoiceId: string) {
  return db.payment.findMany({
    where: { invoiceId },
    orderBy: { createdAt: "asc" },
  });
}

/** Internal helper: total successfully paid for an invoice. */
export async function paidAmountForInvoice(tx: Prisma.TransactionClient, invoiceId: string) {
  const aggregate = await tx.payment.aggregate({
    where: { invoiceId, status: "SUCCEEDED" },
    _sum: { amount: true },
  });
  return aggregate._sum.amount ?? new Prisma.Decimal(0);
} 