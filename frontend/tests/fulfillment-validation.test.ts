import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  adjustInventorySchema,
  createFulfillmentSchema,
  fulfillmentActionSchema,
  listFulfillmentsQuerySchema,
} from "../src/lib/modules/fulfillment/validation.ts";

describe("createFulfillmentSchema", () => {
  it("accepts a valid quotation id", () => {
    const result = createFulfillmentSchema.safeParse({ quotationId: "cm-123" });
    assert.equal(result.success, true);
  });

  it("rejects a missing quotation id", () => {
    const result = createFulfillmentSchema.safeParse({});
    assert.equal(result.success, false);
  });

  it("rejects a quotation id that is not a string", () => {
    const result = createFulfillmentSchema.safeParse({ quotationId: 42 });
    assert.equal(result.success, false);
  });
});

describe("fulfillmentActionSchema", () => {
  it("accepts an empty body", () => {
    const result = fulfillmentActionSchema.safeParse({});
    assert.equal(result.success, true);
  });

  it("rejects client-supplied quantities (must come from the database)", () => {
    const result = fulfillmentActionSchema.safeParse({ quantity: 999 });
    assert.equal(result.success, false);
  });

  it("rejects client-supplied prices", () => {
    const result = fulfillmentActionSchema.safeParse({ unitPrice: 1.5 });
    assert.equal(result.success, false);
  });
});

describe("listFulfillmentsQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = listFulfillmentsQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 1);
      assert.equal(result.data.pageSize, 20);
      assert.equal(result.data.status, undefined);
    }
  });

  it("accepts an explicit status filter", () => {
    const result = listFulfillmentsQuerySchema.safeParse({ status: "PARTIALLY_ALLOCATED" });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.status, "PARTIALLY_ALLOCATED");
  });

  it("rejects an unknown status", () => {
    const result = listFulfillmentsQuerySchema.safeParse({ status: "NOPE" });
    assert.equal(result.success, false);
  });

  it("rejects pageSize above the bound", () => {
    const result = listFulfillmentsQuerySchema.safeParse({ pageSize: 1000 });
    assert.equal(result.success, false);
  });

  it("rejects a non-integer page", () => {
    const result = listFulfillmentsQuerySchema.safeParse({ page: 1.5 });
    assert.equal(result.success, false);
  });
});

describe("adjustInventorySchema", () => {
  it("accepts a valid adjustment", () => {
    const result = adjustInventorySchema.safeParse({ inventoryId: "inv-1", delta: 10 });
    assert.equal(result.success, true);
  });

  it("rejects a zero delta", () => {
    const result = adjustInventorySchema.safeParse({ inventoryId: "inv-1", delta: 0 });
    assert.equal(result.success, false);
  });

  it("rejects a fractional delta", () => {
    const result = adjustInventorySchema.safeParse({ inventoryId: "inv-1", delta: 1.5 });
    assert.equal(result.success, false);
  });

  it("rejects a missing inventory id", () => {
    const result = adjustInventorySchema.safeParse({ delta: 10 });
    assert.equal(result.success, false);
  });
});