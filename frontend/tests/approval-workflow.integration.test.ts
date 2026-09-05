import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import {
  approveApproval,
  listApprovalQueue,
  rejectApproval,
  routeSubmittedQuotation,
} from "@/lib/modules/approvals/approval-service";
import { ApprovalError } from "@/lib/modules/approvals/approval-errors";
import {
  calculateLinePricing,
  calculateQuotationTotals,
} from "@/lib/modules/quotations/pricing";

/**
 * End-to-end workflow tests against the local PostgreSQL database
 * (DATABASE_URL from frontend/.env). Every record created here is deleted in
 * `after`, so the dev database is left untouched. Requires the docker-compose
 * Postgres to be running.
 */

const suffix = Date.now().toString(36).toUpperCase();

type SeedUser = { id: string; role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" };

let rep: SeedUser;
let manager: SeedUser;
let finance: SeedUser;
let admin: SeedUser;
let customerId: string;
let productBySku: Record<string, { id: string; price: number; cost: number; maxDiscountPercent: number }> = {};
const quotationIds: string[] = [];
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
      isRecurring: false,
      ...pricing,
    };
  });
  const totals = calculateQuotationTotals(pricedLines);
  const quotation = await db.quotation.create({
    data: {
      quotationNumber: `QUOT-TEST-${suffix}-${quoteSeq}`,
      customerId,
      salesRepId,
      status: "DRAFT",
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

async function submit(quotationId: string) {
  return db.$transaction((tx) => routeSubmittedQuotation(tx, quotationId));
}

async function pendingManagerApproval(quotationId: string) {
  const approval = await db.approval.findFirst({
    where: { quotationId, level: "MANAGER" },
    orderBy: { createdAt: "desc" },
  });
  assert.ok(approval, "expected a manager approval to exist");
  return approval;
}

async function expectApprovalError(
  run: () => Promise<unknown>,
  status: number,
  pattern?: RegExp
) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof ApprovalError, `expected ApprovalError, got ${String(error)}`);
    assert.equal(error.status, status, error.message);
    if (pattern) assert.match(error.message, pattern);
    return;
  }
  assert.fail("expected an ApprovalError to be thrown");
}

before(async () => {
  rep = { id: "", role: "SALES_REP" };
  manager = { id: "", role: "SALES_MANAGER" };
  finance = { id: "", role: "FINANCE" };
  admin = { id: "", role: "ADMIN" };

  const passwordHash = "integration-test-hash";
  const userRows = await db.user.createManyAndReturn({
    data: [
      { name: `Test Rep ${suffix}`, email: `rep-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
      { name: `Test Manager ${suffix}`, email: `manager-${suffix}@test.local`, passwordHash, role: "SALES_MANAGER" },
      { name: `Test Finance ${suffix}`, email: `finance-${suffix}@test.local`, passwordHash, role: "FINANCE" },
      { name: `Test Admin ${suffix}`, email: `admin-${suffix}@test.local`, passwordHash, role: "ADMIN" },
    ],
  });
  rep.id = userRows[0].id;
  manager.id = userRows[1].id;
  finance.id = userRows[2].id;
  admin.id = userRows[3].id;

  const customer = await db.customer.create({
    data: { name: `Test Customer ${suffix}`, email: `customer-${suffix}@test.local`, tier: "GOLD" },
    select: { id: true },
  });
  customerId = customer.id;

  const productRows = await db.product.createManyAndReturn({
    data: [
      { name: `Test Beacon ${suffix}`, sku: `TST-BCN-${suffix}`, category: "Hardware", price: 999, cost: 540, maxDiscountPercent: 5 },
      { name: `Test CRM ${suffix}`, sku: `TST-CRM-${suffix}`, category: "Software", price: 240, cost: 96, maxDiscountPercent: 20 },
      { name: `Test Suite ${suffix}`, sku: `TST-SUI-${suffix}`, category: "Software", price: 1000, cost: 400, maxDiscountPercent: 35 },
    ],
  });
  productBySku = Object.fromEntries(
    productRows.map((product) => [
      product.sku,
      {
        id: product.id,
        price: Number(product.price),
        cost: Number(product.cost),
        maxDiscountPercent: product.maxDiscountPercent,
      },
    ])
  );
});

after(async () => {
  await db.quotation.deleteMany({ where: { id: { in: quotationIds } } });
  await db.product.deleteMany({ where: { sku: { startsWith: `TST-` } } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await db.$disconnect();
});

describe("submit routing (deterministic discount check)", () => {
  it("LOW risk: submits directly to APPROVED with no approvals", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-SUI-${suffix}`, quantity: 2, discountPercent: 10 }]);
    const { risk } = await submit(id);
    assert.equal(risk.level, "LOW");
    assert.equal(risk.requiredApprovalLevel, "NONE");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "APPROVED");
    assert.equal(quotation?.riskScore, 0);
    const approvals = await db.approval.count({ where: { quotationId: id } });
    assert.equal(approvals, 0);
  });

  it("MEDIUM risk: routes to PENDING_MANAGER with a manager approval", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    const { risk } = await submit(id);
    assert.equal(risk.level, "MEDIUM");
    assert.equal(risk.requiredApprovalLevel, "MANAGER");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "PENDING_MANAGER");
    const approval = await pendingManagerApproval(id);
    assert.equal(approval.status, "PENDING");
  });

  it("HIGH risk: routes to PENDING_MANAGER (manager approval only)", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 40 }]);
    const { risk } = await submit(id);
    assert.equal(risk.level, "HIGH");
    assert.equal(risk.requiredApprovalLevel, "MANAGER");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "PENDING_MANAGER");
  });

  it("CRITICAL risk: routes to PENDING_MANAGER and creates only the manager approval", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    const { risk } = await submit(id);
    assert.equal(risk.level, "CRITICAL");
    assert.equal(risk.requiredApprovalLevel, "MANAGER_AND_FINANCE");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "PENDING_MANAGER");
    const approvals = await db.approval.findMany({ where: { quotationId: id } });
    assert.equal(approvals.length, 1);
    assert.equal(approvals[0].level, "MANAGER");
    assert.equal(approvals[0].status, "PENDING");
  });
});

describe("manager stage", () => {
  it("approves a MEDIUM quotation to APPROVED", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);

    const outcome = await approveApproval(approval.id, { role: manager.role, userId: manager.id });
    assert.equal(outcome.nextQuotationStatus, "APPROVED");
    assert.equal(outcome.financeApprovalId, null);

    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "APPROVED");
    const acted = await db.approval.findUnique({ where: { id: approval.id } });
    assert.equal(acted?.status, "APPROVED");
    assert.equal(acted?.approverId, manager.id);
    assert.ok(acted?.actedAt);
  });

  it("moves a CRITICAL quotation to PENDING_FINANCE and activates the finance approval", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);

    const outcome = await approveApproval(approval.id, { role: manager.role, userId: manager.id });
    assert.equal(outcome.nextQuotationStatus, "PENDING_FINANCE");
    assert.ok(outcome.financeApprovalId);

    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "PENDING_FINANCE");
    const financeApproval = await db.approval.findUnique({ where: { id: outcome.financeApprovalId! } });
    assert.equal(financeApproval?.level, "FINANCE");
    assert.equal(financeApproval?.status, "PENDING");
  });

  it("rejects a quotation to REJECTED and records the reason", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);

    const reason = "Discount exceeds acceptable margin.";
    const outcome = await rejectApproval(approval.id, { role: manager.role, userId: manager.id }, reason);
    assert.equal(outcome.nextQuotationStatus, "REJECTED");

    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "REJECTED");
    const acted = await db.approval.findUnique({ where: { id: approval.id } });
    assert.equal(acted?.status, "REJECTED");
    assert.equal(acted?.reason, reason);
    assert.equal(acted?.approverId, manager.id);
  });
});

describe("finance stage", () => {
  it("approves a CRITICAL quotation after the manager stage", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    await submit(id);
    const managerApproval = await pendingManagerApproval(id);
    const afterManager = await approveApproval(managerApproval.id, { role: manager.role, userId: manager.id });
    assert.ok(afterManager.financeApprovalId);

    const outcome = await approveApproval(afterManager.financeApprovalId!, { role: finance.role, userId: finance.id });
    assert.equal(outcome.nextQuotationStatus, "APPROVED");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "APPROVED");
  });

  it("rejects a CRITICAL quotation at the finance stage", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    await submit(id);
    const managerApproval = await pendingManagerApproval(id);
    const afterManager = await approveApproval(managerApproval.id, { role: manager.role, userId: manager.id });

    const outcome = await rejectApproval(
      afterManager.financeApprovalId!,
      { role: finance.role, userId: finance.id },
      "Margin too thin."
    );
    assert.equal(outcome.nextQuotationStatus, "REJECTED");
    const quotation = await db.quotation.findUnique({ where: { id } });
    assert.equal(quotation?.status, "REJECTED");
  });
});

describe("authorization and conflicts", () => {
  it("rejects a sales rep attempting to approve (403)", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);
    await expectApprovalError(
      () => approveApproval(approval.id, { role: rep.role, userId: rep.id }),
      403
    );
  });

  it("blocks a manager from approving their own quotation (403)", async () => {
    const id = await createQuotation(manager.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);
    await expectApprovalError(
      () => approveApproval(approval.id, { role: manager.role, userId: manager.id }),
      403,
      /own quotation/
    );
  });

  it("blocks finance from bypassing the manager stage on a CRITICAL quotation (403)", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    await submit(id);
    const managerApproval = await pendingManagerApproval(id);
    await expectApprovalError(
      () => approveApproval(managerApproval.id, { role: finance.role, userId: finance.id }),
      403,
      /manager stage must complete/
    );
  });

  it("returns 409 when a pending approval is acted on twice", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);

    await approveApproval(approval.id, { role: manager.role, userId: manager.id });
    await expectApprovalError(
      () => approveApproval(approval.id, { role: manager.role, userId: manager.id }),
      409,
      /already been acted on/
    );
  });

  it("returns 409 when acting on a stale approval after a rejection", async () => {
    const id = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 22 }]);
    await submit(id);
    const approval = await pendingManagerApproval(id);

    await rejectApproval(approval.id, { role: manager.role, userId: manager.id }, "Not acceptable.");
    await expectApprovalError(
      () => approveApproval(approval.id, { role: manager.role, userId: manager.id }),
      409,
      /already been acted on/
    );
  });

  it("scopes the queue by role: managers see manager stages, finance sees finance stages", async () => {
    const criticalId = await createQuotation(rep.id, [{ productSku: `TST-CRM-${suffix}`, quantity: 1, discountPercent: 60 }]);
    await submit(criticalId);
    const managerApproval = await pendingManagerApproval(criticalId);

    const asManager = await listApprovalQueue({ role: manager.role, userId: manager.id }, { page: 1, pageSize: 20 });
    assert.ok(asManager.data.some((item) => item.id === managerApproval.id));
    assert.ok(asManager.data.every((item) => item.level === "MANAGER"));

    const asFinance = await listApprovalQueue({ role: finance.role, userId: finance.id }, { page: 1, pageSize: 20 });
    assert.ok(asFinance.data.every((item) => item.level === "FINANCE"));
  });
});