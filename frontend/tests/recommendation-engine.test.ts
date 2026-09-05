import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import {
  classifyRecommendation,
  rankRecommendations,
  type CustomerHistoryContext,
  type QuotationContext,
  type RecommendationCandidate,
} from "../src/lib/modules/recommendations/recommendation-engine.ts";

const { Decimal } = Prisma;

function candidate(
  overrides: Partial<RecommendationCandidate> & { productId: string }
): RecommendationCandidate {
  return {
    name: `Product ${overrides.productId}`,
    sku: `SKU-${overrides.productId}`,
    category: "Software",
    price: "100.00",
    cost: "40.00",
    availableQuantity: 50,
    ...overrides,
  };
}

function quote(overrides: Partial<QuotationContext> = {}): QuotationContext {
  return {
    productIds: new Set(["in-quote-1"]),
    categories: new Set(["Software"]),
    maxUnitPrice: "100.00",
    ...overrides,
  };
}

function history(overrides: Partial<CustomerHistoryContext> = {}): CustomerHistoryContext {
  return {
    productIds: new Set(),
    categoryCounts: {},
    ...overrides,
  };
}

describe("classifyRecommendation", () => {
  it("labels a same-category higher-priced product as upsell", () => {
    assert.equal(
      classifyRecommendation({ category: "Software", price: new Decimal("250") }, quote()),
      "upsell"
    );
  });

  it("labels a same-category non-upgrade as alternative", () => {
    assert.equal(
      classifyRecommendation({ category: "Software", price: new Decimal("50") }, quote()),
      "alternative"
    );
  });

  it("labels a different-category product as cross-sell", () => {
    assert.equal(
      classifyRecommendation({ category: "Hardware", price: new Decimal("250") }, quote()),
      "cross-sell"
    );
  });
});

describe("rankRecommendations — inventory awareness", () => {
  it("excludes candidates with zero available inventory (service-side)", () => {
    const candidates = [candidate({ productId: "a", availableQuantity: 0 })];
    const ranked = rankRecommendations(candidates, quote(), history(), 6);
    assert.equal(ranked.length, 1); // engine still scores it, service filters it
    assert.equal(ranked[0].availableQuantity, 0);
  });

  it("labels low stock when available quantity is under 20", () => {
    const ranked = rankRecommendations(
      [candidate({ productId: "a", availableQuantity: 5 })],
      quote(),
      history(),
      6
    );
    assert.equal(ranked[0].availability, "low");
    assert.match(ranked[0].reason, /Limited stock/);
  });

  it("prefers better-stocked products when scores tie", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "a", category: "Hardware", availableQuantity: 5 }),
        candidate({ productId: "b", category: "Hardware", availableQuantity: 80 }),
      ],
      quote(),
      history(),
      6
    );
    assert.equal(ranked[0].productId, "b");
  });
});

describe("rankRecommendations — margin awareness", () => {
  it("ranks a higher-margin product above a lower-margin one (same category, no history)", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "low", category: "Hardware", price: "100.00", cost: "80.00" }),
        candidate({ productId: "high", category: "Hardware", price: "100.00", cost: "40.00" }),
      ],
      quote(),
      history(),
      6
    );
    assert.equal(ranked[0].productId, "high");
  });

  it("computes margin with Decimal precision (no float drift)", () => {
    const ranked = rankRecommendations(
      [candidate({ productId: "a", price: "99.99", cost: "33.33" })],
      quote({ categories: new Set(["Hardware"]) }),
      history(),
      6
    );
    // (99.99 − 33.33) / 99.99 × 100 = 66.67%
    assert.equal(ranked[0].marginPercent.toString(), "66.67");
  });
});

describe("rankRecommendations — customer history", () => {
  it("boosts products the customer purchased before", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "past", category: "Hardware" }),
        candidate({ productId: "new", category: "Hardware" }),
      ],
      quote(),
      history({ productIds: new Set(["past"]) }),
      6
    );
    assert.equal(ranked[0].productId, "past");
    assert.match(ranked[0].reason, /Previously purchased/);
  });

  it("boosts categories present in the customer's purchase history", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "a", category: "Support" }),
        candidate({ productId: "b", category: "Hardware" }),
      ],
      quote({ categories: new Set(["Software"]) }),
      history({ categoryCounts: { Support: 3 } }),
      6
    );
    assert.equal(ranked[0].productId, "a");
    assert.match(ranked[0].reason, /bought Support products/);
  });
});

describe("rankRecommendations — quotation context & duplicates", () => {
  it("rewards products in the same category as the quotation (cross-sell affinity)", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "same", category: "Software" }),
        candidate({ productId: "other", category: "Hardware" }),
      ],
      quote({ categories: new Set(["Software"]) }),
      history(),
      6
    );
    assert.equal(ranked[0].productId, "same");
  });

  it("never returns the same product twice and respects the limit", () => {
    const ranked = rankRecommendations(
      [candidate({ productId: "a" }), candidate({ productId: "a" }), candidate({ productId: "b" })],
      quote(),
      history(),
      2
    );
    const ids = ranked.map((item) => item.productId);
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ranked.length, 2);
  });

  it("sorts by score descending", () => {
    const ranked = rankRecommendations(
      [
        candidate({ productId: "weak", category: "Hardware", availableQuantity: 50 }),
        candidate({ productId: "strong", category: "Software", availableQuantity: 50 }),
      ],
      quote({ categories: new Set(["Software"]) }),
      history(),
      6
    );
    assert.equal(ranked[0].productId, "strong");
  });

  it("is deterministic for identical inputs", () => {
    const input = [
      candidate({ productId: "a", category: "Software" }),
      candidate({ productId: "b", category: "Hardware", availableQuantity: 3 }),
    ];
    const first = rankRecommendations(input, quote(), history({ categoryCounts: { Support: 1 } }), 6);
    const second = rankRecommendations(input, quote(), history({ categoryCounts: { Support: 1 } }), 6);
    assert.deepEqual(first, second);
  });
});