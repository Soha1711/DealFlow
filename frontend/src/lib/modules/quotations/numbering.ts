import type { Prisma } from "@prisma/client";

/**
 * Server-side quotation number generation.
 *
 * Format: `QUOT-YYYY-####` (e.g. `QUOT-2026-0001`).
 *
 * The sequence is derived from the highest existing number for the current
 * year and is made concurrency-safe by taking a PostgreSQL advisory lock
 * inside the same interactive transaction that inserts the quotation. Because
 * the lock is transaction-scoped, two concurrent creates serialize on it and
 * can never observe the same last number.
 */

export const QUOTATION_NUMBER_PREFIX = "QUOT";

/** Arbitrary constant identifying the quotation-number sequence to the advisory lock. */
export const QUOTATION_NUMBER_LOCK_KEY = 723_000_001;

/** Returns the zero-padded prefix for a year, e.g. `QUOT-2026-`. */
export function quotationNumberPrefixForYear(year: number): string {
  return `${QUOTATION_NUMBER_PREFIX}-${year}-`;
}

/**
 * Computes the next sequence for a year from the last generated number.
 * Returns 1 when no number exists yet for the year or the last value is
 * malformed. Pure and unit-testable.
 */
export function nextSequenceFromLast(
  last: string | undefined,
  year: number
): number {
  if (!last) return 1;
  const prefix = quotationNumberPrefixForYear(year);
  if (!last.startsWith(prefix)) return 1;
  const sequence = Number(last.slice(prefix.length));
  return Number.isSafeInteger(sequence) && sequence >= 1 ? sequence + 1 : 1;
}

/** Formats a year + sequence as `QUOT-YYYY-####`. */
export function formatQuotationNumber(year: number, sequence: number): string {
  return `${quotationNumberPrefixForYear(year)}${String(sequence).padStart(4, "0")}`;
}

/**
 * Generates the next quotation number inside an interactive Prisma
 * transaction. Must be called from within `prisma.$transaction(async (tx) => …)`.
 */
export async function nextQuotationNumber(
  tx: Prisma.TransactionClient
): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = quotationNumberPrefixForYear(year);

  // Serialize concurrent quotation creation on this database. The lock is held
  // until the surrounding transaction commits or rolls back.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${QUOTATION_NUMBER_LOCK_KEY})`;

  const last = await tx.quotation.findFirst({
    where: { quotationNumber: { startsWith: prefix } },
    orderBy: { quotationNumber: "desc" },
    select: { quotationNumber: true },
  });

  return formatQuotationNumber(year, nextSequenceFromLast(last?.quotationNumber, year));
}