import type { Prisma } from "@prisma/client";

/**
 * Server-side invoice number generation.
 *
 * Format: `INV-YYYY-####` (e.g. `INV-2026-0001`).
 *
 * Concurrency is handled exactly like the quotation-number generator: a
 * PostgreSQL advisory lock is taken inside the surrounding interactive
 * transaction so two concurrent billing operations can never observe the
 * same last number.
 */

export const INVOICE_NUMBER_PREFIX = "INV";

export const INVOICE_NUMBER_LOCK_KEY = 624_000_001;

export function invoiceNumberPrefixForYear(year: number): string {
  return `${INVOICE_NUMBER_PREFIX}-${year}-`;
}

export function nextInvoiceSequenceFromLast(
  last: string | undefined,
  year: number
): number {
  if (!last) return 1;
  const prefix = invoiceNumberPrefixForYear(year);
  if (!last.startsWith(prefix)) return 1;
  const sequence = Number(last.slice(prefix.length));
  return Number.isSafeInteger(sequence) && sequence >= 1 ? sequence + 1 : 1;
}

export function formatInvoiceNumber(year: number, sequence: number): string {
  return `${invoiceNumberPrefixForYear(year)}${String(sequence).padStart(4, "0")}`;
}

/** Generates the next invoice number inside an interactive transaction. */
export async function nextInvoiceNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = invoiceNumberPrefixForYear(year);

  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${INVOICE_NUMBER_LOCK_KEY})`;

  const last = await tx.invoice.findFirst({
    where: { invoiceNumber: { startsWith: prefix } },
    orderBy: { invoiceNumber: "desc" },
    select: { invoiceNumber: true },
  });

  return formatInvoiceNumber(year, nextInvoiceSequenceFromLast(last?.invoiceNumber, year));
} 