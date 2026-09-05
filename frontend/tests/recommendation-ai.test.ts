import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { Prisma } from "@prisma/client";

import {
  applyAiRanking,
  parseAiOutput,
} from "../src/lib/modules/recommendations/recommendation-ai.ts";
import {
  rankRecommendations,
  type CustomerHistoryContext,
  type QuotationContext,
} from "../src/lib/modules/recommendations/recommendation-engine.ts";
import { toRecommendationDto } from "../src/lib/modules/recommendations/recommendation-service.ts";

const { Decimal } = Prisma;

function buildDeterministic() {
  const context: QuotationContext = {
    productIds: new Set(["in-quote"]),
    categories: new Set(["Software"]),
    maxUnitPrice: "100.00",
  };
  const history: CustomerHistoryContext = { productIds: new Set(), categoryCounts: {} };
  return rankRecommendations(
    [
      { productId: "p1", name: "Analytics", sku: "ANL-1", category: "Software", price: "120.00", cost: "48.00", availableQuantity: 50 },
      { productId: "p2", name: "Support", sku: "SUP-2", category: "Support", price: "80.00", cost: "40.00", availableQuantity: 30 },
      { productId: "p3", name: "Edge", sku: "EDG-3", category: "Hardware", price: "999.00", cost: "540.00", availableQuantity: 10 },
    ],
    context,
    history,
    6
  );
}

describe("parseAiOutput", () => {
  const valid = JSON.stringify({
    recommendations: [{ productId: "p1", confidence: 90, reason: "Great fit", rationale: "Strong margin" }],
  });

  it("parses valid structured output", () => {
    const result = parseAiOutput(valid);
    assert.ok(result);
    assert.equal(result?.recommendations[0].productId, "p1");
  });

  it("parses JSON wrapped in markdown code fences", () => {
    const result = parseAiOutput("```json\n" + valid + "\n```");
    assert.ok(result);
    assert.equal(result?.recommendations[0].productId, "p1");
  });

  it("returns null for malformed JSON", () => {
    assert.equal(parseAiOutput("not json at all"), null);
    assert.equal(parseAiOutput("{ broken"), null);
    assert.equal(parseAiOutput(""), null);
  });

  it("returns null when the shape fails Zod validation (missing productId)", () => {
    assert.equal(parseAiOutput(JSON.stringify({ recommendations: [{ confidence: 50 }] })), null);
  });

  it("returns null when the model invents unknown fields", () => {
    assert.equal(parseAiOutput(JSON.stringify({ recommendations: "nope" })), null);
  });
});

describe("applyAiRanking", () => {
  it("falls back to deterministic output when the AI returns nothing", () => {
    const deterministic = buildDeterministic();
    const merged = applyAiRanking(deterministic, null);
    assert.equal(merged.aiEnhanced, false);
    assert.deepEqual(merged.recommendations, deterministic);
  });

  it("drops unknown product ids the AI invents", () => {
    const deterministic = buildDeterministic();
    const merged = applyAiRanking(deterministic, {
      recommendations: [
        { productId: "FABRICATED-1", confidence: 100 },
        { productId: "p1", confidence: 88, reason: "AI reason", rationale: "AI rationale" },
      ],
    });
    const ids = merged.recommendations.map((item) => item.productId);
    assert.ok(!ids.includes("FABRICATED-1"));
    const aiItem = merged.recommendations.find((item) => item.productId === "p1");
    assert.equal(aiItem?.aiRanked, true);
    assert.equal(aiItem?.reason, "AI reason");
    assert.equal(aiItem?.aiRationale, "AI rationale");
  });

  it("preserves deterministic coverage for products the AI skipped", () => {
    const deterministic = buildDeterministic();
    const merged = applyAiRanking(deterministic, {
      recommendations: [{ productId: deterministic[0].productId, confidence: 95 }],
    });
    const ids = merged.recommendations.map((item) => item.productId);
    assert.deepEqual(new Set(ids), new Set(deterministic.map((item) => item.productId)));
  });

  it("does not duplicate products when the AI repeats an id", () => {
    const deterministic = buildDeterministic();
    const merged = applyAiRanking(deterministic, {
      recommendations: [
        { productId: "p1", confidence: 90 },
        { productId: "p1", confidence: 10 },
      ],
    });
    const ids = merged.recommendations.map((item) => item.productId);
    assert.equal(ids.filter((id) => id === "p1").length, 1);
  });
});

describe("toRecommendationDto — data safety", () => {
  it("never includes product cost", () => {
    const dto = toRecommendationDto(buildDeterministic()[0], true);
    assert.equal("cost" in dto, false);
    assert.equal(JSON.stringify(dto).includes("cost"), false);
  });

  it("includes margin for internal roles", () => {
    const dto = toRecommendationDto(buildDeterministic()[0], true);
    assert.ok(dto.marginPercent);
  });

  it("omits margin for customer-facing output", () => {
    const dto = toRecommendationDto(buildDeterministic()[0], false);
    assert.equal(dto.marginPercent, undefined);
    assert.equal(JSON.stringify(dto).includes("margin"), false);
  });

  it("serializes money as fixed 2-decimal strings, not floats", () => {
    const dto = toRecommendationDto(buildDeterministic()[0], true);
    assert.match(dto.price, /^\d+\.\d{2}$/);
    assert.match(dto.marginPercent!, /^-?\d+\.\d{2}$/);
    const raw = JSON.stringify(dto);
    assert.ok(raw.includes(`"price":"`));
  });

  it("marks the source as ai only for AI-ranked items", () => {
    const deterministic = buildDeterministic();
    const merged = applyAiRanking(deterministic, {
      recommendations: [{ productId: deterministic[0].productId, confidence: 90 }],
    });
    const aiDto = toRecommendationDto(merged.recommendations[0], true);
    assert.equal(aiDto.source, "ai");
    const engineDto = toRecommendationDto(merged.recommendations[1], true);
    assert.equal(engineDto.source, "deterministic");
  });

  it("keeps price values Decimal-safe end to end", () => {
    const dto = toRecommendationDto(buildDeterministic()[0], true);
    assert.equal(dto.price, new Decimal(dto.price).toFixed(2));
  });
});