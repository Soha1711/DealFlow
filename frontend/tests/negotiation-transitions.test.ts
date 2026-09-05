import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  canCustomerAcceptQuotation,
  canInitiateNegotiation,
  resolveNegotiationStatusTransition,
} from "../src/lib/modules/negotiations/negotiation-transitions.ts";

describe("resolveNegotiationStatusTransition", () => {
  it("submits a fresh negotiation when none is active", () => {
    const res = resolveNegotiationStatusTransition(undefined, "submit");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.nextStatus, "PENDING");
    }
  });

  it("blocks submitting if a negotiation is already active", () => {
    const res = resolveNegotiationStatusTransition("PENDING", "submit");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "INVALID_STATE");
    }
  });

  it("allows sales rep to counter a PENDING negotiation", () => {
    const res = resolveNegotiationStatusTransition("PENDING", "counter");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.nextStatus, "COUNTERED");
    }
  });

  it("blocks countering an already resolved negotiation", () => {
    const resAccepted = resolveNegotiationStatusTransition("ACCEPTED", "counter");
    assert.equal(resAccepted.ok, false);
    if (!resAccepted.ok) {
      assert.equal(resAccepted.reason, "ALREADY_ACTED");
    }

    const resRejected = resolveNegotiationStatusTransition("REJECTED", "counter");
    assert.equal(resRejected.ok, false);
    if (!resRejected.ok) {
      assert.equal(resRejected.reason, "ALREADY_ACTED");
    }
  });

  it("allows customer to respond to a COUNTERED negotiation", () => {
    const res = resolveNegotiationStatusTransition("COUNTERED", "respond");
    assert.equal(res.ok, true);
    if (res.ok) {
      assert.equal(res.nextStatus, "PENDING");
    }
  });

  it("blocks customer from responding to an uncountered negotiation", () => {
    const res = resolveNegotiationStatusTransition("PENDING", "respond");
    assert.equal(res.ok, false);
    if (!res.ok) {
      assert.equal(res.reason, "INVALID_STATE");
    }
  });

  it("allows sales rep to accept a PENDING or COUNTERED negotiation", () => {
    const res1 = resolveNegotiationStatusTransition("PENDING", "accept");
    assert.equal(res1.ok, true);
    if (res1.ok) assert.equal(res1.nextStatus, "ACCEPTED");

    const res2 = resolveNegotiationStatusTransition("COUNTERED", "accept");
    assert.equal(res2.ok, true);
    if (res2.ok) assert.equal(res2.nextStatus, "ACCEPTED");
  });

  it("allows sales rep to reject a PENDING or COUNTERED negotiation", () => {
    const res1 = resolveNegotiationStatusTransition("PENDING", "reject");
    assert.equal(res1.ok, true);
    if (res1.ok) assert.equal(res1.nextStatus, "REJECTED");

    const res2 = resolveNegotiationStatusTransition("COUNTERED", "reject");
    assert.equal(res2.ok, true);
    if (res2.ok) assert.equal(res2.nextStatus, "REJECTED");
  });

  it("never allows an ACCEPTED or REJECTED negotiation to be acted on again", () => {
    const res1 = resolveNegotiationStatusTransition("ACCEPTED", "accept");
    assert.equal(res1.ok, false);
    if (!res1.ok) assert.equal(res1.reason, "ALREADY_ACTED");

    const res2 = resolveNegotiationStatusTransition("REJECTED", "accept");
    assert.equal(res2.ok, false);
    if (!res2.ok) assert.equal(res2.reason, "ALREADY_ACTED");

    const res3 = resolveNegotiationStatusTransition("ACCEPTED", "reject");
    assert.equal(res3.ok, false);
    if (!res3.ok) assert.equal(res3.reason, "ALREADY_ACTED");
  });
});

describe("canInitiateNegotiation", () => {
  it("only allows initiating negotiations on APPROVED quotations", () => {
    assert.equal(canInitiateNegotiation("APPROVED"), true);
    assert.equal(canInitiateNegotiation("DRAFT"), false);
    assert.equal(canInitiateNegotiation("PENDING_APPROVAL"), false);
    assert.equal(canInitiateNegotiation("PENDING_MANAGER"), false);
    assert.equal(canInitiateNegotiation("PENDING_FINANCE"), false);
    assert.equal(canInitiateNegotiation("UNDER_NEGOTIATION"), false);
    assert.equal(canInitiateNegotiation("CONFIRMED"), false);
    assert.equal(canInitiateNegotiation("FULFILLING"), false);
    assert.equal(canInitiateNegotiation("COMPLETED"), false);
    assert.equal(canInitiateNegotiation("REJECTED"), false);
  });
});

describe("canCustomerAcceptQuotation", () => {
  it("only allows customer acceptance on APPROVED quotations", () => {
    assert.equal(canCustomerAcceptQuotation("APPROVED"), true);
    assert.equal(canCustomerAcceptQuotation("DRAFT"), false);
    assert.equal(canCustomerAcceptQuotation("UNDER_NEGOTIATION"), false);
    assert.equal(canCustomerAcceptQuotation("CONFIRMED"), false);
  });
});
