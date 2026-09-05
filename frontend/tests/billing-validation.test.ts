import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  invoiceActionSchema,
  listBillingQuerySchema,
  recordPaymentSchema,
} from "../src/lib/modules/billing/billing-validation.ts";

describe("recordPaymentSchema", () => {
  it("accepts a valid internal payment", () => {
    const parsed = recordPaymentSchema.safeParse({ amount: "450.50", method: "BANK_TRANSFER" });
    assert.ok(parsed.success);
  });

  it("accepts numeric amounts and optional idempotency keys", () => {
    const parsed = recordPaymentSchema.safeParse({
      amount: 450.5,
      idempotencyKey: "pay-123",
      reference: "invoice INV-2026-0001",
    });
    assert.ok(parsed.success);
  });

  it("rejects missing or invalid amounts", () => {
    assert.ok(!recordPaymentSchema.safeParse({}).success);
    assert.ok(!recordPaymentSchema.safeParse({ amount: "" }).success);
    assert.ok(!recordPaymentSchema.safeParse({ amount: "12.345" }).success);
    assert.ok(!recordPaymentSchema.safeParse({ amount: "-5" }).success);
    assert.ok(!recordPaymentSchema.safeParse({ amount: "abc" }).success);
  });

  it("rejects unknown fields (strict)", () => {
    assert.ok(!recordPaymentSchema.safeParse({ amount: "10", invoiceTotal: "999" }).success);
  });
});

describe("invoiceActionSchema", () => {
  it("accepts an empty body for issue/void", () => {
    assert.ok(invoiceActionSchema.safeParse({}).success);
  });

  it("rejects unexpected fields", () => {
    assert.ok(!invoiceActionSchema.safeParse({ force: true }).success);
  });
});

describe("listBillingQuerySchema", () => {
  it("defaults pagination", () => {
    const parsed = listBillingQuerySchema.safeParse({});
    assert.ok(parsed.success);
    assert.equal(parsed.data.page, 1);
    assert.equal(parsed.data.pageSize, 20);
  });

  it("parses explicit pagination and filters", () => {
    const parsed = listBillingQuerySchema.safeParse({
      page: "2",
      pageSize: "50",
      status: "PAID",
      type: "RECURRING",
      q: "acme",
    });
    assert.ok(parsed.success);
    assert.equal(parsed.data.page, 2);
    assert.equal(parsed.data.pageSize, 50);
    assert.equal(parsed.data.status, "PAID");
    assert.equal(parsed.data.q, "acme");
  });

  it("clamps page/pageSize to bounds", () => {
    const parsed = listBillingQuerySchema.safeParse({ page: "0", pageSize: "1000" });
    assert.ok(!parsed.success); // out-of-bounds is rejected server-side
  });
});
