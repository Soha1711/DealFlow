import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import { FulfillmentError } from "@/lib/modules/fulfillment/fulfillment-errors";
import {
  adjustInventory,
  allocateFulfillment,
  backorderFulfillment,
  cancelFulfillment,
  createFulfillment,
  fulfillFulfillment,
  getFulfillment,
  getFulfillmentForQuotation,
  listFulfillments,
  releaseBackorder,
} from "@/lib/modules/fulfillment/fulfillment-service";
import { calculateLinePricing, calculateQuotationTotals } from "@/lib/modules/quotations/pricing";

/**
 * End-to-end fulfillment tests against the local PostgreSQL database.
 * Every record created here is deleted in `after`, leaving the dev database
 * untouched. Requires the docker-compose Postgres to be running.
 */

const suffix = Date.now().toString(36).toUpperCase();

type SeedUser = { id: string; role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "OPERATIONS" };

let rep: SeedUser;
let manager: SeedUser;
let finance: SeedUser;
let operations: SeedUser;
let admin: SeedUser;
let customerId: string;
let warehouseAId: string;
let warehouseBId: string;
let productBySku: Record<string, { id: string; price: number; cost: number; isRecurring: boolean }> = {};
const inventoryBySku: Record<string, { a: string | null; b: string | null }> = {};
const quotationIds: string[] = [];
const fulfillmentIds: string[] = [];
let quoteSeq = 0;

type TestLine = { productSku: string; quantity: number; discountPercent: number };

async function createQuotation(salesRepId: string, lines: TestLine[]) {
  quoteSeq += 1;
  const pricedLines = lines.map((line) => {
    const product = productBySku[line.productSku];
    const pricing = calculateLinePricing({
      quantity: line.quantity,
      unitPrice: product.price,
      discountPercent: line.discountPercent,
      cost: product.cost,
    });
    return {
      productId: product.id,
      quantity: line.quantity,
      unitPrice: product.price,
      discountPercent: line.discountPercent,
      isRecurring: product.isRecurring,
      ...pricing,
    };
  });
  const totals = calculateQuotationTotals(pricedLines);
  const quotation = await db.quotation.create({
    data: {
      quotationNumber: `QUOT-TEST-${suffix}-${quoteSeq}`,
      customerId,
      salesRepId,
      status: "APPROVED",
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      margin: totals.margin,
      lines: {
        create: pricedLines.map((line) => ({
          productId: line.productId,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent,
          discountAmount: line.discountAmount,
          lineTotal: line.lineTotal,
          margin: line.margin,
          isRecurring: line.isRecurring,
        })),
      },
    },
    select: { id: true },
  });
  quotationIds.push(quotation.id);
  return quotation.id;
}

// Each test gets its own product + warehouses so stock state never leaks
// between tests. Returns { sku, inventoryA, inventoryB }.
let freshSeq = 0;
async function freshStock(quantityA: number, quantityB = 0) {
  freshSeq += 1;
  const sku = `TST-FUL-${suffix}-${freshSeq}`;
  const product = await db.product.create({
    data: { name: `Test Fulfill ${suffix}-${freshSeq}`, sku, category: "Hardware", price: 500, cost: 250, maxDiscountPercent: 5, isRecurring: false },
    select: { id: true, price: true, cost: true, isRecurring: true },
  });
  productBySku[sku] = {
    id: product.id,
    price: Number(product.price),
    cost: Number(product.cost),
    isRecurring: product.isRecurring,
  };
  const [warehouseA, warehouseB] = await db.warehouse.createManyAndReturn({
    data: [
      { name: `Test WH-X ${suffix}-${freshSeq}`, location: "X" },
      { name: `Test WH-Y ${suffix}-${freshSeq}`, location: "Y" },
    ],
  });
  const rows = await db.inventory.createManyAndReturn({
    data: [
      { warehouseId: warehouseA.id, productId: product.id, quantity: quantityA, reservedQuantity: 0 },
      ...(quantityB > 0
        ? [{ warehouseId: warehouseB.id, productId: product.id, quantity: quantityB, reservedQuantity: 0 }]
        : []),
    ],
  });
  return {
    sku,
    inventoryA: rows[0].id,
    inventoryB: rows.length > 1 ? rows[1].id : null,
  };
}

async function expectFulfillmentError(
  run: () => Promise<unknown>,
  status: number,
  pattern?: RegExp
) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof FulfillmentError, `expected FulfillmentError, got ${String(error)}`);
    assert.equal(error.status, status, error.message);
    if (pattern) assert.match(error.message, pattern);
    return;
  }
  assert.fail("expected a FulfillmentError to be thrown");
}

before(async () => {
  rep = { id: "", role: "SALES_REP" };
  manager = { id: "", role: "SALES_MANAGER" };
  finance = { id: "", role: "FINANCE" };
  operations = { id: "", role: "OPERATIONS" };
  admin = { id: "", role: "ADMIN" };

  const passwordHash = "integration-test-hash";
  const userRows = await db.user.createManyAndReturn({
    data: [
      { name: `Test Rep ${suffix}`, email: `rep-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
      { name: `Test Manager ${suffix}`, email: `manager-${suffix}@test.local`, passwordHash, role: "SALES_MANAGER" },
      { name: `Test Finance ${suffix}`, email: `finance-${suffix}@test.local`, passwordHash, role: "FINANCE" },
      { name: `Test Ops ${suffix}`, email: `ops-${suffix}@test.local`, passwordHash, role: "OPERATIONS" },
      { name: `Test Admin ${suffix}`, email: `admin-${suffix}@test.local`, passwordHash, role: "ADMIN" },
    ],
  });
  rep.id = userRows[0].id;
  manager.id = userRows[1].id;
  finance.id = userRows[2].id;
  operations.id = userRows[3].id;
  admin.id = userRows[4].id;

  const customer = await db.customer.create({
    data: { name: `Test Customer ${suffix}`, email: `customer-${suffix}@test.local`, tier: "GOLD" },
    select: { id: true },
  });
  customerId = customer.id;

  const warehouses = await db.warehouse.createManyAndReturn({
    data: [
      { name: `Test WH-A ${suffix}`, location: "A" },
      { name: `Test WH-B ${suffix}`, location: "B" },
    ],
  });
  warehouseAId = warehouses[0].id;
  warehouseBId = warehouses[1].id;

  const productRows = await db.product.createManyAndReturn({
    data: [
      { name: `Test Gadget ${suffix}`, sku: `TST-GDG-${suffix}`, category: "Hardware", price: 500, cost: 250, maxDiscountPercent: 5, isRecurring: false },
      { name: `Test Widget ${suffix}`, sku: `TST-WDG-${suffix}`, category: "Hardware", price: 100, cost: 40, maxDiscountPercent: 10, isRecurring: false },
      { name: `Test Service ${suffix}`, sku: `TST-SVC-${suffix}`, category: "Software", price: 300, cost: 60, maxDiscountPercent: 20, isRecurring: true },
    ],
  });
  productBySku = Object.fromEntries(
    productRows.map((product) => [
      product.sku,
      {
        id: product.id,
        price: Number(product.price),
        cost: Number(product.cost),
        isRecurring: product.isRecurring,
      },
    ])
  );

  const inventoryRows = await db.inventory.createManyAndReturn({
    data: [
      { warehouseId: warehouseAId, productId: productBySku[`TST-GDG-${suffix}`].id, quantity: 8, reservedQuantity: 0 },
      { warehouseId: warehouseBId, productId: productBySku[`TST-GDG-${suffix}`].id, quantity: 5, reservedQuantity: 0 },
      { warehouseId: warehouseAId, productId: productBySku[`TST-WDG-${suffix}`].id, quantity: 20, reservedQuantity: 0 },
    ],
  });
  inventoryBySku[`TST-GDG-${suffix}`] = { a: inventoryRows[0].id, b: inventoryRows[1].id };
  inventoryBySku[`TST-WDG-${suffix}`] = { a: inventoryRows[2].id, b: null };
});

after(async () => {
  // Reservations reference inventory with onDelete: Restrict, so clear the
  // ledger first, then cascade through fulfillment → quotation → inventory.
  await db.inventoryReservation.deleteMany({
    where: { inventory: { product: { sku: { startsWith: `TST-` } } } },
  });
  await db.fulfillment.deleteMany({ where: { id: { in: fulfillmentIds } } });
  await db.quotation.deleteMany({ where: { id: { in: quotationIds } } });
  await db.inventory.deleteMany({ where: { product: { sku: { startsWith: `TST-` } } } });
  await db.product.deleteMany({ where: { sku: { startsWith: `TST-` } } });
  await db.warehouse.deleteMany({ where: { name: { startsWith: `Test WH-` } } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await db.$disconnect();
});

describe("fulfillment creation", () => {
  it("creates fulfillment from an APPROVED quotation and moves it to CONFIRMED", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-GDG-${suffix}`, quantity: 12, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    assert.equal(fulfillment.status, "PENDING_ALLOCATION");
    assert.equal(fulfillment.lines.length, 1);
    assert.equal(fulfillment.lines[0].requestedQuantity, 12);
    assert.equal(fulfillment.lines[0].status, "REQUESTED");

    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    assert.equal(quotation?.status, "CONFIRMED");
  });

  it("rejects fulfillment from a DRAFT quotation (409)", async () => {
    const quotation = await db.quotation.create({
      data: {
        quotationNumber: `QUOT-TEST-${suffix}-${++quoteSeq}`,
        customerId,
        salesRepId: rep.id,
        status: "DRAFT",
        subtotal: 100,
        discountTotal: 0,
        total: 100,
        margin: 50,
      },
      select: { id: true },
    });
    quotationIds.push(quotation.id);

    await expectFulfillmentError(
      () => createFulfillment(quotation.id, { role: operations.role, userId: operations.id }),
      409,
      /APPROVED/
    );
  });

  it("excludes recurring/service products from physical fulfillment", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-SVC-${suffix}`, quantity: 5, discountPercent: 0 },
      { productSku: `TST-WDG-${suffix}`, quantity: 3, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    assert.equal(fulfillment.lines.length, 1);
    assert.equal(fulfillment.lines[0].product.sku, `TST-WDG-${suffix}`);
    // The recurring product never creates a fulfillment line or backorder.
    const recurringLine = fulfillment.lines.find((line) => line.product.sku === `TST-SVC-${suffix}`);
    assert.equal(recurringLine, undefined);
  });
});

describe("allocation", () => {
  it("allocates across warehouses deterministically and creates ledger records", async () => {
    const { sku, inventoryA, inventoryB } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 12, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const allocated = await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(allocated.status, "ALLOCATED");
    assert.equal(allocated.lines[0].allocatedQuantity, 12);
    assert.equal(allocated.lines[0].backorderQuantity, 0);
    // A=8 (bigger), then B=4.
    assert.deepEqual(
      allocated.lines[0].allocations.map((a) => a.quantity).sort((x, y) => x - y),
      [4, 8]
    );

    // Reservations are recorded in the ledger and reflected in the counters.
    const inventoryARow = await db.inventory.findUnique({ where: { id: inventoryA } });
    const inventoryBRow = await db.inventory.findUnique({ where: { id: inventoryB! } });
    assert.equal(inventoryARow?.reservedQuantity, 8);
    assert.equal(inventoryBRow?.reservedQuantity, 4);

    const reservations = await db.inventoryReservation.findMany({
      where: { inventoryId: { in: [inventoryARow!.id, inventoryBRow!.id] } },
    });
    assert.equal(reservations.length, 2);
    assert.ok(reservations.every((r) => r.status === "ACTIVE"));
    assert.ok(reservations.every((r) => r.allocationId !== null));

    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    assert.equal(quotation?.status, "FULFILLING");
  });

  it("computes backorders when stock is insufficient", async () => {
    const { sku } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 20, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const allocated = await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(allocated.status, "PARTIALLY_ALLOCATED");
    assert.equal(allocated.lines[0].allocatedQuantity, 13);
    assert.equal(allocated.lines[0].backorderQuantity, 7);
    assert.equal(allocated.lines[0].status, "BACKORDERED");
  });
});

describe("fulfillment", () => {
  it("fulfills allocated stock and releases reservations (FULFILLING → COMPLETED)", async () => {
    const { sku, inventoryA } = await freshStock(20);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 5, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });

    const fulfilled = await fulfillFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(fulfilled.status, "COMPLETED");
    assert.equal(fulfilled.lines[0].fulfilledQuantity, 5);
    assert.equal(fulfilled.lines[0].status, "FULFILLED");

    const inventoryRow = await db.inventory.findUnique({ where: { id: inventoryA } });
    // Fulfillment converts a reservation into shipped goods: on-hand stays at
    // 20, the reservation is released (5 → 0).
    assert.equal(inventoryRow?.reservedQuantity, 0);
    assert.equal(inventoryRow?.quantity, 20);

    const reservations = await db.inventoryReservation.findMany({
      where: { inventoryId: inventoryRow!.id },
    });
    assert.ok(reservations.every((r) => r.status === "FULFILLED"));
    assert.ok(reservations.every((r) => r.releasedAt !== null));

    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    assert.equal(quotation?.status, "COMPLETED");
  });

  it("completion is blocked while backorders remain — fulfillment stays PARTIALLY_FULFILLED", async () => {
    const { sku } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 20, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    // 13 allocated, 7 backordered — fulfilling cannot complete.
    const fulfilled = await fulfillFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(fulfilled.status, "PARTIALLY_FULFILLED");
    assert.equal(fulfilled.lines[0].fulfilledQuantity, 13);
    assert.equal(fulfilled.lines[0].backorderQuantity, 7);
    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    assert.equal(quotation?.status, "FULFILLING");
  });
});

describe("explicit backorder", () => {
  it("marks unallocated lines as backordered when operations chooses not to allocate", async () => {
    const { sku, inventoryA } = await freshStock(20);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 30, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const backordered = await backorderFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(backordered.status, "PARTIALLY_ALLOCATED");
    assert.equal(backordered.lines[0].status, "BACKORDERED");
    assert.equal(backordered.lines[0].backorderQuantity, 30);
    assert.equal(backordered.lines[0].allocatedQuantity, 0);
    // No reservations were created for an explicit backorder.
    const inventoryRow = await db.inventory.findUnique({ where: { id: inventoryA } });
    assert.equal(inventoryRow?.reservedQuantity, 0);
  });
});

describe("backorder release", () => {
  it("releases a backorder when stock becomes available", async () => {
    const { sku, inventoryB } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 20, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });

    // Restock WH-B by 10 units (admin), then release the 7-unit backorder.
    await adjustInventory(inventoryB!, 10, { role: admin.role, userId: admin.id });
    const released = await releaseBackorder(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(released.status, "ALLOCATED");
    assert.equal(released.lines[0].backorderQuantity, 0);
    assert.equal(released.lines[0].allocatedQuantity, 20);

    const inventoryBRow = await db.inventory.findUnique({ where: { id: inventoryB! } });
    // WH-B initially allocated 5 of its 5 units, +10 restock, then the
    // 7-unit backorder is fully claimed from it → 5 + 7 reserved.
    assert.equal(inventoryBRow?.reservedQuantity, 12);
    assert.equal(inventoryBRow?.quantity, 15);
  });

  it("does nothing when no stock is available for the backorder", async () => {
    const { sku } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 20, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });

    const released = await releaseBackorder(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(released.lines[0].backorderQuantity, 7);
  });
});

describe("cancel", () => {
  it("cancels a fulfillment and releases all reservations (quotation back to APPROVED)", async () => {
    const { sku, inventoryA, inventoryB } = await freshStock(8, 5);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 12, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });

    const cancelled = await cancelFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(cancelled.status, "CANCELLED");
    assert.equal(cancelled.lines[0].status, "CANCELLED");

    const inventoryARow = await db.inventory.findUnique({ where: { id: inventoryA } });
    const inventoryBRow = await db.inventory.findUnique({ where: { id: inventoryB! } });
    assert.equal(inventoryARow?.reservedQuantity, 0);
    assert.equal(inventoryBRow?.reservedQuantity, 0);

    const reservations = await db.inventoryReservation.findMany({
      where: { inventoryId: { in: [inventoryARow!.id, inventoryBRow!.id] } },
    });
    assert.ok(reservations.every((r) => r.status === "RELEASED"));

    const quotation = await db.quotation.findUnique({ where: { id: quotationId } });
    assert.equal(quotation?.status, "APPROVED");
  });
});

describe("oversell protection", () => {
  // These tests need their own dedicated product + stock so they never
  // depend on how much earlier tests consumed or restored on the shared
  // rows, and so the allocator has no other warehouses to draw from.
  let stockSeq = 0;
  async function freshStock(quantity: number) {
    stockSeq += 1;
    const sku = `TST-OVR-${suffix}-${stockSeq}`;
    const product = await db.product.create({
      data: { name: `Test Overrun ${suffix}-${stockSeq}`, sku, category: "Hardware", price: 100, cost: 40, maxDiscountPercent: 10, isRecurring: false },
      select: { id: true, price: true, cost: true, isRecurring: true },
    });
    productBySku[sku] = {
      id: product.id,
      price: Number(product.price),
      cost: Number(product.cost),
      isRecurring: product.isRecurring,
    };
    const warehouse = await db.warehouse.create({
      data: { name: `Test WH-O ${suffix}-${stockSeq}`, location: "O" },
      select: { id: true },
    });
    const row = await db.inventory.create({
      data: {
        warehouseId: warehouse.id,
        productId: product.id,
        quantity,
        reservedQuantity: 0,
      },
      select: { id: true },
    });
    return { inventoryId: row.id, sku };
  }

  it("prevents allocating more than available (no negative availability)", async () => {
    const { inventoryId, sku } = await freshStock(20);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 30, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    // Only 20 units are available; the remaining 10 must be backordered
    // rather than oversold.
    const allocated = await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(allocated.lines[0].allocatedQuantity, 20);
    assert.equal(allocated.lines[0].backorderQuantity, 10);

    const inventoryRow = await db.inventory.findUnique({ where: { id: inventoryId } });
    assert.equal(inventoryRow?.reservedQuantity, 20);
    assert.equal(inventoryRow?.quantity, 20);
  });

  it("a pre-existing shortage yields a backorder, never a 409", async () => {
    const { inventoryId, sku } = await freshStock(25);
    const quotationId = await createQuotation(rep.id, [{ productSku: sku, quantity: 25, discountPercent: 0 }]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    // Reduce stock below the request before allocation: the allocator reads
    // the current availability and backorders the remainder — this is normal
    // business behavior, not a conflict.
    await adjustInventory(inventoryId, -15, { role: admin.role, userId: admin.id });
    const allocated = await allocateFulfillment(fulfillment.id, { role: operations.role, userId: operations.id });
    assert.equal(allocated.lines[0].allocatedQuantity, 10);
    assert.equal(allocated.lines[0].backorderQuantity, 15);
  });

  it("the conditional reserve guard rejects a stale claim (409 path)", async () => {
    // The service guards every reservation with
    //   UPDATE inventory SET reservedQuantity += n
    //   WHERE id = ... AND quantity - reservedQuantity >= n
    // and throws a 409 conflict when the affected-row count is 0. Two
    // sequential claims on the same row prove the guard: the second sees
    // reduced availability and is rejected, exactly as the service does
    // when stock changes between its read and its claim.
    const { inventoryId } = await freshStock(25);

    const first = await db.$transaction((tx) =>
      tx.$executeRaw`
        UPDATE "inventory"
        SET "reservedQuantity" = "reservedQuantity" + 15
        WHERE "id" = ${inventoryId}
          AND "quantity" - "reservedQuantity" >= 15
      `
    );
    assert.equal(first, 1); // first claim succeeds

    const second = await db.$transaction((tx) =>
      tx.$executeRaw`
        UPDATE "inventory"
        SET "reservedQuantity" = "reservedQuantity" + 15
        WHERE "id" = ${inventoryId}
          AND "quantity" - "reservedQuantity" >= 15
      `
    );
    assert.equal(second, 0); // stale claim is rejected → service would throw 409

    // Restore the row for the next test.
    await db.$transaction((tx) =>
      tx.$executeRaw`
        UPDATE "inventory"
        SET "reservedQuantity" = "reservedQuantity" - 15
        WHERE "id" = ${inventoryId}
      `
    );
  });
});

describe("authorization", () => {
  it("returns 403 for a sales rep attempting to create fulfillment", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    await expectFulfillmentError(
      () => createFulfillment(quotationId, { role: rep.role, userId: rep.id }),
      403
    );
  });

  it("returns 403 for FINANCE attempting fulfillment operations", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);
    await expectFulfillmentError(
      () => allocateFulfillment(fulfillment.id, { role: finance.role, userId: finance.id }),
      403
    );
  });

  it("gives a sales rep read-only access to their own quotation's fulfillment", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const viewed = await getFulfillment(fulfillment.id, { role: rep.role, userId: rep.id });
    assert.equal(viewed.id, fulfillment.id);
    const queue = await listFulfillments({ role: rep.role, userId: rep.id }, { page: 1, pageSize: 20 });
    assert.ok(queue.data.some((item) => item.id === fulfillment.id));

    // But the rep cannot act on it.
    await expectFulfillmentError(
      () => allocateFulfillment(fulfillment.id, { role: rep.role, userId: rep.id }),
      403
    );
  });

  it("blocks a sales rep from viewing another rep's fulfillment", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const otherRep = await db.user.create({
      data: { name: `Other Rep ${suffix}`, email: `other-rep-${suffix}@test.local`, passwordHash: "x", role: "SALES_REP" },
      select: { id: true },
    });
    await expectFulfillmentError(
      () => getFulfillment(fulfillment.id, { role: "SALES_REP", userId: otherRep.id }),
      403
    );
    const queue = await listFulfillments({ role: "SALES_REP", userId: otherRep.id }, { page: 1, pageSize: 20 });
    assert.ok(!queue.data.some((item) => item.id === fulfillment.id));
  });

  it("allows a manager read-only access", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const viewed = await getFulfillment(fulfillment.id, { role: manager.role, userId: manager.id });
    assert.equal(viewed.id, fulfillment.id);
    await expectFulfillmentError(
      () => allocateFulfillment(fulfillment.id, { role: manager.role, userId: manager.id }),
      403
    );
  });

  it("restricts inventory adjustment to ADMIN", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    await expectFulfillmentError(
      () => adjustInventory(inventoryBySku[`TST-WDG-${suffix}`].a!, 5, { role: operations.role, userId: operations.id }),
      403
    );
  });
});

describe("read helpers", () => {
  it("getFulfillmentForQuotation returns the latest active fulfillment", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: `TST-WDG-${suffix}`, quantity: 1, discountPercent: 0 },
    ]);
    const fulfillment = await createFulfillment(quotationId, { role: operations.role, userId: operations.id });
    fulfillmentIds.push(fulfillment.id);

    const found = await getFulfillmentForQuotation(quotationId, { role: rep.role, userId: rep.id });
    assert.equal(found?.id, fulfillment.id);
  });
});