import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import {
  getDealHealth,
  listPortfolioDealHealth,
} from "@/lib/modules/deal-health/deal-health-service";
import { DealHealthError } from "@/lib/modules/deal-health/deal-health-errors";
import { calculateLinePricing, calculateQuotationTotals } from "@/lib/modules/quotations/pricing";

const suffix = Date.now().toString(36).toUpperCase();

let rep: { id: string; userId: string; role: "SALES_REP" };
let otherRep: { id: string; userId: string; role: "SALES_REP" };
let manager: { id: string; userId: string; role: "SALES_MANAGER" };
let customerUser: { id: string; userId: string; role: "CUSTOMER" };
let customerId: string;
let product: { id: string; price: number; cost: number; maxDiscountPercent: number };
const testQuotationIds: string[] = [];

before(async () => {
  const repUser = await db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
  rep = { id: repUser.id, userId: repUser.id, role: "SALES_REP" };

  let otherRepUser = await db.user.findFirst({
    where: { role: "SALES_REP", id: { not: repUser.id } },
  });
  if (!otherRepUser) {
    otherRepUser = await db.user.create({
      data: {
        name: `Other Rep ${suffix}`,
        email: `other-rep-${suffix}@dealflow360.io`,
        passwordHash: "dummy",
        role: "SALES_REP",
      },
    });
  }
  otherRep = { id: otherRepUser.id, userId: otherRepUser.id, role: "SALES_REP" };

  const mgrUser = await db.user.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });
  manager = { id: mgrUser.id, userId: mgrUser.id, role: "SALES_MANAGER" };

  let custUser = await db.user.findFirst({ where: { role: "CUSTOMER" } });
  if (!custUser) {
    custUser = await db.user.create({
      data: {
        name: `Customer User ${suffix}`,
        email: `cust-${suffix}@dealflow360.io`,
        passwordHash: "dummy",
        role: "CUSTOMER",
      },
    });
  }
  customerUser = { id: custUser.id, userId: custUser.id, role: "CUSTOMER" };

  let customer = await db.customer.findFirst();
  if (!customer) {
    customer = await db.customer.create({
      data: {
        name: `Acme Corp ${suffix}`,
        email: `acme-${suffix}@example.com`,
        tier: "GOLD",
      },
    });
  }
  customerId = customer.id;

  const prod =
    (await db.product.findFirst({ where: { sku: "EDGE-DEV-021" } })) ??
    (await db.product.findFirstOrThrow({ where: { isRecurring: false }, orderBy: { sku: "asc" } }));
  product = {
    id: prod.id,
    price: Number(prod.price),
    cost: Number(prod.cost),
    maxDiscountPercent: prod.maxDiscountPercent,
  };
});

after(async () => {
  if (testQuotationIds.length > 0) {
    const fulfillments = await db.fulfillment.findMany({
      where: { quotationId: { in: testQuotationIds } },
      select: { id: true },
    });
    if (fulfillments.length > 0) {
      const fIds = fulfillments.map((f) => f.id);
      await db.fulfillmentLine.deleteMany({ where: { fulfillmentId: { in: fIds } } });
      await db.fulfillment.deleteMany({ where: { id: { in: fIds } } });
    }
    await db.invoice.deleteMany({ where: { quotationId: { in: testQuotationIds } } });
    await db.quotation.deleteMany({
      where: { id: { in: testQuotationIds } },
    });
  }
});

async function createTestQuote(params: {
  salesRepId: string;
  status?: "APPROVED" | "DRAFT" | "UNDER_NEGOTIATION";
  discountPercent?: number;
  margin?: number;
  riskScore?: number;
  riskLevel?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  validUntil?: Date;
}) {
  const discountPercent = params.discountPercent ?? 5;
  const pricing = calculateLinePricing({
    quantity: 2,
    unitPrice: product.price,
    discountPercent,
    cost: product.cost,
  });
  const totals = calculateQuotationTotals([pricing]);

  const quote = await db.quotation.create({
    data: {
      quotationNumber: `TEST-DH-${suffix}-${testQuotationIds.length + 1}`,
      customerId,
      salesRepId: params.salesRepId,
      status: params.status ?? "APPROVED",
      subtotal: totals.subtotal,
      discountTotal: totals.discountTotal,
      total: totals.total,
      margin: params.margin !== undefined ? params.margin : totals.margin,
      validUntil: params.validUntil ?? new Date("2026-12-31T23:59:59Z"),
      riskScore: params.riskScore ?? 0,
      riskLevel: params.riskLevel ?? "LOW",
      requiredApprovalLevel: "NONE",
      lines: {
        create: [
          {
            productId: product.id,
            quantity: 2,
            unitPrice: product.price,
            discountPercent,
            discountAmount: pricing.discountAmount,
            lineTotal: pricing.lineTotal,
            margin: params.margin !== undefined ? params.margin : pricing.margin,
            isRecurring: false,
          },
        ],
      },
    },
  });

  testQuotationIds.push(quote.id);
  return quote;
}

describe("Deal Health Integration", () => {
  it("computes deal health for an approved healthy quotation", async () => {
    const quote = await createTestQuote({ salesRepId: rep.id });

    const health = await getDealHealth(quote.id, rep);
    assert.equal(health.quotationId, quote.id);
    assert.equal(health.score, 100);
    assert.equal(health.level, "HEALTHY");
    assert.equal(health.anomalies.length, 0);
    assert.ok(health.factors.length > 0);
  });

  it("strictly denies customer role from accessing deal health (403)", async () => {
    const quote = await createTestQuote({ salesRepId: rep.id });

    await assert.rejects(
      async () => {
        await getDealHealth(quote.id, customerUser);
      },
      (err: unknown) => err instanceof DealHealthError && err.status === 403
    );
  });

  it("enforces sales rep isolation: other reps cannot access quotation health (403)", async () => {
    const quote = await createTestQuote({ salesRepId: rep.id });

    await assert.rejects(
      async () => {
        await getDealHealth(quote.id, otherRep);
      },
      (err: unknown) => err instanceof DealHealthError && err.status === 403
    );
  });

  it("allows sales managers to view deal health for any sales rep's quotation", async () => {
    const quote = await createTestQuote({ salesRepId: rep.id });

    const health = await getDealHealth(quote.id, manager);
    assert.equal(health.quotationId, quote.id);
    assert.ok(health.score >= 0);
  });

  it("detects and flags real database anomalies: overdue invoice & active backorders", async () => {
    const quote = await createTestQuote({ salesRepId: rep.id });

    // 1. Attach an overdue invoice
    await db.invoice.create({
      data: {
        invoiceNumber: `INV-DH-${suffix}`,
        customerId,
        quotationId: quote.id,
        status: "OVERDUE",
        total: 1500,
        paidAmount: 0,
        dueDate: new Date("2026-08-01T00:00:00Z"),
      },
    });

    // 2. Attach a fulfillment with active backorder
    const fulfillment = await db.fulfillment.create({
      data: {
        quotationId: quote.id,
        status: "PARTIALLY_ALLOCATED",
      },
    });
    await db.fulfillmentLine.create({
      data: {
        fulfillmentId: fulfillment.id,
        productId: product.id,
        requestedQuantity: 5,
        allocatedQuantity: 1,
        fulfilledQuantity: 0,
        backorderQuantity: 4,
        status: "BACKORDERED",
      },
    });

    // Fetch evaluated health
    const health = await getDealHealth(quote.id, rep);

    // Should reflect overdue invoice (-25) + active backorder (-20)
    assert.equal(health.score, 55); // 100 - 45 = 55
    assert.equal(health.level, "AT_RISK");

    const overdueAnomaly = health.anomalies.find((a) => a.code === "OVERDUE_INVOICE");
    assert.ok(overdueAnomaly, "Expected OVERDUE_INVOICE anomaly");
    assert.equal(overdueAnomaly.severity, "CRITICAL");

    const backorderAnomaly = health.anomalies.find((a) => a.code === "ACTIVE_BACKORDER");
    assert.ok(backorderAnomaly, "Expected ACTIVE_BACKORDER anomaly");
    assert.equal(backorderAnomaly.severity, "CRITICAL");

    assert.ok(health.recommendations.length >= 2);
  });

  it("listPortfolioDealHealth scopes to salesRepId for sales reps and provides summary KPIs", async () => {
    // Create one for rep and one for otherRep
    const q1 = await createTestQuote({ salesRepId: rep.id });
    const q2 = await createTestQuote({ salesRepId: otherRep.id });

    // When rep queries: only q1 is included
    const repList = await listPortfolioDealHealth(rep, { page: 1, pageSize: 20 });
    assert.ok(repList.items.some((item) => item.id === q1.id));
    assert.ok(!repList.items.some((item) => item.id === q2.id));

    // When manager queries: both are included
    const mgrList = await listPortfolioDealHealth(manager, { page: 1, pageSize: 50 });
    assert.ok(mgrList.items.some((item) => item.id === q1.id));
    assert.ok(mgrList.items.some((item) => item.id === q2.id));

    // Summary statistics are populated
    assert.ok(mgrList.summary.totalDeals >= 2);
    assert.ok(mgrList.summary.averageScore > 0);
    assert.ok(mgrList.summary.totalPortfolioValue > 0);
  });

  it("filters portfolio by health level (e.g. HEALTHY)", async () => {
    const list = await listPortfolioDealHealth(manager, {
      page: 1,
      pageSize: 50,
      level: "HEALTHY",
    });

    for (const item of list.items) {
      assert.equal(item.health.level, "HEALTHY");
      assert.ok(item.health.score >= 75);
    }
  });
});
