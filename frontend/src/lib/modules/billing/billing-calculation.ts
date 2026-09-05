import { Prisma } from "@prisma/client";
import type { BillingInterval } from "@prisma/client";

const { Decimal } = Prisma;

/**
 * Deterministic billing arithmetic.
 *
 * Money values use Prisma's Decimal (decimal.js) exclusively — never raw
 * JavaScript floats for persisted amounts. Period math (adding months /
 * years to a date) is deterministic and calendar-aware within the limits
 * documented in the billing docs (day-of-month clamping).
 */

export type MoneyInput = Prisma.Decimal | string | number;

export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function toMoney(value: MoneyInput): Prisma.Decimal {
  const decimal = value instanceof Decimal ? value : new Decimal(String(value));
  return roundMoney(decimal);
}

/** Adds one billing interval to a date (MONTHLY/QUARTERLY/ANNUAL). */
export function addBillingInterval(
  date: Date,
  interval: BillingInterval
): Date {
  const next = new Date(date);
  const day = next.getDate();
  switch (interval) {
    case "MONTHLY":
      next.setMonth(next.getMonth() + 1);
      break;
    case "QUARTERLY":
      next.setMonth(next.getMonth() + 3);
      break;
    case "ANNUAL":
      next.setFullYear(next.getFullYear() + 1);
      break;
  }
  // Clamp to the last day of the target month when the source day does not
  // exist there (e.g. Jan 31 + 1 month → Feb 28/29). Deterministic and
  // documented — no floating drift, no UTC skew surprises.
  if (next.getDate() !== day) {
    next.setDate(0);
  }
  return next;
}

/**
 * Simple deterministic day-based proration:
 *
 *   prorated = amount × daysIncluded / daysInPeriod
 *
 * Used when a subscription starts or changes mid-period. Calendar-aware
 * precision is intentionally kept simple and documented as such.
 */
export function prorateAmount(
  amount: MoneyInput,
  daysIncluded: number,
  daysInPeriod: number
): Prisma.Decimal {
  if (daysInPeriod <= 0) {
    throw new RangeError("daysInPeriod must be positive");
  }
  if (daysIncluded < 0) {
    throw new RangeError("daysIncluded must not be negative");
  }
  const ratio = new Decimal(daysIncluded).div(daysInPeriod);
  return roundMoney(toMoney(amount).times(ratio));
}

/** Sums a list of Decimal amounts, rounded to 2dp. */
export function sumMoney(values: Prisma.Decimal[]): Prisma.Decimal {
  return roundMoney(
    values.reduce((sum, value) => sum.plus(value), new Decimal(0))
  );
}

/**
 * Standard invoice terms: due `days` after the issue date (default 30).
 * Returns a deterministic Date.
 */
export function dueDateForIssue(issueDate: Date, days = 30): Date {
  const due = new Date(issueDate);
  due.setDate(due.getDate() + days);
  return due;
} 