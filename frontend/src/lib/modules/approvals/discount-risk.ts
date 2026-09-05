import { Prisma } from "@prisma/client";
import type {
  DiscountApprovalLevel,
  DiscountRiskLevel,
} from "@prisma/client";

const { Decimal } = Prisma;

/**
 * Deterministic discount-risk scoring for quotations.
 *
 * The engine is PRODUCT-SPECIFIC: every quotation line is evaluated against
 * that line's product `maxDiscountPercent` (never a global threshold). It is
 * fully deterministic — no randomness, no AI — and auditable: the same
 * quotation always yields the same score, level and required approval level.
 *
 * Per line:
 *
 *   requested      = line.discountPercent
 *   maxAllowed     = product.maxDiscountPercent
 *   variance       = requested − maxAllowed
 *   relativeOverage= variance / max(1, maxAllowed)     // multiples of the allowance
 *   marginRate     = lineTotal > 0 ? line.margin / lineTotal : 0
 *   marginPenalty  = marginRate < 0 ? min(30, round(|marginRate| × 100)) : 0
 *
 *   lineScore = 0                                     (requested ≤ maxAllowed)
 *             = min(100, round(40 × min(relativeOverage, 2)) + marginPenalty)
 *
 * Quotation score = max lineScore over all lines (0 for an empty quotation).
 * A line that loses money adds up to 30 points on top of the overage terms.
 *
 * Level mapping (score → level → required approval):
 *
 *   0        → LOW      → NONE
 *   1–39     → MEDIUM   → MANAGER
 *   40–69    → HIGH     → MANAGER
 *   70–100   → CRITICAL → MANAGER_AND_FINANCE
 *
 * Margin arithmetic uses Prisma `Decimal`; the final integer score is rounded
 * half-up. All money figures are already rounded to 2 decimals upstream.
 */

export type DiscountRiskLineInput = {
  /** Requested discount percent on the line (0–100). */
  discountPercent: number;
  /** Product-specific maximum discount percent. */
  maxDiscountPercent: number;
  /** Line total after discount. */
  lineTotal: Prisma.Decimal | string | number;
  /** Line margin after discount (lineTotal − cost). */
  margin: Prisma.Decimal | string | number;
};

export type DiscountAnalysisLine = {
  discountPercent: number;
  maxDiscountPercent: number;
  /** requested − maxAllowed; ≤ 0 when within the product limit. */
  variance: number;
  exceedsLimit: boolean;
  /** Margin as a percent of line total (negative = loss-making line). */
  marginImpact: number;
  /** Deterministic 0–100 contribution of this line. */
  lineScore: number;
};

export type DiscountRiskResult = {
  /** 0–100 integer; the riskiest line governs. */
  score: number;
  level: DiscountRiskLevel;
  requiredApprovalLevel: DiscountApprovalLevel;
  /** Per-line analysis for the approval UI. */
  analysis: DiscountAnalysisLine[];
  /** Deterministic human-readable summary. */
  rationale: string;
};

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Decimal ? value : new Decimal(String(value));
}

function round(value: number): number {
  return Math.round(value);
}

/** Computes the deterministic 0–100 risk score for a single line. */
export function calculateLineRiskScore(
  input: DiscountRiskLineInput
): DiscountAnalysisLine {
  const { discountPercent, maxDiscountPercent } = input;
  const variance = discountPercent - maxDiscountPercent;

  if (variance <= 0) {
    return {
      discountPercent,
      maxDiscountPercent,
      variance,
      exceedsLimit: false,
      marginImpact: 0,
      lineScore: 0,
    };
  }

  const relativeOverage = variance / Math.max(1, maxDiscountPercent);
  const lineTotal = toDecimal(input.lineTotal);
  const margin = toDecimal(input.margin);
  const marginRate =
    lineTotal.isZero() || lineTotal.isNegative()
      ? new Decimal(0)
      : margin.dividedBy(lineTotal);
  const marginImpact =
    marginRate.isNegative() && !marginRate.isZero()
      ? Math.min(30, round(Math.abs(marginRate.toNumber()) * 100))
      : 0;

  const overageTerm = 40 * Math.min(relativeOverage, 2);
  const lineScore = Math.min(100, round(overageTerm) + marginImpact);

  return {
    discountPercent,
    maxDiscountPercent,
    variance,
    exceedsLimit: true,
    marginImpact: round(marginRate.toNumber() * 100),
    lineScore,
  };
}

/** Maps a 0–100 score to a risk level (deterministic thresholds). */
export function riskLevelForScore(score: number): DiscountRiskLevel {
  if (score <= 0) return "LOW";
  if (score <= 39) return "MEDIUM";
  if (score <= 69) return "HIGH";
  return "CRITICAL";
}

/** Maps a risk level to the approval depth required by the routing rules. */
export function requiredApprovalForRisk(
  level: DiscountRiskLevel
): DiscountApprovalLevel {
  switch (level) {
    case "LOW":
      return "NONE";
    case "MEDIUM":
    case "HIGH":
      return "MANAGER";
    case "CRITICAL":
      return "MANAGER_AND_FINANCE";
  }
}

/**
 * Computes the quotation-level discount risk from its lines. The score is the
 * maximum line score — the riskiest line drives the outcome. Deterministic.
 */
export function calculateDiscountRisk(
  lines: DiscountRiskLineInput[]
): DiscountRiskResult {
  const analysis = lines.map(calculateLineRiskScore);
  const score = analysis.reduce((max, line) => Math.max(max, line.lineScore), 0);
  const level = riskLevelForScore(score);
  const requiredApprovalLevel = requiredApprovalForRisk(level);

  const exceeding = analysis.filter((line) => line.exceedsLimit);
  const rationale =
    exceeding.length === 0
      ? "All lines are within their product discount limits."
      : `${exceeding.length} line${exceeding.length === 1 ? "" : "s"} exceed${
          exceeding.length === 1 ? "s" : ""
        } product discount limits (max variance ${Math.max(
          ...exceeding.map((line) => line.variance)
        )} percentage points, max line score ${Math.max(
          ...exceeding.map((line) => line.lineScore)
        )}).`;

  return {
    score,
    level,
    requiredApprovalLevel,
    analysis,
    rationale,
  };
}