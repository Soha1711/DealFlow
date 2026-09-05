import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { resolveApprovalTransition, type ApprovalTransitionContext } from "../src/lib/modules/approvals/approval-transitions.ts";

function context(overrides: Partial<ApprovalTransitionContext> = {}): ApprovalTransitionContext {
  return {
    approvalStatus: "PENDING",
    approvalLevel: "MANAGER",
    quotationStatus: "PENDING_MANAGER",
    requiredApprovalLevel: "MANAGER",
    ...overrides,
  };
}

describe("resolveApprovalTransition — manager stage", () => {
  it("approves a MEDIUM/HIGH quotation (manager only)", () => {
    const result = resolveApprovalTransition(context(), "approve");
    assert.deepEqual(result, { ok: true, nextQuotationStatus: "APPROVED" });
  });

  it("moves a CRITICAL quotation to PENDING_FINANCE after manager approval", () => {
    const result = resolveApprovalTransition(
      context({ requiredApprovalLevel: "MANAGER_AND_FINANCE" }),
      "approve"
    );
    assert.deepEqual(result, { ok: true, nextQuotationStatus: "PENDING_FINANCE" });
  });

  it("rejects a manager-stage quotation to REJECTED", () => {
    const result = resolveApprovalTransition(context(), "reject");
    assert.deepEqual(result, { ok: true, nextQuotationStatus: "REJECTED" });
  });

  it("refuses to approve when the quotation is not awaiting manager action", () => {
    const result = resolveApprovalTransition(
      context({ quotationStatus: "PENDING_FINANCE" }),
      "approve"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "STATUS_MISMATCH");
  });
});

describe("resolveApprovalTransition — finance stage", () => {
  it("approves a CRITICAL quotation after finance approval", () => {
    const result = resolveApprovalTransition(
      context({
        approvalLevel: "FINANCE",
        quotationStatus: "PENDING_FINANCE",
        requiredApprovalLevel: "MANAGER_AND_FINANCE",
      }),
      "approve"
    );
    assert.deepEqual(result, { ok: true, nextQuotationStatus: "APPROVED" });
  });

  it("rejects a CRITICAL quotation at the finance stage", () => {
    const result = resolveApprovalTransition(
      context({
        approvalLevel: "FINANCE",
        quotationStatus: "PENDING_FINANCE",
        requiredApprovalLevel: "MANAGER_AND_FINANCE",
      }),
      "reject"
    );
    assert.deepEqual(result, { ok: true, nextQuotationStatus: "REJECTED" });
  });

  it("refuses finance approval before the manager stage completes", () => {
    const result = resolveApprovalTransition(
      context({
        approvalLevel: "FINANCE",
        quotationStatus: "PENDING_MANAGER",
        requiredApprovalLevel: "MANAGER_AND_FINANCE",
      }),
      "approve"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "STATUS_MISMATCH");
  });
});

describe("resolveApprovalTransition — stale approvals", () => {
  it("never allows an APPROVED approval to be acted on again", () => {
    const result = resolveApprovalTransition(
      context({ approvalStatus: "APPROVED" }),
      "approve"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "ALREADY_ACTED");
  });

  it("never allows a REJECTED approval to be acted on again", () => {
    const result = resolveApprovalTransition(
      context({ approvalStatus: "REJECTED" }),
      "approve"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "ALREADY_ACTED");
  });

  it("never allows a REJECTED approval to be re-approved", () => {
    const result = resolveApprovalTransition(
      context({ approvalStatus: "REJECTED" }),
      "approve"
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "ALREADY_ACTED");
  });
});