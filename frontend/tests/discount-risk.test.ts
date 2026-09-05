import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  calculateDiscountRisk,
  calculateLineRiskScore,
  riskLevelForScore,
  requiredApprovalForRisk,
  type DiscountRiskLineInput,
} from "../src/lib/modules/approvals/discount-risk.ts";

function line(
  discountPercent: number,
  maxDiscountPercent: number,
  lineTotal: number | string = 1000,
  margin: number | string = 200
): DiscountRiskLineInput {
  return { discountPercent, maxDiscountPercent, lineTotal, margin };
}

describe("calculateLineRiskScore", () => {
  it("scores 0 for a discount within the product limit", () => {
    const result = calculateLineRiskScore(line(20, 20));
    assert.equal(result.lineScore, 0);
    assert.equal(result.exceedsLimit, false);
    assert.equal(result.variance, 0);
  });

  it("scores 0 for a discount below the product limit", () => {
    const result = calculateLineRiskScore(line(5, 20));
    assert.equal(result.lineScore, 0);
    assert.equal(result.exceedsLimit, false);
  });

  it("flags a discount exceeding the product limit with a positive variance", () => {
    const result = calculateLineRiskScore(line(25, 20));
    assert.equal(result.exceedsLimit, true);
    assert.equal(result.variance, 5);
    assert.ok(result.lineScore > 0);
  });

  it("is product-specific: identical overage on a smaller allowance scores higher", () => {
    const wide = calculateLineRiskScore(line(25, 20)); // 5pp over a 20% allowance
    const narrow = calculateLineRiskScore(line(10, 5)); // 5pp over a 5% allowance
    assert.ok(narrow.lineScore > wide.lineScore);
  });

  it("adds a margin penalty when the line loses money", () => {
    const profitable = calculateLineRiskScore(line(30, 20, 1000, 200));
    const lossMaking = calculateLineRiskScore(line(30, 20, 1000, -200));
    assert.ok(lossMaking.lineScore > profitable.lineScore);
  });

  it("caps the margin penalty at 30 points", () => {
    const result = calculateLineRiskScore(line(30, 20, 100, -90));
    // marginRate = -0.9 → penalty capped at 30; overage term = 20.
    assert.equal(result.lineScore, 50);
  });
});

describe("riskLevelForScore / requiredApprovalForRisk", () => {
  it("maps score 0 to LOW / NONE", () => {
    assert.equal(riskLevelForScore(0), "LOW");
    assert.equal(requiredApprovalForRisk("LOW"), "NONE");
  });

  it("maps scores 1–39 to MEDIUM / MANAGER", () => {
    assert.equal(riskLevelForScore(1), "MEDIUM");
    assert.equal(riskLevelForScore(39), "MEDIUM");
    assert.equal(requiredApprovalForRisk("MEDIUM"), "MANAGER");
  });

  it("maps scores 40–69 to HIGH / MANAGER", () => {
    assert.equal(riskLevelForScore(40), "HIGH");
    assert.equal(riskLevelForScore(69), "HIGH");
    assert.equal(requiredApprovalForRisk("HIGH"), "MANAGER");
  });

  it("maps scores 70–100 to CRITICAL / MANAGER_AND_FINANCE", () => {
    assert.equal(riskLevelForScore(70), "CRITICAL");
    assert.equal(riskLevelForScore(100), "CRITICAL");
    assert.equal(requiredApprovalForRisk("CRITICAL"), "MANAGER_AND_FINANCE");
  });
});

describe("calculateDiscountRisk", () => {
  it("routes LOW risk to no approval", () => {
    const result = calculateDiscountRisk([line(10, 20), line(0, 5)]);
    assert.equal(result.score, 0);
    assert.equal(result.level, "LOW");
    assert.equal(result.requiredApprovalLevel, "NONE");
  });

  it("routes a small overage to MEDIUM (manager approval)", () => {
    // 22% vs 20% allowance → variance 2, relativeOverage 0.1 → 4 points.
    const result = calculateDiscountRisk([line(22, 20)]);
    assert.equal(result.score, 4);
    assert.equal(result.level, "MEDIUM");
    assert.equal(result.requiredApprovalLevel, "MANAGER");
  });

  it("routes a 2× overage to HIGH (manager approval)", () => {
    // 40% vs 20% allowance → relativeOverage 1.0 → 40 points.
    const result = calculateDiscountRisk([line(40, 20)]);
    assert.equal(result.score, 40);
    assert.equal(result.level, "HIGH");
    assert.equal(result.requiredApprovalLevel, "MANAGER");
  });

  it("routes an extreme overage to CRITICAL (manager + finance)", () => {
    // 60% vs 20% allowance → relativeOverage capped at 2.0 → 80 points.
    const result = calculateDiscountRisk([line(60, 20)]);
    assert.equal(result.score, 80);
    assert.equal(result.level, "CRITICAL");
    assert.equal(result.requiredApprovalLevel, "MANAGER_AND_FINANCE");
  });

  it("uses the riskiest line to determine the quotation level", () => {
    const result = calculateDiscountRisk([
      line(10, 20),
      line(75, 25), // 75% vs 25% → relativeOverage 2.0 → 80
      line(0, 5),
    ]);
    assert.equal(result.score, 80);
    assert.equal(result.level, "CRITICAL");
    assert.equal(result.requiredApprovalLevel, "MANAGER_AND_FINANCE");
  });

  it("treats an empty quotation as LOW risk", () => {
    const result = calculateDiscountRisk([]);
    assert.equal(result.score, 0);
    assert.equal(result.level, "LOW");
    assert.equal(result.requiredApprovalLevel, "NONE");
  });

  it("is deterministic — identical inputs produce identical outputs", () => {
    const input = [line(35, 20, 1000, 150), line(12, 25), line(5, 10)];
    const first = calculateDiscountRisk(input);
    const second = calculateDiscountRisk(input);
    assert.deepEqual(first, second);
  });

  it("computes per-line analysis for the approval UI", () => {
    const result = calculateDiscountRisk([line(25, 20)]);
    assert.equal(result.analysis.length, 1);
    assert.equal(result.analysis[0].discountPercent, 25);
    assert.equal(result.analysis[0].maxDiscountPercent, 20);
    assert.equal(result.analysis[0].variance, 5);
    assert.equal(result.analysis[0].exceedsLimit, true);
  });
});