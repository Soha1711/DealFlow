import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";

import { db } from "@/lib/db";
import { getRecommendations } from "@/lib/modules/recommendations/recommendation-service";
import { QuotationError } from "@/lib/modules/quotations/errors";
import {
  addQuotationLineToDraft,
  submitQuotation,
} from "@/lib/modules/quotations/quotation-service";
import {
  calculateLinePricing,
  calculateQuotationTotals,
} from "@/lib/modules/quotations/pricing";
import type { AiRankingOutput } from "@/lib/modules/recommendations/recommendation-validation";

/**
 * End-to-end recommendation tests against the local PostgreSQL database.
 * All rows created here are deleted in `after`. Requires the docker-compose
 * Postgres to be running.
 */

const suffix = Date.now().toString(36).toUpperCase();

const repA = { id: "", role: "SALES_REP" as const };
const repB = { id: "", role: "SALES_REP" as const };
let customerId = "";
let historyProductId = "";
let quoteProductId = "";
let addProductId = "";
let unavailableProductId = "";
const quotationIds: string[] = [];
let quoteSeq = 0;

async function createQuotation(
  salesRepId: string,
  lines: { productId: string; quantity: number; discountPercent: number; unitPrice: string }[],
  status: "DRAFT" | "APPROVED" = "DRAFT"
) {
  quoteSeq += 1;
  const pricedLines = lines.map((line) => ({
    ...calculateLinePricing({
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountPercent: line.discountPercent,
      cost: "0",
    }),
    ...line,
    isRecurring: false,
  }));
  const totals = calculateQuotationTotals(pricedLines);
  const quotation = await db.quotation.create({
    data: {
      quotationNumber: `QUOT-REC-${suffix}-${quoteSeq}`,
      customerId,
      salesRepId,
      status,
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
          isRecurring: false,
        })),
      },
    },
    select: { id: true },
  });
  quotationIds.push(quotation.id);
  return quotation.id;
}

async function expectQuotationError(
  run: () => Promise<unknown>,
  status: number,
  pattern?: RegExp
) {
  try {
    await run();
  } catch (error) {
    assert.ok(error instanceof QuotationError, `expected QuotationError, got ${String(error)}`);
    assert.equal(error.status, status, error.message);
    if (pattern) assert.match(error.message, pattern);
    return;
  }
  assert.fail("expected a QuotationError to be thrown");
}

before(async () => {
  const passwordHash = "recommendation-test-hash";
  const users = await db.user.createManyAndReturn({
    data: [
      { name: `Rec Rep A ${suffix}`, email: `rec-repa-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
      { name: `Rec Rep B ${suffix}`, email: `rec-repb-${suffix}@test.local`, passwordHash, role: "SALES_REP" },
    ],
  });
  repA.id = users[0].id;
  repB.id = users[1].id;

  const customer = await db.customer.create({
    data: { name: `Rec Customer ${suffix}`, email: `rec-customer-${suffix}@test.local`, tier: "GOLD" },
    select: { id: true },
  });
  customerId = customer.id;

  const products = await db.product.createManyAndReturn({
    data: [
      { name: `Rec CRM ${suffix}`, sku: `REC-CRM-${suffix}`, category: "Software", price: 240, cost: 96, maxDiscountPercent: 20 },
      { name: `Rec Support ${suffix}`, sku: `REC-SUP-${suffix}`, category: "Support", price: 1800, cost: 1260, maxDiscountPercent: 12 },
      { name: `Rec Edge ${suffix}`, sku: `REC-EDG-${suffix}`, category: "Hardware", price: 999, cost: 540, maxDiscountPercent: 5 },
      { name: `Rec Analytics ${suffix}`, sku: `REC-ANL-${suffix}`, category: "Software", price: 120, cost: 48, maxDiscountPercent: 25 },
    ],
  });
  const bySku = new Map(products.map((p) => [p.sku, p]));
  historyProductId = bySku.get(`REC-SUP-${suffix}`)!.id;
  addProductId = bySku.get(`REC-CRM-${suffix}`)!.id;
  unavailableProductId = bySku.get(`REC-EDG-${suffix}`)!.id;
  quoteProductId = bySku.get(`REC-ANL-${suffix}`)!.id;

  const warehouse = await db.warehouse.findFirst({ select: { id: true } });
  assert.ok(warehouse, "expected a seeded warehouse (run the Phase 1 seed)");
  await db.inventory.createMany({
    data: [
      { warehouseId: warehouse.id, productId: historyProductId, quantity: 50, reservedQuantity: 0 },
      { warehouseId: warehouse.id, productId: addProductId, quantity: 100, reservedQuantity: 0 },
      // No inventory row for the unavailable product on purpose.
      { warehouseId: warehouse.id, productId: quoteProductId, quantity: 30, reservedQuantity: 0 },
    ],
  });

  // Purchase history: the customer previously bought the Support product.
  await createQuotation(repA.id, [
    { productId: historyProductId, quantity: 2, discountPercent: 0, unitPrice: "1800.00" },
  ], "APPROVED");
});

after(async () => {
  await db.quotation.deleteMany({ where: { id: { in: quotationIds } } });
  await db.inventory.deleteMany({ where: { productId: { in: [historyProductId, addProductId, unavailableProductId, quoteProductId] } } });
  await db.product.deleteMany({ where: { sku: { startsWith: `REC-` } } });
  await db.customer.deleteMany({ where: { id: customerId } });
  await db.user.deleteMany({ where: { email: { endsWith: "@test.local" } } });
  await db.$disconnect();
});

describe("recommendation service", () => {
  it("returns deterministic recommendations for the owner with no cost exposure", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    const result = await getRecommendations(draftId, { role: repA.role, userId: repA.id }, { limit: 6, useAi: false });

    const ids = result.data.map((item) => item.productId);
    // The quote product is never recommended; the zero-inventory product never appears.
    assert.ok(!ids.includes(quoteProductId));
    assert.ok(!ids.includes(unavailableProductId));
    // The historically purchased Support product is recommended and explained.
    assert.ok(ids.includes(historyProductId), `expected history product in ${ids.join(",")}`);
    const historyItem = result.data.find((item) => item.productId === historyProductId);
    assert.match(historyItem!.reason, /Previously purchased/);
    // No cost anywhere in the response.
    assert.equal(JSON.stringify(result).includes('"cost"'), false);
    assert.equal(result.meta.engine, "deterministic");
    // Margin present for internal roles, as a 2-decimal string.
    assert.match(historyItem!.marginPercent!, /^\d+\.\d{2}$/);
  });

  it("blocks another sales rep from a restricted quotation (403)", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    await expectQuotationError(
      () => getRecommendations(draftId, { role: repB.role, userId: repB.id }, { limit: 6, useAi: false }),
      403
    );
  });

  it("falls back to deterministic output when the AI layer throws", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    const failingRanker = async () => {
      throw new Error("provider down");
    };
    const result = await getRecommendations(
      draftId,
      { role: repA.role, userId: repA.id },
      { limit: 6, useAi: true, ranker: failingRanker }
    );
    assert.equal(result.meta.aiEnhanced, false);
    assert.equal(result.meta.engine, "deterministic");
    assert.equal(result.meta.aiAvailable, true);
    assert.ok(result.data.length > 0);
  });

  it("falls back to deterministic output when the AI returns malformed rankings", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    const malformedRanker = async () => {
      const output: AiRankingOutput = {
        recommendations: [{ productId: "FABRICATED-PRODUCT", confidence: 100 }],
      };
      return output;
    };
    const result = await getRecommendations(
      draftId,
      { role: repA.role, userId: repA.id },
      { limit: 6, useAi: true, ranker: malformedRanker }
    );
    const ids = result.data.map((item) => item.productId);
    assert.ok(!ids.includes("FABRICATED-PRODUCT"));
    assert.ok(ids.length > 0);
  });

  it("returns an empty list when every product is already on the quote", async () => {
    const allProducts = await db.product.findMany({
      select: { id: true, price: true },
    });
    const draftId = await createQuotation(
      repA.id,
      allProducts.map((product) => ({
        productId: product.id,
        quantity: 1,
        discountPercent: 0,
        unitPrice: product.price.toString(),
      }))
    );
    const result = await getRecommendations(draftId, { role: repA.role, userId: repA.id }, { limit: 6, useAi: false });
    assert.equal(result.data.length, 0);
  });
});

describe("add recommendation to quotation", () => {
  it("rejects an invalid product id (400)", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    await expectQuotationError(
      () =>
        addQuotationLineToDraft(
          draftId,
          { userId: repA.id, role: repA.role },
          { productId: "does-not-exist", quantity: 1 }
        ),
      400,
      /Unknown product/
    );
  });

  it("blocks adding to another rep's quotation (403)", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    await expectQuotationError(
      () =>
        addQuotationLineToDraft(
          draftId,
          { userId: repB.id, role: repB.role },
          { productId: addProductId, quantity: 1 }
        ),
      403
    );
  });

  it("adds a line and recalculates totals with the Phase 2 pricing engine", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    const updated = await addQuotationLineToDraft(
      draftId,
      { userId: repA.id, role: repA.role },
      { productId: addProductId, quantity: 2, unitPrice: "240.00", discountPercent: 0 }
    );

    assert.equal(updated.lines.length, 2);
    // 1 × 120 + 2 × 240 = 600; margin (120−48) + 2×(240−96) = 72 + 288 = 360.
    assert.equal(updated.total.toFixed(2), "600.00");
    assert.equal(updated.subtotal.toFixed(2), "600.00");
    assert.equal(updated.discountTotal.toFixed(2), "0.00");
    assert.equal(updated.margin.toFixed(2), "360.00");
  });

  it("re-runs discount risk on submit after a recommendation was added", async () => {
    const draftId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ]);
    // Add the recommended product at a deep discount → pushes the quote into CRITICAL risk.
    await addQuotationLineToDraft(
      draftId,
      { userId: repA.id, role: repA.role },
      { productId: addProductId, quantity: 1, unitPrice: "240.00", discountPercent: 60 }
    );

    await submitQuotation(draftId, { userId: repA.id, role: repA.role });

    const quotation = await db.quotation.findUnique({ where: { id: draftId } });
    assert.equal(quotation?.status, "PENDING_MANAGER");
    assert.equal(quotation?.riskLevel, "CRITICAL");
    const approvals = await db.approval.count({ where: { quotationId: draftId, level: "MANAGER", status: "PENDING" } });
    assert.equal(approvals, 1);
  });

  it("refuses to add a line to a non-DRAFT quotation (409)", async () => {
    const approvedId = await createQuotation(repA.id, [
      { productId: quoteProductId, quantity: 1, discountPercent: 0, unitPrice: "120.00" },
    ], "APPROVED");
    await expectQuotationError(
      () =>
        addQuotationLineToDraft(
          approvedId,
          { userId: repA.id, role: repA.role },
          { productId: addProductId, quantity: 1 }
        ),
      409,
      /Only DRAFT/
    );
  });
});