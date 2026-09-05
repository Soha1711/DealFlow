import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  assertCanViewDealHealth,
  canAccessDealHealthArea,
  canViewDealHealth,
} from "@/lib/modules/deal-health/deal-health-guards";
import { DealHealthError } from "@/lib/modules/deal-health/deal-health-errors";

describe("Deal Health Guards", () => {
  it("blocks customers from baseline deal health area access", () => {
    assert.equal(canAccessDealHealthArea("CUSTOMER"), false);
  });

  it("permits internal roles to baseline deal health area access", () => {
    assert.equal(canAccessDealHealthArea("ADMIN"), true);
    assert.equal(canAccessDealHealthArea("SALES_MANAGER"), true);
    assert.equal(canAccessDealHealthArea("FINANCE"), true);
    assert.equal(canAccessDealHealthArea("OPERATIONS"), true);
    assert.equal(canAccessDealHealthArea("SALES_REP"), true);
  });

  it("enforces sales rep isolation: sales reps can only view their own deals", () => {
    // Owner rep -> true
    assert.equal(
      canViewDealHealth({
        role: "SALES_REP",
        userId: "rep-1",
        salesRepId: "rep-1",
      }),
      true
    );

    // Other rep -> false
    assert.equal(
      canViewDealHealth({
        role: "SALES_REP",
        userId: "rep-2",
        salesRepId: "rep-1",
      }),
      false
    );
  });

  it("allows managers and admins to view any deal", () => {
    assert.equal(
      canViewDealHealth({
        role: "ADMIN",
        userId: "admin-1",
        salesRepId: "rep-1",
      }),
      true
    );

    assert.equal(
      canViewDealHealth({
        role: "SALES_MANAGER",
        userId: "mgr-1",
        salesRepId: "rep-1",
      }),
      true
    );
  });

  it("assertCanViewDealHealth throws 403 when unauthorized", () => {
    assert.throws(
      () =>
        assertCanViewDealHealth({
          role: "CUSTOMER",
          userId: "cust-1",
          salesRepId: "rep-1",
        }),
      (err: unknown) => err instanceof DealHealthError && err.status === 403
    );

    assert.throws(
      () =>
        assertCanViewDealHealth({
          role: "SALES_REP",
          userId: "rep-other",
          salesRepId: "rep-1",
        }),
      (err: unknown) => err instanceof DealHealthError && err.status === 403
    );
  });
});
