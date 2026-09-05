import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { BillingError } from "../src/lib/modules/billing/billing-errors.ts";
import {
  assertCanManageBilling,
  assertCanViewBillingArea,
  assertCanViewBillingForQuotation,
  canManageBilling,
  canViewAllBilling,
  canViewBillingForQuotation,
  salesRepSeesOwnQuotationsOnly,
  type BillingActor,
} from "../src/lib/modules/billing/billing-guards.ts";

const actor = (role: BillingActor["role"], userId = "u1"): BillingActor => ({
  role,
  userId,
});

function expectGuardError(run: () => void, status: number, pattern?: RegExp) {
  try {
    run();
  } catch (error) {
    assert.ok(error instanceof BillingError, `expected BillingError, got ${String(error)}`);
    assert.equal(error.status, status);
    if (pattern) assert.match(error.message, pattern);
    return;
  }
  assert.fail("expected a BillingError to be thrown");
}

describe("billing mutation access", () => {
  it("FINANCE and ADMIN may manage billing", () => {
    assert.equal(canManageBilling("FINANCE"), true);
    assert.equal(canManageBilling("ADMIN"), true);
  });

  it("no other role may mutate billing", () => {
    for (const role of ["SALES_REP", "SALES_MANAGER", "OPERATIONS", "CUSTOMER"]) {
      assert.equal(canManageBilling(role as never), false, role);
    }
  });

  it("assertCanManageBilling throws 403 for non-managers", () => {
    for (const role of ["SALES_REP", "SALES_MANAGER", "OPERATIONS", "CUSTOMER"]) {
      expectGuardError(() => assertCanManageBilling(role as never), 403, /not authorized/);
    }
    // Managers never throw.
    assertCanManageBilling("FINANCE");
    assertCanManageBilling("ADMIN");
  });
});

describe("billing read visibility", () => {
  it("finance, admin and sales managers see all billing", () => {
    for (const role of ["FINANCE", "ADMIN", "SALES_MANAGER"]) {
      assert.equal(canViewAllBilling(role as never), true, role);
      assert.equal(salesRepSeesOwnQuotationsOnly(role as never), false, role);
    }
  });

  it("only sales reps are restricted to their own quotations", () => {
    assert.equal(salesRepSeesOwnQuotationsOnly("SALES_REP"), true);
    assert.equal(canViewAllBilling("SALES_REP"), false);
  });

  it("finance/admin/manager may view any quotation's billing", () => {
    for (const role of ["FINANCE", "ADMIN", "SALES_MANAGER"]) {
      assert.equal(canViewBillingForQuotation(actor(role as never), "someone-else"), true, role);
    }
  });

  it("a sales rep can only view billing on quotations they own", () => {
    const rep = actor("SALES_REP", "rep-1");
    assert.equal(canViewBillingForQuotation(rep, "rep-1"), true);
    assert.equal(canViewBillingForQuotation(rep, "rep-2"), false);
    expectGuardError(() => assertCanViewBillingForQuotation(rep, "rep-2"), 403);
  });

  it("OPERATIONS and CUSTOMER cannot reach the billing area at all", () => {
    for (const role of ["OPERATIONS", "CUSTOMER"]) {
      expectGuardError(() => assertCanViewBillingArea(role as never), 403, /access to billing/);
    }
    // Everyone with billing-area access passes.
    for (const role of ["FINANCE", "ADMIN", "SALES_MANAGER", "SALES_REP"]) {
      assertCanViewBillingArea(role as never);
    }
  });
});
