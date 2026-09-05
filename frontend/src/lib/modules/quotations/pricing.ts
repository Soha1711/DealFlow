import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;

/**
 * Deterministic server-side pricing for quotations.
 *
 * All persisted monetary values are computed with Prisma's `Decimal`
 * (decimal.js) — never with JavaScript floating point arithmetic. Every money
 * figure is rounded to 2 decimal places with half-up rounding, which matches
 * the `DECIMAL(12,2)` columns in PostgreSQL.
 */

export type MoneyInput = Prisma.Decimal | string | number;

/** Rounds a Decimal to 2 decimal places (half-up), the money convention. */
export function roundMoney(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

/** Normalizes any money input to a 2-decimal Decimal (rounds inputs as well). */
export function toMoney(value: MoneyInput): Prisma.Decimal {
  const decimal =
    value instanceof Decimal ? value : new Decimal(String(value));
  return roundMoney(decimal);
}

export type LinePricingInput = {
  quantity: number;
  unitPrice: MoneyInput;
  discountPercent: number;
  cost: MoneyInput;
};

export type LinePricing = {
  grossAmount: Prisma.Decimal;
  discountAmount: Prisma.Decimal;
  lineTotal: Prisma.Decimal;
  margin: Prisma.Decimal;
};

/**
 * Calculates the pricing for a single quotation line:
 *
 *   grossAmount    = quantity × unitPrice
 *   discountAmount = grossAmount × discountPercent / 100
 *   lineTotal      = grossAmount − discountAmount
 *   lineCost       = quantity × cost
 *   margin         = lineTotal − lineCost
 */
export function calculateLinePricing(input: LinePricingInput): LinePricing {
  if (!Number.isInteger(input.quantity) || input.quantity <= 0) {
    throw new RangeError("quantity must be a positive integer");
  }
  if (!Number.isFinite(input.discountPercent) || input.discountPercent < 0 || input.discountPercent > 100) {
    throw new RangeError("discountPercent must be between 0 and 100");
  }

  const quantity = new Decimal(input.quantity);
  const unitPrice = toMoney(input.unitPrice);
  const cost = toMoney(input.cost);
  const discountPercent = new Decimal(input.discountPercent);

  if (unitPrice.isNegative()) {
    throw new RangeError("unitPrice must not be negative");
  }

  const grossAmount = roundMoney(quantity.times(unitPrice));
  const discountAmount = roundMoney(grossAmount.times(discountPercent).div(100));
  const lineTotal = grossAmount.minus(discountAmount);
  const lineCost = quantity.times(cost);
  const margin = roundMoney(lineTotal.minus(lineCost));

  return { grossAmount, discountAmount, lineTotal, margin };
}

export type QuotationTotals = {
  subtotal: Prisma.Decimal;
  discountTotal: Prisma.Decimal;
  total: Prisma.Decimal;
  margin: Prisma.Decimal;
};

/**
 * Aggregates line pricing into quotation-level totals:
 *
 *   subtotal      = Σ grossAmount
 *   discountTotal = Σ discountAmount
 *   total         = subtotal − discountTotal
 *   margin        = Σ line margin
 */
export function calculateQuotationTotals(lines: LinePricing[]): QuotationTotals {
  let subtotal = new Decimal(0);
  let discountTotal = new Decimal(0);
  let margin = new Decimal(0);

  for (const line of lines) {
    subtotal = subtotal.plus(line.grossAmount);
    discountTotal = discountTotal.plus(line.discountAmount);
    margin = margin.plus(line.margin);
  }

  return {
    subtotal: roundMoney(subtotal),
    discountTotal: roundMoney(discountTotal),
    total: roundMoney(subtotal.minus(discountTotal)),
    margin: roundMoney(margin),
  };
}