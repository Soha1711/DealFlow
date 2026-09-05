import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import { BillingError } from "@/lib/modules/billing/billing-errors";
import { createBillingFromQuotation, getBillingForQuotation } from "@/lib/modules/billing/billing-service";
import { issueInvoice, listInvoices } from "@/lib/modules/billing/invoice-service";
import { recordPayment } from "@/lib/modules/billing/payment-service";
import { billSubscription, listSubscriptions } from "@/lib/modules/billing/subscription-service";
import { listBillingSchedules } from "@/lib/modules/billing/billing-schedule-service";
import { calculateLinePricing, calculateQuotationTotals } from "@/lib/modules/quotations/pricing";

/**
 * End-to-end billing tests against the local PostgreSQL database. Every
 * record created here is deleted in `after`, leaving the dev database
 * untouched. Requires the docker-compose Postgres to be running.
 */

const suffix = Date.now().toString(36).toUpperCase();

type SeedUser = { id: string; role: "ADMIN" | "SALES_REP" | "SALES_MANAGER" | "FINANCE" | "OPERATIONS" | "CUSTOMER" };

type BillingActor = { role: SeedUser["role"]; userId: string };

let rep: SeedUser;
let rep2: SeedUser;
let manager: SeedUser;
let finance: SeedUser;
let admin: SeedUser;
let operations: SeedUser;

/** Converts a seeded user to the actor shape the services expect. */
const actor = (user: SeedUser): BillingActor => ({ role: user.role, userId: user.id });
let customerId: string;
let productBySku: Record<
  string,
  { id: string; price: number; cost: number; isRecurring: boolean; planId: string | null }
> = {};
const quotationIds: string[] = [];
const invoiceIds: string[] = [];
const subscriptionIds: string[] = [];
let quoteSeq = 0;

const SKUS = {
  oneTime: `TST-BIL-OT-${suffix}`,
  recurringMonthly: `TST-BIL-RM-${suffix}`,
  recurringAnnual: `TST-BIL-RA-${suffix}`,
};

type TestLine = { productSku: string; quantity: number; discountPercent: number };

async function createQuotation(salesRepId: string, lines: TestLine[], status = "APPROVED") {
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
      isRecurring: product.isRecurring,
      ...pricing,
    };
  });
  const totals = calculateQuotationTotals(pricedLines);
  const quotation = await db.quotation.create({
    data: {
      quotationNumber: `QUOT-TEST-${suffix}-${quoteSeq}`,
      customerId,
      salesRepId,
      status: status as never,
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

type BillingLike = {
  oneTimeInvoice: { id: string } | null;
  subscriptions: { schedules: { invoice: { id: string } | null }[] }[];
};

/** Records every invoice a billing run created (one-time + per-schedule). */
function trackBilling(billing: BillingLike) {
  if (billing.oneTimeInvoice) invoiceIds.push(billing.oneTimeInvoice.id);
  for (const subscription of billing.subscriptions) {
    for (const schedule of subscription.schedules) {
      if (schedule.invoice) invoiceIds.push(schedule.invoice.id);
    }
  }
}

async function expectBillingError(
  run: () => Promise<unknown>,
  status: number,
  pattern?: RegExp
) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof BillingError, `expected BillingError, got ${String(error)}`);
    assert.equal(error.status, status, (error as Error).message);
    if (pattern) assert.match((error as Error).message, pattern);
    return;
  }
  assert.fail("expected a BillingError to be thrown");
}

before(async () => {
  rep = { id: "", role: "SALES_REP" };
  rep2 = { id: "", role: "SALES_REP" };
  manager = { id: "", role: "SALES_MANAGER" };
  finance = { id: "", role: "FINANCE" };
  admin = { id: "", role: "ADMIN" };
  operations = { id: "", role: "OPERATIONS" };

  const passwordHash = "integration-test-hash";
  const userRows = await db.user.createManyAndReturn({
    data: [
      { name: `Test Rep ${suffix}`, email: `rep-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
      { name: `Test Rep2 ${suffix}`, email: `rep2-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
      { name: `Test Manager ${suffix}`, email: `manager-${suffix}@test.local`, passwordHash, role: "SALES_MANAGER" },
      { name: `Test Finance ${suffix}`, email: `finance-${suffix}@test.local`, passwordHash, role: "FINANCE" },
      { name: `Test Admin ${suffix}`, email: `admin-${suffix}@test.local`, passwordHash, role: "ADMIN" },
      { name: `Test Ops ${suffix}`, email: `ops-${suffix}@test.local`, passwordHash, role: "OPERATIONS" },
    ],
  });
  rep.id = userRows[0].id;
  rep2.id = userRows[1].id;
  manager.id = userRows[2].id;
  finance.id = userRows[3].id;
  admin.id = userRows[4].id;
  operations.id = userRows[5].id;

  const customers = await db.customer.createManyAndReturn({
    data: [
      { name: `Test Customer ${suffix}`, email: `customer-${suffix}@test.local`, tier: "GOLD" },
    ],
  });
  customerId = customers[0].id;

  const plans = await db.subscriptionPlan.createManyAndReturn({
    data: [
      { name: `Test Plan Monthly ${suffix}`, price: 100, billingInterval: "MONTHLY" },
      { name: `Test Plan Annual ${suffix}`, price: 1200, billingInterval: "ANNUAL" },
    ],
  });
  const monthlyPlanId = plans[0].id;
  const annualPlanId = plans[1].id;

  const productRows = await db.product.createManyAndReturn({
    data: [
      { name: `Test One-Time ${suffix}`, sku: SKUS.oneTime, category: "Hardware", price: 1000, cost: 600, maxDiscountPercent: 5, isRecurring: false },
      { name: `Test Recurring Monthly ${suffix}`, sku: SKUS.recurringMonthly, category: "Software", price: 100, cost: 40, maxDiscountPercent: 25, isRecurring: true, subscriptionPlanId: monthlyPlanId },
      { name: `Test Recurring Annual ${suffix}`, sku: SKUS.recurringAnnual, category: "Software", price: 1200, cost: 400, maxDiscountPercent: 25, isRecurring: true, subscriptionPlanId: annualPlanId },
    ],
  });
  productBySku = Object.fromEntries(
    productRows.map((product) => [
      product.sku,
      {
        id: product.id,
        price: Number(product.price),
        cost: Number(product.cost),
        isRecurring: product.isRecurring,
        planId: product.subscriptionPlanId,
      },
    ])
  );
});

after(async () => {
  // Deletes are pattern-based (any record linked to a TST-BIL- product) so a
  // failed run can never leave rows behind that block the next run. Order
  // respects the FK graph: payments → invoices → subscriptions → quotations
  // → products → plans → customers → users.
  const billingProduct = { product: { sku: { startsWith: `TST-BIL-` } } };
  await db.payment.deleteMany({ where: { invoice: { lines: { some: billingProduct } } } });
  await db.invoice.deleteMany({ where: { lines: { some: billingProduct } } });
  await db.subscription.deleteMany({
    where: { quotation: { lines: { some: billingProduct } } },
  });
  await db.quotation.deleteMany({ where: { lines: { some: billingProduct } } });
  await db.product.deleteMany({ where: { sku: { startsWith: `TST-BIL-` } } });
  await db.subscriptionPlan.deleteMany({ where: { name: { startsWith: `Test Plan ` } } });
  await db.customer.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await db.$disconnect();
});

describe("invoice creation", () => {
  it("creates a ONE_TIME invoice from an approved quotation with historical snapshots", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 2, discountPercent: 10 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);

    assert.equal(billing.type, "ONE_TIME");
    const invoice = billing.oneTimeInvoice!;
    assert.equal(invoice.type, "ONE_TIME");
    assert.equal(invoice.status, "DRAFT");
    assert.match(invoice.invoiceNumber, /^INV-\d{4}-\d{4}$/);
    assert.equal(invoice.quotationId, quotationId);
    // 2 × $1000 @ 10% → lineTotal $1800.
    assert.equal(invoice.total.toString(), "1800");
    assert.equal(invoice.lines.length, 1);
    assert.equal(invoice.lines[0].quantity, 2);
    assert.equal(invoice.lines[0].unitPrice.toString(), "1000");
    assert.equal(invoice.lines[0].discountAmount.toString(), "200");
    assert.equal(invoice.lines[0].lineTotal.toString(), "1800");
    assert.equal(invoice.lines[0].isRecurring, false);
    assert.equal(billing.subscriptions.length, 0);
  });

  it("rejects billing for a DRAFT quotation (409)", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ], "DRAFT");
    await expectBillingError(
      () => createBillingFromQuotation(quotationId, actor(finance)),
      409,
      /approval|approved|governance/i
    );
  });

  it("rejects billing for a REJECTED quotation (409)", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ], "REJECTED");
    await expectBillingError(
      () => createBillingFromQuotation(quotationId, actor(finance)),
      409,
      /approval|approved|governance/i
    );
  });

  it("rejects a second billing run for the same quotation (idempotent, 409)", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const first = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(first.oneTimeInvoice!.id);

    await expectBillingError(
      () => createBillingFromQuotation(quotationId, actor(finance)),
      409,
      /already been generated/
    );
    const count = await db.invoice.count({ where: { quotationId } });
    assert.equal(count, 1);
  });
});

describe("hybrid billing", () => {
  it("bills a recurring-only quotation into a subscription + schedule + recurring invoice", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 10 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));

    assert.equal(billing.type, "RECURRING");
    assert.equal(billing.oneTimeInvoice, null);
    assert.equal(billing.subscriptions.length, 1);

    const subscription = billing.subscriptions[0];
    subscriptionIds.push(subscription.id);
    assert.equal(subscription.status, "ACTIVE");
    assert.equal(subscription.billingInterval, "MONTHLY");
    // Recurring amount is the finalized net line total ($100 @ 10% = $90).
    assert.equal(subscription.recurringAmount.toString(), "90");

    const schedules = await db.billingSchedule.findMany({
      where: { subscriptionId: subscription.id },
      include: { invoice: true },
    });
    assert.equal(schedules.length, 1);
    const schedule = schedules[0];
    assert.equal(schedule.amount.toString(), "90");
    assert.equal(schedule.status, "DUE");
    assert.ok(schedule.invoice);
    invoiceIds.push(schedule.invoice.id);
    assert.equal(schedule.invoice.type, "RECURRING");
    assert.equal(schedule.invoice.total.toString(), "90");
  });

  it("bills a hybrid quotation into one one-time invoice plus a subscription — no cross-billing", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 2, discountPercent: 10 },
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 10 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    trackBilling(billing);

    assert.equal(billing.type, "HYBRID");
    const oneTime = billing.oneTimeInvoice!;
    assert.equal(oneTime.type, "ONE_TIME");
    // One-time lines only: 2 × $1000 @ 10% = $1800. The recurring line must
    // NOT appear on the one-time invoice.
    assert.equal(oneTime.lines.length, 1);
    assert.equal(oneTime.lines[0].productId, productBySku[SKUS.oneTime].id);
    assert.equal(oneTime.total.toString(), "1800");

    assert.equal(billing.subscriptions.length, 1);
    const subscription = billing.subscriptions[0];
    subscriptionIds.push(subscription.id);
    assert.equal(subscription.product.id, productBySku[SKUS.recurringMonthly].id);
    assert.equal(subscription.recurringAmount.toString(), "90");
  });

  it("supports ANNUAL subscriptions from an annual plan", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.recurringAnnual, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    trackBilling(billing);
    assert.equal(billing.type, "RECURRING");
    const subscription = billing.subscriptions[0];
    subscriptionIds.push(subscription.id);
    assert.equal(subscription.billingInterval, "ANNUAL");
    assert.equal(subscription.recurringAmount.toString(), "1200");
    // nextBillingDate is ~1 year after startDate.
    const yearMs = 365 * 24 * 60 * 60 * 1000;
    const diff = subscription.nextBillingDate.getTime() - subscription.startDate.getTime();
    assert.ok(diff >= yearMs - 2 * 24 * 60 * 60 * 1000 && diff <= 366 * 24 * 60 * 60 * 1000);
  });
});

describe("invoice lifecycle + payments", () => {
  it("issues a DRAFT invoice and refuses to issue it twice", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);

    const issued = await issueInvoice(billing.oneTimeInvoice!.id, actor(finance));
    assert.equal(issued.status, "ISSUED");
    assert.ok(issued.issueDate);
    assert.ok(issued.dueDate);

    await expectBillingError(
      () => issueInvoice(billing.oneTimeInvoice!.id, actor(finance)),
      409,
      /DRAFT/
    );
  });

  it("rejects payments on an unissued (DRAFT) invoice", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    await expectBillingError(
      () => recordPayment(billing.oneTimeInvoice!.id, actor(finance), { amount: "1000" }),
      409,
      /issued/
    );
  });

  it("records partial then final payments: PARTIALLY_PAID → PAID", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 2, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    const invoiceId = billing.oneTimeInvoice!.id;
    await issueInvoice(invoiceId, actor(finance));

    const partial = await recordPayment(invoiceId, actor(finance), { amount: "800", method: "BANK_TRANSFER" });
    assert.equal(partial.invoice.status, "PARTIALLY_PAID");
    assert.equal(partial.invoice.paidAmount.toString(), "800");

    const final = await recordPayment(invoiceId, actor(finance), { amount: "1200", method: "BANK_TRANSFER" });
    assert.equal(final.invoice.status, "PAID");
    assert.equal(final.invoice.paidAmount.toString(), "2000");

    const payments = await db.payment.findMany({ where: { invoiceId }, orderBy: { createdAt: "asc" } });
    assert.equal(payments.length, 2);
    assert.ok(payments.every((p) => p.status === "SUCCEEDED"));
  });

  it("full payment moves an invoice straight to PAID", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    await issueInvoice(billing.oneTimeInvoice!.id, actor(finance));
    const paid = await recordPayment(billing.oneTimeInvoice!.id, actor(finance), { amount: "1000" });
    assert.equal(paid.invoice.status, "PAID");
  });

  it("rejects overpayment (400)", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    await issueInvoice(billing.oneTimeInvoice!.id, actor(finance));
    await expectBillingError(
      () => recordPayment(billing.oneTimeInvoice!.id, actor(finance), { amount: "1500" }),
      400,
      /overpay|balance/
    );
  });

  it("rejects zero/negative payments", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    await issueInvoice(billing.oneTimeInvoice!.id, actor(finance));
    await expectBillingError(
      () => recordPayment(billing.oneTimeInvoice!.id, actor(finance), { amount: "0" }),
      400,
      /greater than zero/
    );
  });

  it("rejects a payment whose idempotency key was already used (409)", async () => {
    const idA = await createQuotation(rep.id, [{ productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 }]);
    const idB = await createQuotation(rep.id, [{ productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 }]);
    const billingA = await createBillingFromQuotation(idA, actor(finance));
    const billingB = await createBillingFromQuotation(idB, actor(finance));
    invoiceIds.push(billingA.oneTimeInvoice!.id, billingB.oneTimeInvoice!.id);
    await issueInvoice(billingA.oneTimeInvoice!.id, actor(finance));
    await issueInvoice(billingB.oneTimeInvoice!.id, actor(finance));

    await recordPayment(billingA.oneTimeInvoice!.id, actor(finance), {
      amount: "1000",
      idempotencyKey: `idem-${suffix}-1`,
    });
    await expectBillingError(
      () =>
        recordPayment(billingB.oneTimeInvoice!.id, actor(finance), {
          amount: "1000",
          idempotencyKey: `idem-${suffix}-1`,
        }),
      409,
      /idempotency/
    );
  });

  it("marks a subscription schedule PAID when its recurring invoice is fully paid", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    trackBilling(billing);
    subscriptionIds.push(billing.subscriptions[0].id);
    const schedule = await db.billingSchedule.findFirstOrThrow({
      where: { subscriptionId: billing.subscriptions[0].id },
    });
    await issueInvoice(schedule.invoiceId!, actor(finance));
    await recordPayment(schedule.invoiceId!, actor(finance), { amount: "100" });

    const updated = await db.billingSchedule.findUnique({ where: { id: schedule.id } });
    assert.equal(updated?.status, "PAID");
  });

  it("bills the next subscription period (manual recurring billing action)", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    trackBilling(billing);
    subscriptionIds.push(billing.subscriptions[0].id);

    const before = await db.billingSchedule.count({
      where: { subscriptionId: billing.subscriptions[0].id },
    });
    const next = await billSubscription(billing.subscriptions[0].id, actor(finance));
    invoiceIds.push(next.invoiceId);

    // A distinct future period was added and billed.
    const schedules = await db.billingSchedule.findMany({
      where: { subscriptionId: billing.subscriptions[0].id },
      orderBy: { periodStart: "asc" },
    });
    assert.equal(schedules.length, before + 1);
    const latest = schedules[schedules.length - 1];
    assert.equal(latest.amount.toString(), "100");
    assert.equal(latest.id, next.scheduleId);
    // Periods are contiguous and never overlap.
    assert.ok(latest.periodStart.getTime() >= schedules[schedules.length - 2].periodEnd.getTime());
    // The subscription's nextBillingDate advanced to the new period end.
    const subscription = await db.subscription.findUniqueOrThrow({
      where: { id: billing.subscriptions[0].id },
    });
    assert.equal(subscription.nextBillingDate.getTime(), latest.periodEnd.getTime());
  });
});

describe("authorization", () => {
  it("FINANCE and ADMIN may create billing; others are forbidden", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    // SALES_REP cannot create billing.
    await expectBillingError(() => createBillingFromQuotation(quotationId, actor(rep)), 403);
    // SALES_MANAGER cannot create billing.
    await expectBillingError(() => createBillingFromQuotation(quotationId, actor(manager)), 403);
    // OPERATIONS cannot create billing.
    await expectBillingError(() => createBillingFromQuotation(quotationId, actor(operations)), 403);

    // ADMIN can.
    const asAdmin = await createBillingFromQuotation(quotationId, actor(admin));
    invoiceIds.push(asAdmin.oneTimeInvoice!.id);
    assert.ok(asAdmin.oneTimeInvoice);
  });

  it("gives sales reps and managers read-only invoice access scoped to the rep's quotations", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);

    // Rep who owns the quotation sees the invoice; another rep does not.
    const repView = await listInvoices(actor(rep), { page: 1, pageSize: 20 });
    assert.ok(repView.data.some((item) => item.id === billing.oneTimeInvoice!.id));
    const otherRepView = await listInvoices(actor(rep2), { page: 1, pageSize: 20 });
    assert.ok(!otherRepView.data.some((item) => item.id === billing.oneTimeInvoice!.id));

    // Reps cannot record payments.
    await expectBillingError(
      () => recordPayment(billing.oneTimeInvoice!.id, actor(rep), { amount: "10" }),
      403
    );

    // Managers see all invoices read-only but cannot mutate.
    const managerView = await listInvoices(actor(manager), { page: 1, pageSize: 20 });
    assert.ok(managerView.data.some((item) => item.id === billing.oneTimeInvoice!.id));
    await expectBillingError(
      () => recordPayment(billing.oneTimeInvoice!.id, actor(manager), { amount: "10" }),
      403
    );
  });

  it("blocks OPERATIONS/CUSTOMER from the billing area entirely", async () => {
    await expectBillingError(() => listInvoices(actor(operations), { page: 1, pageSize: 20 }), 403);
    await expectBillingError(
      () => listInvoices({ role: "CUSTOMER", userId: "customer-x" }, { page: 1, pageSize: 20 }),
      403
    );
    await expectBillingError(() => listSubscriptions(actor(operations), { page: 1, pageSize: 20 }), 403);
  });
});

describe("pagination", () => {
  it("paginates invoices with metadata", async () => {
    for (let i = 0; i < 3; i += 1) {
      const quotationId = await createQuotation(rep.id, [
        { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
      ]);
      const billing = await createBillingFromQuotation(quotationId, actor(finance));
      invoiceIds.push(billing.oneTimeInvoice!.id);
    }
    const page1 = await listInvoices(actor(finance), { page: 1, pageSize: 2 });
    assert.equal(page1.data.length, 2);
    assert.equal(page1.pagination.page, 1);
    assert.equal(page1.pagination.pageSize, 2);
    assert.ok(page1.pagination.total >= 3);
    assert.ok(page1.pagination.totalPages >= 2);

    const page2 = await listInvoices(actor(finance), { page: 2, pageSize: 2 });
    assert.equal(page2.pagination.page, 2);
    assert.ok(page2.data.length >= 1);
    // Pages do not overlap.
    const page1Ids = new Set(page1.data.map((item) => item.id));
    assert.ok(!page2.data.some((item) => page1Ids.has(item.id)));

    // Out-of-range page clamps to the last page.
    const clamped = await listInvoices(actor(finance), { page: 999, pageSize: 2 });
    assert.equal(clamped.pagination.page, clamped.pagination.totalPages);
  });

  it("paginates subscriptions and billing schedules", async () => {
    for (let i = 0; i < 2; i += 1) {
      const quotationId = await createQuotation(rep.id, [
        { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 0 },
      ]);
      const billing = await createBillingFromQuotation(quotationId, actor(finance));
      trackBilling(billing);
      subscriptionIds.push(billing.subscriptions[0].id);
    }
    const subs = await listSubscriptions(actor(finance), { page: 1, pageSize: 2 });
    assert.equal(subs.data.length, 2);
    assert.equal(subs.pagination.page, 1);
    assert.equal(subs.pagination.pageSize, 2);
    assert.ok(subs.pagination.total >= 2);

    const schedules = await listBillingSchedules(actor(finance), { page: 1, pageSize: 1 });
    assert.equal(schedules.data.length, 1);
    assert.equal(schedules.pagination.pageSize, 1);
    assert.ok(schedules.pagination.total >= 1);
  });
});

describe("data integrity", () => {
  it("historical invoice amounts do not change when product prices change", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    invoiceIds.push(billing.oneTimeInvoice!.id);
    const invoiceId = billing.oneTimeInvoice!.id;

    await db.product.update({
      where: { id: productBySku[SKUS.oneTime].id },
      data: { price: 2500, cost: 2000 },
    });

    const invoice = await db.invoice.findUniqueOrThrow({
      where: { id: invoiceId },
      include: { lines: true },
    });
    assert.equal(invoice.total.toString(), "1000");
    assert.equal(invoice.lines[0].unitPrice.toString(), "1000");
    assert.equal(invoice.lines[0].lineTotal.toString(), "1000");
  });

  it("rolls back a failed hybrid billing run leaving no partial records", async () => {
    // A hybrid quotation whose recurring line already has a subscription
    // (created concurrently by another quotation) forces the subscription
    // creation step inside createBillingFromQuotation to fail on the unique
    // quotationLineId constraint — after the one-time invoice has already
    // been written in the same transaction. The whole run must roll back.
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 0 },
    ]);
    const quotation = await db.quotation.findUniqueOrThrow({
      where: { id: quotationId },
      include: { lines: true },
    });
    const recurringLine = quotation.lines.find(
      (line) => line.productId === productBySku[SKUS.recurringMonthly].id
    );
    assert.ok(recurringLine);

    // Stale concurrent subscription for the same recurring line (different
    // quotation). This will trip the unique constraint mid-transaction.
    const otherQuote = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
    ]);
    const stale = await db.subscription.create({
      data: {
        customerId,
        quotationId: otherQuote,
        quotationLineId: recurringLine.id,
        productId: productBySku[SKUS.recurringMonthly].id,
        subscriptionPlanId: productBySku[SKUS.recurringMonthly].planId,
        status: "ACTIVE",
        billingInterval: "MONTHLY",
        recurringAmount: 90,
        startDate: new Date(),
        nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      },
      select: { id: true },
    });
    subscriptionIds.push(stale.id);

    await assert.rejects(() => createBillingFromQuotation(quotationId, actor(finance)));

    // Nothing partial may remain: no invoice and no extra subscription for
    // the quotation that failed.
    const invoices = await db.invoice.findMany({ where: { quotationId } });
    assert.equal(invoices.length, 0);
    const subscriptions = await db.subscription.findMany({ where: { quotationId } });
    assert.equal(subscriptions.length, 0);
  });

  it("exposes billing for a quotation via getBillingForQuotation", async () => {
    const quotationId = await createQuotation(rep.id, [
      { productSku: SKUS.oneTime, quantity: 1, discountPercent: 0 },
      { productSku: SKUS.recurringMonthly, quantity: 1, discountPercent: 0 },
    ]);
    const billing = await createBillingFromQuotation(quotationId, actor(finance));
    trackBilling(billing);
    subscriptionIds.push(billing.subscriptions[0].id);

    const result = await getBillingForQuotation(quotationId, actor(finance));
    // A hybrid quotation yields a one-time invoice and a recurring invoice
    // for its subscription's first period.
    assert.equal(result.invoices.length, 2);
    assert.equal(result.subscriptions.length, 1);
    assert.deepEqual(
      result.invoices.map((invoice) => invoice.type).sort(),
      ["ONE_TIME", "RECURRING"]
    );

    // A different rep cannot read it.
    await expectBillingError(() => getBillingForQuotation(quotationId, actor(rep2)), 403);
  });
});
