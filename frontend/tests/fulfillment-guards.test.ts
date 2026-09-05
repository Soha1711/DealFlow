import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canAdjustInventory,
  canOperateFulfillment,
  canViewFulfillment,
  canViewFulfillmentQueue,
  assertCanOperateFulfillment,
  assertCanAdjustInventory,
  assertCanViewFulfillment,
  assertCanViewFulfillmentQueue,
  type FulfillmentActor,
} from "../src/lib/modules/fulfillment/guards.ts";
import { FulfillmentError } from "../src/lib/modules/fulfillment/fulfillment-errors.ts";

function actor(role: FulfillmentActor["role"], userId = "user-1"): FulfillmentActor {
  return { role, userId };
}

function expectForbidden(run: () => void) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof FulfillmentError, `expected FulfillmentError, got ${String(error)}`);
    assert.equal(error.status, 403);
    return;
  }
  assert.fail("expected a FulfillmentError to be thrown");
}

describe("canOperateFulfillment", () => {
  it("allows OPERATIONS and ADMIN", () => {
    assert.equal(canOperateFulfillment("OPERATIONS"), true);
    assert.equal(canOperateFulfillment("ADMIN"), true);
  });

  it("denies all other roles", () => {
    for (const role of ["SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"] as const) {
      assert.equal(canOperateFulfillment(role), false);
    }
  });
});

describe("canAdjustInventory", () => {
  it("allows ADMIN only", () => {
    assert.equal(canAdjustInventory("ADMIN"), true);
    assert.equal(canAdjustInventory("OPERATIONS"), false);
    assert.equal(canAdjustInventory("FINANCE"), false);
  });
});

describe("canViewFulfillment", () => {
  it("allows OPERATIONS and ADMIN for any quotation", () => {
    assert.equal(canViewFulfillment(actor("OPERATIONS"), "someone-else"), true);
    assert.equal(canViewFulfillment(actor("ADMIN"), "someone-else"), true);
  });

  it("allows SALES_MANAGER read access", () => {
    assert.equal(canViewFulfillment(actor("SALES_MANAGER"), "anyone"), true);
  });

  it("allows a SALES_REP only for their own quotations", () => {
    assert.equal(canViewFulfillment(actor("SALES_REP", "rep-1"), "rep-1"), true);
    assert.equal(canViewFulfillment(actor("SALES_REP", "rep-1"), "rep-2"), false);
  });

  it("denies FINANCE and CUSTOMER", () => {
    assert.equal(canViewFulfillment(actor("FINANCE"), "anyone"), false);
    assert.equal(canViewFulfillment(actor("CUSTOMER"), "anyone"), false);
  });
});

describe("canViewFulfillmentQueue", () => {
  it("excludes FINANCE and CUSTOMER", () => {
    assert.equal(canViewFulfillmentQueue("OPERATIONS"), true);
    assert.equal(canViewFulfillmentQueue("ADMIN"), true);
    assert.equal(canViewFulfillmentQueue("SALES_REP"), true);
    assert.equal(canViewFulfillmentQueue("SALES_MANAGER"), true);
    assert.equal(canViewFulfillmentQueue("FINANCE"), false);
    assert.equal(canViewFulfillmentQueue("CUSTOMER"), false);
  });
});

describe("assert helpers throw 403", () => {
  it("assertCanOperateFulfillment throws for a sales rep", () => {
    expectForbidden(() => assertCanOperateFulfillment("SALES_REP"));
    assert.doesNotThrow(() => assertCanOperateFulfillment("OPERATIONS"));
  });

  it("assertCanAdjustInventory throws for OPERATIONS", () => {
    expectForbidden(() => assertCanAdjustInventory("OPERATIONS"));
    assert.doesNotThrow(() => assertCanAdjustInventory("ADMIN"));
  });

  it("assertCanViewFulfillment blocks cross-rep access", () => {
    expectForbidden(() => assertCanViewFulfillment(actor("SALES_REP", "rep-1"), "rep-2"));
    assert.doesNotThrow(() => assertCanViewFulfillment(actor("SALES_REP", "rep-1"), "rep-1"));
  });

  it("assertCanViewFulfillmentQueue throws for FINANCE", () => {
    expectForbidden(() => assertCanViewFulfillmentQueue("FINANCE"));
    expectForbidden(() => assertCanViewFulfillmentQueue("CUSTOMER"));
  });
});