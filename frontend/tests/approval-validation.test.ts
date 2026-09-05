import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  approveApprovalSchema,
  listApprovalsQuerySchema,
  rejectApprovalSchema,
} from "../src/lib/modules/approvals/approval-validation.ts";

describe("approveApprovalSchema", () => {
  it("accepts an empty object body", () => {
    assert.equal(approveApprovalSchema.safeParse({}).success, true);
  });

  it("rejects unknown fields", () => {
    assert.equal(approveApprovalSchema.safeParse({ note: "hi" }).success, false);
  });
});

describe("rejectApprovalSchema", () => {
  it("accepts a non-empty reason", () => {
    const result = rejectApprovalSchema.safeParse({
      reason: "Discount exceeds acceptable margin.",
    });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.reason, "Discount exceeds acceptable margin.");
    }
  });

  it("requires a reason", () => {
    assert.equal(rejectApprovalSchema.safeParse({}).success, false);
  });

  it("rejects an empty reason", () => {
    assert.equal(rejectApprovalSchema.safeParse({ reason: "" }).success, false);
  });

  it("rejects a whitespace-only reason", () => {
    assert.equal(rejectApprovalSchema.safeParse({ reason: "   " }).success, false);
  });

  it("trims surrounding whitespace", () => {
    const result = rejectApprovalSchema.safeParse({ reason: "  too deep  " });
    assert.equal(result.success, true);
    if (result.success) assert.equal(result.data.reason, "too deep");
  });

  it("rejects reasons longer than 500 characters", () => {
    assert.equal(
      rejectApprovalSchema.safeParse({ reason: "x".repeat(501) }).success,
      false
    );
  });
});

describe("listApprovalsQuerySchema", () => {
  it("defaults page and pageSize", () => {
    const result = listApprovalsQuerySchema.safeParse({});
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 1);
      assert.equal(result.data.pageSize, 20);
    }
  });

  it("coerces string numbers from the URL", () => {
    const result = listApprovalsQuerySchema.safeParse({ page: "2", pageSize: "50" });
    assert.equal(result.success, true);
    if (result.success) {
      assert.equal(result.data.page, 2);
      assert.equal(result.data.pageSize, 50);
    }
  });

  it("accepts status and level filters", () => {
    assert.equal(
      listApprovalsQuerySchema.safeParse({ status: "PENDING", level: "FINANCE" }).success,
      true
    );
  });

  it("rejects unsupported statuses and levels", () => {
    assert.equal(listApprovalsQuerySchema.safeParse({ status: "BOGUS" }).success, false);
    assert.equal(listApprovalsQuerySchema.safeParse({ level: "CEO" }).success, false);
  });

  it("rejects malformed paging values", () => {
    assert.equal(listApprovalsQuerySchema.safeParse({ page: "0" }).success, false);
    assert.equal(listApprovalsQuerySchema.safeParse({ pageSize: "500" }).success, false);
  });
});