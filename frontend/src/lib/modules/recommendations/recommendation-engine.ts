import { Prisma } from "@prisma/client";

const { Decimal } = Prisma;

/**
 * Deterministic upsell / cross-sell recommendation engine.
 *
 * The engine works with zero AI: it scores every eligible product against the
 * customer's purchase history, the products already on the current quotation,
 * product margins (Decimal-safe) and current inventory. It never fabricates
 * data — every score is a pure function of inputs provided by the service.
 *
 * Candidate eligibility (enforced by the service before scoring):
 *   - the product exists in the database
 *   - the product is not already on the quotation
 *   - the product has available inventory (quantity − reservedQuantity > 0)
 *
 * Score (0–100, deterministic weights):
 *
 *   relevance   (0–40): +30 same category as a quote line,
 *                       +10 category appears in the customer's purchase history
 *   history     (0–20): +20 the exact product was purchased before
 *   margin      (0–25): 25 × clamp(marginRate / 0.40, 0, 1)
 *                       where marginRate = (price − cost) / price (Decimal)
 *   availability(0–15): 15 when available ≥ 20 units, 10 when available ≥ 1
 *
 * Recommendation type:
 *   same category as a quote line and price > any quote line unit price → upsell
 *   same category otherwise                                        → alternative
 *   different category                                             → cross-sell
 */

export type RecommendationAvailability = "available" | "low";

export type RecommendationCandidate = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  /** Unit price (Decimal-safe input). */
  price: Prisma.Decimal | string | number;
  /** Unit cost — used only for margin math, never returned to customers. */
  cost: Prisma.Decimal | string | number;
  /** Available units across all warehouses (quantity − reservedQuantity). */
  availableQuantity: number;
};

export type QuotationContext = {
  productIds: Set<string>;
  categories: Set<string>;
  /** Highest unit price among the quotation's lines (Decimal-safe input). */
  maxUnitPrice: Prisma.Decimal | string | number | null;
};

export type CustomerHistoryContext = {
  /** Product ids the customer has purchased before (approved+ quotes). */
  productIds: Set<string>;
  /** Category → number of historical purchases. */
  categoryCounts: Record<string, number>;
};

export type RecommendationType = "upsell" | "cross-sell" | "alternative";

export type ScoredRecommendation = {
  productId: string;
  name: string;
  sku: string;
  category: string;
  price: Prisma.Decimal;
  /** Margin rate as a percentage (0–100, Decimal-safe, may exceed 100). */
  marginPercent: Prisma.Decimal;
  availableQuantity: number;
  availability: RecommendationAvailability;
  type: RecommendationType;
  /** Deterministic 0–100 score. */
  score: number;
  /** Template-generated, deterministic reason. */
  reason: string;
};

function toDecimal(value: Prisma.Decimal | string | number): Prisma.Decimal {
  return value instanceof Decimal ? value : new Decimal(String(value));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function classifyRecommendation(
  candidate: { category: string; price: Prisma.Decimal },
  context: QuotationContext
): RecommendationType {
  if (context.categories.has(candidate.category)) {
    const maxUnitPrice = context.maxUnitPrice
      ? toDecimal(context.maxUnitPrice)
      : null;
    if (maxUnitPrice && candidate.price.greaterThan(maxUnitPrice)) {
      return "upsell";
    }
    return "alternative";
  }
  return "cross-sell";
}

function buildReason(
  candidate: RecommendationCandidate,
  type: RecommendationType,
  purchasedBefore: boolean,
  categoryHistoryCount: number
): string {
  const parts: string[] = [];
  if (purchasedBefore) {
    parts.push("Previously purchased by this customer.");
  }
  if (type === "upsell") {
    parts.push(
      `Higher-value ${candidate.category} option than what's on the quotation.`
    );
  } else if (type === "cross-sell") {
    parts.push(
      `Complements the ${candidate.category} products on this quotation.`
    );
  } else {
    parts.push(`Alternative ${candidate.category} option.`);
  }
  if (categoryHistoryCount > 0 && !purchasedBefore) {
    parts.push(
      `Customer has bought ${candidate.category} products before (${categoryHistoryCount}x).`
    );
  }
  if (candidate.availableQuantity > 0 && candidate.availableQuantity < 20) {
    parts.push("Limited stock.");
  }
  return parts.join(" ");
}

/**
 * Scores and ranks candidates. Returns the top `limit` recommendations sorted
 * by score (desc), then available quantity (desc), then price (desc).
 */
export function rankRecommendations(
  candidates: RecommendationCandidate[],
  context: QuotationContext,
  history: CustomerHistoryContext,
  limit: number
): ScoredRecommendation[] {
  // A product must never appear twice in the output, whatever the input shape.
  const seen = new Set<string>();
  const uniqueCandidates = candidates.filter((candidate) => {
    if (seen.has(candidate.productId)) return false;
    seen.add(candidate.productId);
    return true;
  });

  const scored: ScoredRecommendation[] = uniqueCandidates.map((candidate) => {
    const price = toDecimal(candidate.price);
    const cost = toDecimal(candidate.cost);
    const priceNumber = price.toNumber();

    const marginRate =
      priceNumber > 0 ? price.minus(cost).dividedBy(price) : new Decimal(0);
    const marginScore = 25 * clamp(marginRate.toNumber() / 0.4, 0, 1);

    const relevance =
      (context.categories.has(candidate.category) ? 30 : 0) +
      (history.categoryCounts[candidate.category] > 0 ? 10 : 0);
    const historyScore = history.productIds.has(candidate.productId) ? 20 : 0;
    const availabilityScore =
      candidate.availableQuantity >= 20 ? 15 : candidate.availableQuantity >= 1 ? 10 : 0;

    const score = Math.round(relevance + historyScore + marginScore + availabilityScore);

    const type = classifyRecommendation(
      { category: candidate.category, price },
      context
    );
    const purchasedBefore = history.productIds.has(candidate.productId);
    const categoryHistoryCount = history.categoryCounts[candidate.category] ?? 0;

    return {
      productId: candidate.productId,
      name: candidate.name,
      sku: candidate.sku,
      category: candidate.category,
      price,
      marginPercent: marginRate.times(100).toDecimalPlaces(2, Decimal.ROUND_HALF_UP),
      availableQuantity: candidate.availableQuantity,
      availability: candidate.availableQuantity < 20 ? "low" : "available",
      type,
      score,
      reason: buildReason(candidate, type, purchasedBefore, categoryHistoryCount),
    };
  });

  return scored
    .sort(
      (a, b) =>
        b.score - a.score ||
        b.availableQuantity - a.availableQuantity ||
        b.price.toNumber() - a.price.toNumber()
    )
    .slice(0, limit);
}