import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { canActOnApproval, canViewApprovals, type ApprovalGuardContext } from "../src/lib/modules/approvals/approval-guards.ts";

function guard(
  role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "OPERATIONS" | "CUSTOMER",
  level: "MANAGER" | "FINANCE",
  actorUserId: string,
  salesRepId: string
): ApprovalGuardContext {
  return { actor: { role, userId: actorUserId }, level, salesRepId };
}

const REP = "user-rep";
const MANAGER = "user-manager";
const FINANCE = "user-finance";
const ADMIN = "user-admin";

describe("role rules", () => {
  it("lets a sales manager act on manager-level approvals", () => {
    assert.equal(canActOnApproval(guard("SALES_MANAGER", "MANAGER", MANAGER, REP)).allowed, true);
  });

  it("lets finance act on finance-level approvals", () => {
    assert.equal(canActOnApproval(guard("FINANCE", "FINANCE", FINANCE, REP)).allowed, true);
  });

  it("lets admin act on both levels", () => {
    assert.equal(canActOnApproval(guard("ADMIN", "MANAGER", ADMIN, REP)).allowed, true);
    assert.equal(canActOnApproval(guard("ADMIN", "FINANCE", ADMIN, REP)).allowed, true);
  });

  it("blocks a sales rep from approving anything", () => {
    assert.equal(canActOnApproval(guard("SALES_REP", "MANAGER", REP, REP)).allowed, false);
  });

  it("blocks operations and customers", () => {
    assert.equal(canActOnApproval(guard("OPERATIONS", "MANAGER", "op", REP)).allowed, false);
    assert.equal(canActOnApproval(guard("CUSTOMER", "FINANCE", "cust", REP)).allowed, false);
  });

  it("blocks a manager from acting on finance-level approvals", () => {
    const decision = canActOnApproval(guard("SALES_MANAGER", "FINANCE", MANAGER, REP));
    assert.equal(decision.allowed, false);
  });

  it("blocks finance from bypassing the manager stage (CRITICAL)", () => {
    const decision = canActOnApproval(guard("FINANCE", "MANAGER", FINANCE, REP));
    assert.equal(decision.allowed, false);
    if (!decision.allowed) {
      assert.match(decision.message, /manager stage must complete/i);
    }
  });
});

describe("self-approval prevention", () => {
  it("blocks a manager from approving their own quotation", () => {
    assert.equal(canActOnApproval(guard("SALES_MANAGER", "MANAGER", MANAGER, MANAGER)).allowed, false);
  });

  it("blocks finance from approving their own quotation", () => {
    assert.equal(canActOnApproval(guard("FINANCE", "FINANCE", FINANCE, FINANCE)).allowed, false);
  });

  it("blocks admin from approving their own quotation", () => {
    assert.equal(canActOnApproval(guard("ADMIN", "MANAGER", ADMIN, ADMIN)).allowed, false);
  });
});

describe("queue visibility", () => {
  it("allows admin, sales manager and finance", () => {
    assert.equal(canViewApprovals("ADMIN"), true);
    assert.equal(canViewApprovals("SALES_MANAGER"), true);
    assert.equal(canViewApprovals("FINANCE"), true);
  });

  it("denies sales rep, operations and customer", () => {
    assert.equal(canViewApprovals("SALES_REP"), false);
    assert.equal(canViewApprovals("OPERATIONS"), false);
    assert.equal(canViewApprovals("CUSTOMER"), false);
  });
});