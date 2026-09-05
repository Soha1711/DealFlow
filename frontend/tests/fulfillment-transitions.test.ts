import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  deriveLineStatus,
  quotationStatusForFulfillment,
  resolveFulfillmentTransition,
  type FulfillmentTransitionContext,
} from "../src/lib/modules/fulfillment/transitions.ts";

function context(
  overrides: Partial<FulfillmentTransitionContext> = {}
): FulfillmentTransitionContext {
  return {
    status: "PENDING_ALLOCATION",
    hasBackorders: false,
    allLinesFulfilled: false,
    ...overrides,
  };
}

describe("resolveFulfillmentTransition — allocation", () => {
  it("PENDING_ALLOCATION → ALLOCATED when fully covered", () => {
    const result = resolveFulfillmentTransition(context(), "allocate");
    assert.deepEqual(result, { ok: true, nextStatus: "ALLOCATED" });
  });

  it("PENDING_ALLOCATION → PARTIALLY_ALLOCATED when backorders remain", () => {
    const result = resolveFulfillmentTransition(
      context({ hasBackorders: true }),
      "allocate"
    );
    assert.deepEqual(result, { ok: true, nextStatus: "PARTIALLY_ALLOCATED" });
  });

  it("refuses allocation once allocation has started from a later state", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "PARTIALLY_FULFILLED" }),
      "allocate"
    );
    assert.equal(result.ok, false);
  });
});

describe("resolveFulfillmentTransition — backorder and release", () => {
  it("explicitly backorders from PENDING_ALLOCATION", () => {
    const result = resolveFulfillmentTransition(context(), "backorder");
    assert.deepEqual(result, { ok: true, nextStatus: "PARTIALLY_ALLOCATED" });
  });

  it("refuses explicit backorder once allocation has started", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "ALLOCATED" }),
      "backorder"
    );
    assert.equal(result.ok, false);
  });

  it("releases a backorder from PARTIALLY_ALLOCATED", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "PARTIALLY_ALLOCATED", hasBackorders: true }),
      "release"
    );
    assert.equal(result.ok, true);
  });

  it("releases a backorder from PARTIALLY_FULFILLED", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "PARTIALLY_FULFILLED", hasBackorders: true }),
      "release"
    );
    assert.equal(result.ok, true);
  });

  it("refuses release when there is nothing to release", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "PARTIALLY_ALLOCATED", hasBackorders: false }),
      "release"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "NOTHING_TO_DO");
  });
});

describe("resolveFulfillmentTransition — fulfill", () => {
  it("fulfills to COMPLETED when every line is fulfilled", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "ALLOCATED", allLinesFulfilled: true }),
      "fulfill"
    );
    assert.deepEqual(result, { ok: true, nextStatus: "COMPLETED" });
  });

  it("fulfills to PARTIALLY_FULFILLED while work remains", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "ALLOCATED", allLinesFulfilled: false }),
      "fulfill"
    );
    assert.deepEqual(result, { ok: true, nextStatus: "PARTIALLY_FULFILLED" });
  });

  it("refuses to fulfill before anything is allocated", () => {
    const result = resolveFulfillmentTransition(context(), "fulfill");
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "INVALID_STATE");
  });
});

describe("resolveFulfillmentTransition — cancel", () => {
  it("cancels from PENDING_ALLOCATION", () => {
    const result = resolveFulfillmentTransition(context(), "cancel");
    assert.deepEqual(result, { ok: true, nextStatus: "CANCELLED" });
  });

  it("cancels from PARTIALLY_FULFILLED", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "PARTIALLY_FULFILLED" }),
      "cancel"
    );
    assert.deepEqual(result, { ok: true, nextStatus: "CANCELLED" });
  });

  it("refuses to cancel a COMPLETED fulfillment", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "COMPLETED" }),
      "cancel"
    );
    assert.equal(result.ok, false);
  });

  it("refuses to cancel a CANCELLED fulfillment (terminal)", () => {
    const result = resolveFulfillmentTransition(
      context({ status: "CANCELLED" }),
      "cancel"
    );
    assert.equal(result.ok, false);
  });
});

describe("deriveLineStatus", () => {
  it("REQUESTED when nothing has been allocated", () => {
    assert.equal(
      deriveLineStatus({ requestedQuantity: 10, allocatedQuantity: 0, fulfilledQuantity: 0 }),
      "REQUESTED"
    );
  });

  it("ALLOCATED when fully allocated but not fulfilled", () => {
    assert.equal(
      deriveLineStatus({ requestedQuantity: 10, allocatedQuantity: 10, fulfilledQuantity: 0 }),
      "ALLOCATED"
    );
  });

  it("BACKORDERED when only partially allocated", () => {
    assert.equal(
      deriveLineStatus({ requestedQuantity: 10, allocatedQuantity: 6, fulfilledQuantity: 0 }),
      "BACKORDERED"
    );
  });

  it("PARTIALLY_FULFILLED when some quantity has shipped", () => {
    assert.equal(
      deriveLineStatus({ requestedQuantity: 10, allocatedQuantity: 6, fulfilledQuantity: 4 }),
      "PARTIALLY_FULFILLED"
    );
  });

  it("FULFILLED once the full request has shipped", () => {
    assert.equal(
      deriveLineStatus({ requestedQuantity: 10, allocatedQuantity: 10, fulfilledQuantity: 10 }),
      "FULFILLED"
    );
  });
});

describe("quotationStatusForFulfillment", () => {
  it("maps PENDING_ALLOCATION to CONFIRMED", () => {
    assert.equal(quotationStatusForFulfillment("PENDING_ALLOCATION"), "CONFIRMED");
  });

  it("maps allocation/fulfillment progress to FULFILLING", () => {
    assert.equal(quotationStatusForFulfillment("ALLOCATED"), "FULFILLING");
    assert.equal(quotationStatusForFulfillment("PARTIALLY_ALLOCATED"), "FULFILLING");
    assert.equal(quotationStatusForFulfillment("PARTIALLY_FULFILLED"), "FULFILLING");
    assert.equal(quotationStatusForFulfillment("FULFILLED"), "FULFILLING");
  });

  it("maps COMPLETED to COMPLETED", () => {
    assert.equal(quotationStatusForFulfillment("COMPLETED"), "COMPLETED");
  });

  it("maps CANCELLED back to APPROVED (reopenable)", () => {
    assert.equal(quotationStatusForFulfillment("CANCELLED"), "APPROVED");
  });
});