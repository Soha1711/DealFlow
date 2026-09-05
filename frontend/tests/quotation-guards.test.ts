import { describe, it } from "node:test";
import assert from "node:assert/strict";

import type { Role } from "@prisma/client";

import {
  canEditQuotation,
  canSubmitQuotation,
  canViewQuotation,
  isEditableStatus,
} from "../src/lib/modules/quotations/guards.ts";

function context(overrides: {
  role?: Role;
  userId?: string;
  salesRepId?: string;
  status?: "DRAFT" | "PENDING_APPROVAL";
}) {
  return {
    role: overrides.role ?? "SALES_REP",
    userId: overrides.userId ?? "user-1",
    salesRepId: overrides.salesRepId ?? "user-1",
    status: overrides.status ?? "DRAFT",
  };
}

describe("canViewQuotation", () => {
  it("lets a sales rep view their own quotation", () => {
    assert.equal(canViewQuotation(context({ role: "SALES_REP" })), true);
  });

  it("blocks a sales rep from viewing another rep's quotation", () => {
    assert.equal(
      canViewQuotation(context({ role: "SALES_REP", salesRepId: "user-2" })),
      false
    );
  });

  it("lets managers and admins view any quotation", () => {
    assert.equal(
      canViewQuotation(context({ role: "SALES_MANAGER", salesRepId: "user-2" })),
      true
    );
    assert.equal(
      canViewQuotation(context({ role: "ADMIN", salesRepId: "user-2" })),
      true
    );
  });

  it("blocks roles without quotation area access", () => {
    assert.equal(
      canViewQuotation(context({ role: "FINANCE", salesRepId: "user-2" })),
      false
    );
    assert.equal(
      canViewQuotation(context({ role: "OPERATIONS", salesRepId: "user-2" })),
      false
    );
  });
});

describe("canEditQuotation", () => {
  it("lets the owner edit their DRAFT quotation", () => {
    assert.equal(
      canEditQuotation(
        context({ role: "SALES_REP", status: "DRAFT" })
      ),
      true
    );
  });

  it("blocks editing a PENDING_APPROVAL quotation", () => {
    assert.equal(
      canEditQuotation(
        context({ role: "SALES_REP", status: "PENDING_APPROVAL" })
      ),
      false
    );
  });

  it("blocks editing another rep's DRAFT quotation", () => {
    assert.equal(
      canEditQuotation(
        context({ role: "SALES_REP", salesRepId: "user-2", status: "DRAFT" })
      ),
      false
    );
  });

  it("does not give managers edit rights over other reps' quotations", () => {
    assert.equal(
      canEditQuotation(
        context({ role: "SALES_MANAGER", salesRepId: "user-2", status: "DRAFT" })
      ),
      false
    );
  });
});

describe("canSubmitQuotation", () => {
  it("lets the owner submit their DRAFT quotation", () => {
    assert.equal(canSubmitQuotation(context({ role: "SALES_REP", status: "DRAFT" })), true);
  });

  it("blocks submitting a PENDING_APPROVAL quotation", () => {
    assert.equal(
      canSubmitQuotation(context({ role: "SALES_REP", status: "PENDING_APPROVAL" })),
      false
    );
  });

  it("blocks submitting another rep's quotation", () => {
    assert.equal(
      canSubmitQuotation(context({ role: "SALES_REP", salesRepId: "user-2", status: "DRAFT" })),
      false
    );
  });
});

describe("isEditableStatus", () => {
  it("only DRAFT is editable in Phase 2", () => {
    assert.equal(isEditableStatus("DRAFT"), true);
    assert.equal(isEditableStatus("PENDING_APPROVAL"), false);
    assert.equal(isEditableStatus("APPROVED"), false);
    assert.equal(isEditableStatus("CONFIRMED"), false);
    assert.equal(isEditableStatus("COMPLETED"), false);
  });
});