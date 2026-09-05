import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";

import {
  addBillingInterval,
  dueDateForIssue,
  prorateAmount,
  roundMoney,
  sumMoney,
  toMoney,
} from "../src/lib/modules/billing/billing-calculation.ts";

const { Decimal } = Prisma;

describe("billing money arithmetic", () => {
  it("rounds to 2 decimal places half-up", () => {
    assert.equal(roundMoney(new Decimal("10.005")).toString(), "10.01");
    assert.equal(roundMoney(new Decimal("10.004")).toString(), "10");
  });

  it("normalizes strings and numbers to Decimal", () => {
    assert.ok(toMoney("123.45").equals(new Decimal("123.45")));
    assert.ok(toMoney(123.45).equals(new Decimal("123.45")));
    assert.ok(toMoney(new Decimal("99.999")).equals(new Decimal("100")));
  });

  it("sums decimals without float drift", () => {
    const result = sumMoney([new Decimal("0.1"), new Decimal("0.2"), new Decimal("0.3")]);
    assert.equal(result.toString(), "0.6");
  });

  it("prorates deterministically: $300 × 10/30 = $100", () => {
    const amount = prorateAmount(new Decimal("300"), 10, 30);
    assert.equal(amount.toString(), "100");
  });

  it("prorates rounded amounts", () => {
    const amount = prorateAmount(new Decimal("199.99"), 1, 3);
    assert.equal(amount.toString(), "66.66");
  });

  it("rejects invalid proration periods", () => {
    assert.throws(() => prorateAmount("100", 5, 0), /positive/);
    assert.throws(() => prorateAmount("100", -1, 30), /negative/);
  });

  it("computes a due date 30 days after issue by default", () => {
    const issue = new Date("2026-01-15T00:00:00Z");
    const due = dueDateForIssue(issue);
    assert.equal(due.toISOString().slice(0, 10), "2026-02-14");
  });
});

describe("billing interval arithmetic (calendar-aware, deterministic)", () => {
  it("adds one month", () => {
    const start = new Date("2026-01-15T00:00:00Z");
    const next = addBillingInterval(start, "MONTHLY");
    assert.equal(next.toISOString().slice(0, 10), "2026-02-15");
  });

  it("clamps month-end days (Jan 31 + 1 month → Feb 28)", () => {
    const start = new Date("2026-01-31T00:00:00Z");
    const next = addBillingInterval(start, "MONTHLY");
    assert.equal(next.toISOString().slice(0, 10), "2026-02-28");
  });

  it("adds one year (leap-aware)", () => {
    const start = new Date("2026-02-28T00:00:00Z");
    const next = addBillingInterval(start, "ANNUAL");
    assert.equal(next.toISOString().slice(0, 10), "2027-02-28");
  });

  it("adds a quarter", () => {
    const start = new Date("2026-01-31T00:00:00Z");
    const next = addBillingInterval(start, "QUARTERLY");
    // Jan 31 + 3 months → Apr 30 (clamped).
    assert.equal(next.toISOString().slice(0, 10), "2026-04-30");
  });
});
