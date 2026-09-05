import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  createQuotationSchema,
  listQuotationsQuerySchema,
  moneyInputSchema,
  updateQuotationSchema,
} from "../src/lib/modules/quotations/validation.ts";

const validCreatePayload = {
  customerId: "customer-1",
  lines: [
    {
      productId: "product-1",
      quantity: 2,
      unitPrice: "10.50",
      discountPercent: 5,
    },
  ],
};

describe("createQuotationSchema", () => {
  it("accepts a valid payload", () => {
    const result = createQuotationSchema.safeParse(validCreatePayload);
    assert.equal(result.success, true);
  });

  it("accepts an optional validUntil date", () => {
    const result = createQuotationSchema.safeParse({
      ...validCreatePayload,
      validUntil: "2026-12-31T23:59:59Z",
    });
    assert.equal(result.success, true);
  });

  it("accepts null validUntil", () => {
    const result = createQuotationSchema.safeParse({
      ...validCreatePayload,
      validUntil: null,
    });
    assert.equal(result.success, true);
  });

  it("rejects an invalid validUntil date", () => {
    const result = createQuotationSchema.safeParse({
      ...validCreatePayload,
      validUntil: "not-a-date",
    });
    assert.equal(result.success, false);
  });

  it("requires customerId", () => {
    const result = createQuotationSchema.safeParse({
      lines: validCreatePayload.lines,
    });
    assert.equal(result.success, false);
  });

  it("requires at least one line", () => {
    const result = createQuotationSchema.safeParse({
      customerId: "customer-1",
      lines: [],
    });
    assert.equal(result.success, false);
  });

  it("rejects a missing productId", () => {
    const result = createQuotationSchema.safeParse({
      customerId: "customer-1",
      lines: [{ quantity: 1, unitPrice: 10, discountPercent: 0 }],
    });
    assert.equal(result.success, false);
  });

  it("rejects non-positive quantities", () => {
    for (const quantity of [0, -1]) {
      const result = createQuotationSchema.safeParse({
        ...validCreatePayload,
        lines: [{ ...validCreatePayload.lines[0], quantity }],
      });
      assert.equal(result.success, false, `quantity ${quantity} should fail`);
    }
  });

  it("rejects non-integer quantities", () => {
    const result = createQuotationSchema.safeParse({
      ...validCreatePayload,
      lines: [{ ...validCreatePayload.lines[0], quantity: 1.5 }],
    });
    assert.equal(result.success, false);
  });

  it("rejects discounts outside 0–100", () => {
    for (const discountPercent of [-1, 101]) {
      const result = createQuotationSchema.safeParse({
        ...validCreatePayload,
        lines: [{ ...validCreatePayload.lines[0], discountPercent }],
      });
      assert.equal(result.success, false, `discount ${discountPercent} should fail`);
    }
  });

  it("rejects negative unit prices", () => {
    const result = createQuotationSchema.safeParse({
      ...validCreatePayload,
      lines: [{ ...validCreatePayload.lines[0], unitPrice: "-5.00" }],
    });
    assert.equal(result.success, false);
  });
});

describe("moneyInputSchema", () => {
  it("accepts whole and decimal strings with up to 2 places", () => {
    assert.equal(moneyInputSchema.safeParse("0").success, true);
    assert.equal(moneyInputSchema.safeParse("10").success, true);
    assert.equal(moneyInputSchema.safeParse("10.50").success, true);
  });

  it("rejects strings with more than 2 decimal places", () => {
    assert.equal(moneyInputSchema.safeParse("12.345").success, false);
  });

  it("rejects non-numeric strings", () => {
    assert.equal(moneyInputSchema.safeParse("abc").success, false);
    assert.equal(moneyInputSchema.safeParse("-5").success, false);
  });

  it("accepts finite numbers", () => {
    assert.equal(moneyInputSchema.safeParse(10).success, true);
    assert.equal(moneyInputSchema.safeParse(10.5).success, true);
  });
});

describe("updateQuotationSchema", () => {
  it("rejects an empty body", () => {
    assert.equal(updateQuotationSchema.safeParse({}).success, false);
  });

  it("accepts a partial update with lines", () => {
    const result = updateQuotationSchema.safeParse({
      lines: validCreatePayload.lines,
    });
    assert.equal(result.success, true);
  });

  it("accepts a partial update with only customerId", () => {
    const result = updateQuotationSchema.safeParse({ customerId: "customer-2" });
    assert.equal(result.success, true);
  });

  it("rejects an empty lines array when provided", () => {
    const result = updateQuotationSchema.safeParse({ lines: [] });
    assert.equal(result.success, false);
  });

  it("accepts null validUntil (clears expiry)", () => {
    const result = updateQuotationSchema.safeParse({ validUntil: null });
    assert.equal(result.success, true);
  });
});

describe("listQuotationsQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = listQuotationsQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 1);
      assert.equal(result.data.pageSize, 20);
    }
  });

  it("coerces string numbers from the URL", () => {
    const result = listQuotationsQuerySchema.safeParse({
      page: "3",
      pageSize: "50",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 3);
      assert.equal(result.data.pageSize, 50);
    }
  });

  it("rejects malformed paging values", () => {
    assert.equal(listQuotationsQuerySchema.safeParse({ page: "0" }).success, false);
    assert.equal(listQuotationsQuerySchema.safeParse({ page: "abc" }).success, false);
    assert.equal(listQuotationsQuerySchema.safeParse({ pageSize: "500" }).success, false);
  });

  it("accepts the Phase 2 and Phase 3 status values", () => {
    for (const status of [
      "DRAFT",
      "PENDING_APPROVAL",
      "PENDING_MANAGER",
      "PENDING_FINANCE",
      "APPROVED",
      "REJECTED",
    ]) {
      assert.equal(
        listQuotationsQuerySchema.safeParse({ status }).success,
        true,
        `status ${status} should be accepted`
      );
    }
  });

  it("rejects unsupported status values", () => {
    assert.equal(
      listQuotationsQuerySchema.safeParse({ status: "CONFIRMED" }).success,
      false
    );
    assert.equal(
      listQuotationsQuerySchema.safeParse({ status: "FULFILLING" }).success,
      false
    );
    assert.equal(
      listQuotationsQuerySchema.safeParse({ status: "BOGUS" }).success,
      false
    );
  });

  it("accepts a search term", () => {
    const result = listQuotationsQuerySchema.safeParse({ q: "northwind" });
    assert.equal(result.success, true);
  });
});