import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import {
  calculateLinePricing,
  calculateQuotationTotals,
  roundMoney,
} from "../src/lib/modules/quotations/pricing.ts";

const { Decimal } = Prisma;

function dec(value: Prisma.Decimal | string | number): string {
  return new Decimal(value).toFixed(2);
}

describe("calculateLinePricing", () => {
  it("computes gross, discount, line total and margin", () => {
    const result = calculateLinePricing({
      quantity: 3,
      unitPrice: 100,
      discountPercent: 10,
      cost: 60,
    });
    assert.equal(dec(result.grossAmount), "300.00");
    assert.equal(dec(result.discountAmount), "30.00");
    assert.equal(dec(result.lineTotal), "270.00");
    assert.equal(dec(result.margin), "90.00");
  });

  it("handles zero discount (gross === line total)", () => {
    const result = calculateLinePricing({
      quantity: 2,
      unitPrice: 50,
      discountPercent: 0,
      cost: 30,
    });
    assert.equal(dec(result.grossAmount), "100.00");
    assert.equal(dec(result.discountAmount), "0.00");
    assert.equal(dec(result.lineTotal), "100.00");
    assert.equal(dec(result.margin), "40.00");
  });

  it("handles 100% discount (negative margin equal to cost)", () => {
    const result = calculateLinePricing({
      quantity: 1,
      unitPrice: 100,
      discountPercent: 100,
      cost: 60,
    });
    assert.equal(dec(result.lineTotal), "0.00");
    assert.equal(dec(result.margin), "-60.00");
  });

  it("uses Decimal arithmetic, avoiding floating point drift", () => {
    const result = calculateLinePricing({
      quantity: 3,
      unitPrice: 0.1,
      discountPercent: 0,
      cost: 0.05,
    });
    // 3 × 0.1 would be 0.30000000000000004 in IEEE-754 floats.
    assert.equal(dec(result.grossAmount), "0.30");
    assert.equal(dec(result.margin), "0.15");
  });

  it("rounds money inputs to 2 decimal places", () => {
    const result = calculateLinePricing({
      quantity: 1,
      unitPrice: 10.005,
      discountPercent: 0,
      cost: 0,
    });
    assert.equal(dec(result.grossAmount), "10.01");
  });

  it("rounds discount amounts to 2 decimal places", () => {
    const result = calculateLinePricing({
      quantity: 3,
      unitPrice: 9.99,
      discountPercent: 33,
      cost: 12,
    });
    assert.equal(dec(result.grossAmount), "29.97");
    // 29.97 × 33 / 100 = 9.8901 → rounds to 9.89
    assert.equal(dec(result.discountAmount), "9.89");
    assert.equal(dec(result.lineTotal), "20.08");
    // cost = 3 × 12 = 36 → margin = 20.08 − 36
    assert.equal(dec(result.margin), "-15.92");
  });

  it("accepts numeric strings for money inputs", () => {
    const result = calculateLinePricing({
      quantity: 2,
      unitPrice: "12.50",
      discountPercent: 0,
      cost: "4.25",
    });
    assert.equal(dec(result.grossAmount), "25.00");
    assert.equal(dec(result.margin), "16.50");
  });

  it("rejects invalid quantities", () => {
    assert.throws(
      () =>
        calculateLinePricing({
          quantity: 0,
          unitPrice: 10,
          discountPercent: 0,
          cost: 5,
        }),
      RangeError
    );
    assert.throws(
      () =>
        calculateLinePricing({
          quantity: 1.5,
          unitPrice: 10,
          discountPercent: 0,
          cost: 5,
        }),
      RangeError
    );
  });

  it("rejects invalid discount percentages", () => {
    assert.throws(
      () =>
        calculateLinePricing({
          quantity: 1,
          unitPrice: 10,
          discountPercent: -1,
          cost: 5,
        }),
      RangeError
    );
    assert.throws(
      () =>
        calculateLinePricing({
          quantity: 1,
          unitPrice: 10,
          discountPercent: 101,
          cost: 5,
        }),
      RangeError
    );
  });

  it("rejects negative unit prices", () => {
    assert.throws(
      () =>
        calculateLinePricing({
          quantity: 1,
          unitPrice: -5,
          discountPercent: 0,
          cost: 5,
        }),
      RangeError
    );
  });
});

describe("calculateQuotationTotals", () => {
  it("aggregates multiple lines into subtotal, discount, total and margin", () => {
    const lines = [
      calculateLinePricing({ quantity: 2, unitPrice: 100, discountPercent: 10, cost: 60 }),
      calculateLinePricing({ quantity: 1, unitPrice: 500, discountPercent: 0, cost: 200 }),
    ];
    const totals = calculateQuotationTotals(lines);
    assert.equal(dec(totals.subtotal), "700.00");
    assert.equal(dec(totals.discountTotal), "20.00");
    assert.equal(dec(totals.total), "680.00");
    assert.equal(dec(totals.margin), "360.00");
  });

  it("sums margins across lines (line 1: 180−120=60, line 2: 500−200=300)", () => {
    const lines = [
      calculateLinePricing({ quantity: 2, unitPrice: 100, discountPercent: 10, cost: 60 }),
      calculateLinePricing({ quantity: 1, unitPrice: 500, discountPercent: 0, cost: 200 }),
    ];
    const totals = calculateQuotationTotals(lines);
    assert.equal(dec(totals.margin), "360.00");
  });

  it("returns zeros for an empty line set", () => {
    const totals = calculateQuotationTotals([]);
    assert.equal(dec(totals.subtotal), "0.00");
    assert.equal(dec(totals.discountTotal), "0.00");
    assert.equal(dec(totals.total), "0.00");
    assert.equal(dec(totals.margin), "0.00");
  });

  it("keeps totals consistent: total === subtotal − discountTotal", () => {
    const lines = [
      calculateLinePricing({ quantity: 4, unitPrice: 12.34, discountPercent: 12, cost: 6.5 }),
      calculateLinePricing({ quantity: 2, unitPrice: 999, discountPercent: 5, cost: 540 }),
      calculateLinePricing({ quantity: 1, unitPrice: 1800, discountPercent: 0, cost: 1260 }),
    ];
    const totals = calculateQuotationTotals(lines);
    const expected = new Decimal(totals.subtotal).minus(totals.discountTotal);
    assert.ok(totals.total.equals(expected));
  });
});

describe("roundMoney", () => {
  it("rounds half up to 2 decimal places", () => {
    assert.equal(dec(roundMoney(new Decimal("0.005"))), "0.01");
    assert.equal(dec(roundMoney(new Decimal("1.004"))), "1.00");
    assert.equal(dec(roundMoney(new Decimal("-0.005"))), "-0.01");
  });
});