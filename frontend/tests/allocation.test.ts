import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  allocateAcrossWarehouses,
  sumAllocations,
} from "../src/lib/modules/fulfillment/allocation.ts";

function wh(inventoryId: string, warehouseName: string, availableQuantity: number) {
  return { inventoryId, warehouseName, availableQuantity };
}

describe("allocateAcrossWarehouses", () => {
  it("allocates fully from a single warehouse", () => {
    const result = allocateAcrossWarehouses(10, [wh("inv-a", "Warehouse A", 25)]);
    assert.deepEqual(result, {
      allocations: [{ inventoryId: "inv-a", warehouseName: "Warehouse A", quantity: 10 }],
      backorder: 0,
    });
  });

  it("splits a request across two warehouses deterministically (A=8, B=5, request 12)", () => {
    const result = allocateAcrossWarehouses(12, [
      wh("inv-a", "Warehouse A", 8),
      wh("inv-b", "Warehouse B", 5),
    ]);
    assert.deepEqual(result.allocations, [
      { inventoryId: "inv-a", warehouseName: "Warehouse A", quantity: 8 },
      { inventoryId: "inv-b", warehouseName: "Warehouse B", quantity: 4 },
    ]);
    assert.equal(result.backorder, 0);
  });

  it("splits across multiple warehouses (A=8, B=5, C=2, request 12)", () => {
    const result = allocateAcrossWarehouses(12, [
      wh("inv-a", "Warehouse A", 8),
      wh("inv-b", "Warehouse B", 5),
      wh("inv-c", "Warehouse C", 2),
    ]);
    // C is never needed, so it gets no allocation slice.
    assert.deepEqual(result.allocations, [
      { inventoryId: "inv-a", warehouseName: "Warehouse A", quantity: 8 },
      { inventoryId: "inv-b", warehouseName: "Warehouse B", quantity: 4 },
    ]);
    assert.equal(result.backorder, 0);
  });

  it("is deterministic: same inputs always produce the same allocation", () => {
    const input = [
      wh("inv-c", "Warehouse C", 9),
      wh("inv-a", "Warehouse A", 14),
      wh("inv-b", "Warehouse B", 3),
    ];
    const first = allocateAcrossWarehouses(17, input);
    const second = allocateAcrossWarehouses(17, input);
    assert.deepEqual(first, second);
    // Highest availability first; only warehouses that contribute appear.
    assert.deepEqual(
      first.allocations.map((a) => a.warehouseName),
      ["Warehouse A", "Warehouse C"]
    );
  });

  it("ties availability by warehouse name ascending", () => {
    const result = allocateAcrossWarehouses(10, [
      wh("inv-z", "Warehouse Z", 10),
      wh("inv-a", "Warehouse A", 10),
    ]);
    assert.equal(result.allocations[0].warehouseName, "Warehouse A");
    assert.equal(result.allocations[0].quantity, 10);
  });

  it("computes a backorder when stock is insufficient (request 20, available 13)", () => {
    const result = allocateAcrossWarehouses(20, [
      wh("inv-a", "Warehouse A", 8),
      wh("inv-b", "Warehouse B", 5),
    ]);
    assert.equal(result.backorder, 7);
    assert.deepEqual(
      result.allocations.map((a) => a.quantity),
      [8, 5]
    );
  });

  it("handles exact availability (request equals stock)", () => {
    const result = allocateAcrossWarehouses(8, [wh("inv-a", "Warehouse A", 8)]);
    assert.equal(result.backorder, 0);
    assert.equal(sumAllocations(result.allocations), 8);
  });

  it("handles zero inventory (request 5, nothing available)", () => {
    const result = allocateAcrossWarehouses(5, [wh("inv-a", "Warehouse A", 0)]);
    assert.deepEqual(result.allocations, []);
    assert.equal(result.backorder, 5);
  });

  it("ignores negative/zero available rows and backorders the remainder", () => {
    const result = allocateAcrossWarehouses(6, [
      wh("inv-a", "Warehouse A", 0),
      wh("inv-b", "Warehouse B", 4),
      wh("inv-c", "Warehouse C", -2),
    ]);
    assert.deepEqual(result.allocations, [
      { inventoryId: "inv-b", warehouseName: "Warehouse B", quantity: 4 },
    ]);
    assert.equal(result.backorder, 2);
  });

  it("sumAllocations totals the slices", () => {
    const result = allocateAcrossWarehouses(15, [
      wh("inv-a", "Warehouse A", 6),
      wh("inv-b", "Warehouse B", 6),
      wh("inv-c", "Warehouse C", 6),
    ]);
    assert.equal(sumAllocations(result.allocations), 15);
  });
});