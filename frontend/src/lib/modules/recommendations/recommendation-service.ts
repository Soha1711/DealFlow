import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";

import { forbidden, notFound } from "@/lib/modules/quotations/errors";
import { canViewQuotation } from "@/lib/modules/quotations/guards";
import {
  rankRecommendations,
  type QuotationContext,
  type CustomerHistoryContext,
} from "./recommendation-engine";
import {
  getActivePromotions,
  getCustomerHistory,
  getCurrentQuotation,
  getEligibleCandidates,
  getInventorySnapshot,
  getProductMargin,
} from "./recommendation-tools";
import {
  applyAiRanking,
  createRanker,
  type AiContextPayload,
  type AiRanker,
  type RankedRecommendation,
} from "./recommendation-ai";

const { Decimal } = Prisma;

/**
 * Recommendation orchestration service.
 *
 * Pipeline (all server-side):
 *   1. load + authorize the quotation (sales reps only their own)
 *   2. gather read-only context via the controlled tools
 *   3. run the deterministic engine (always)
 *   4. optionally re-rank/explain with the AI layer (never a dependency)
 *   5. build the DTO (never includes cost; margin is internal-only)
 *
 * Adding a recommendation to a quotation is NOT done here — the UI calls the
 * normal quotation mutation endpoint, which reuses the Phase 2 pricing engine
 * and keeps Phase 3 discount/approval governance intact.
 */

export type RecommendationActor = { role: Role; userId: string };

export type GetRecommendationsOptions = {
  limit: number;
  useAi: boolean;
  /** Injectable for tests; defaults to the env-configured ranker. */
  ranker?: AiRanker | null;
};

export type RecommendationDto = {
  productId: string;
  sku: string;
  name: string;
  category: string;
  price: string;
  /** Internal-only; omitted for non-internal roles. */
  marginPercent?: string;
  availability: "available" | "low";
  availableQuantity: number;
  type: "upsell" | "cross-sell" | "alternative";
  confidence: number;
  reason: string;
  rationale?: string;
  source: "ai" | "deterministic";
};

/** Pure DTO builder — cost is never included; margin is internal-only. */
export function toRecommendationDto(
  item: RankedRecommendation,
  includeMargin: boolean
): RecommendationDto {
  return {
    productId: item.productId,
    sku: item.sku,
    name: item.name,
    category: item.category,
    price: item.price.toFixed(2),
    ...(includeMargin ? { marginPercent: item.marginPercent.toFixed(2) } : {}),
    availability: item.availability,
    availableQuantity: item.availableQuantity,
    type: item.type,
    confidence: item.score,
    reason: item.reason,
    ...(item.aiRationale ? { rationale: item.aiRationale } : {}),
    source: item.aiRanked ? "ai" : "deterministic",
  };
}

export type GetRecommendationsResult = {
  data: RecommendationDto[];
  meta: {
    quotationId: string;
    customerName: string;
    aiAvailable: boolean;
    aiEnhanced: boolean;
    engine: "ai-enhanced" | "deterministic";
    limit: number;
  };
};

export async function getRecommendations(
  quotationId: string,
  actor: RecommendationActor,
  options: GetRecommendationsOptions
): Promise<GetRecommendationsResult> {
  // 1. Load and authorize the quotation (never trust the caller's context).
  const quotation = await getCurrentQuotation(quotationId);
  if (!quotation) {
    throw notFound("Quotation not found.");
  }
  if (
    !canViewQuotation({
      role: actor.role,
      userId: actor.userId,
      salesRepId: quotation.salesRepId,
      status: quotation.status,
    })
  ) {
    throw forbidden("You cannot view this quotation.", "FORBIDDEN");
  }

  // 2. Read-only context via the controlled tools.
  const [history, inventory, promotions] = await Promise.all([
    getCustomerHistory(quotation.customerId),
    getInventorySnapshot(),
    getActivePromotions(),
  ]);

  const quoteProductIds = quotation.lines.map((line) => line.productId);
  const candidates = await getEligibleCandidates(quoteProductIds);

  const marginRows = await getProductMargin(candidates.map((c) => c.productId));
  const marginPercentById = new Map<string, string>();
  for (const row of marginRows) {
    const price = new Decimal(row.price);
    const cost = new Decimal(row.cost);
    const rate = price.isZero()
      ? new Decimal(0)
      : price.minus(cost).dividedBy(price).times(100);
    marginPercentById.set(row.id, rate.toDecimalPlaces(2).toString());
  }

  // 3. Deterministic engine (the foundation — always runs).
  const quoteContext: QuotationContext = {
    productIds: new Set(quoteProductIds),
    categories: new Set(quotation.lines.map((line) => line.product.category)),
    maxUnitPrice: quotation.lines.reduce<Prisma.Decimal | null>(
      (max, line) => {
        const unitPrice = new Decimal(line.unitPrice);
        return !max || unitPrice.greaterThan(max) ? unitPrice : max;
      },
      null
    ),
  };
  const historyContext: CustomerHistoryContext = {
    productIds: new Set(history.productIds),
    categoryCounts: history.categoryCounts,
  };
  // Score a wider pool than we display so the AI (and the UI) has headroom.
  const poolLimit = Math.max(options.limit, 40);
  const deterministic = rankRecommendations(
    candidates,
    quoteContext,
    historyContext,
    poolLimit
  );

  // 4. Optional AI enhancement — never a dependency.
  let ranked: RankedRecommendation[] = deterministic;
  let aiEnhanced = false;
  const ranker =
    options.useAi && options.ranker !== undefined
      ? options.ranker
      : options.useAi
        ? createRanker()
        : null;
  const aiAvailable = ranker !== null;

  if (ranker) {
    const aiContext: AiContextPayload = {
      customer: {
        name: quotation.customer.name,
        tier: quotation.customer.tier,
      },
      quotation: {
        quotationNumber: quotation.quotationNumber,
        lines: quotation.lines.map((line) => ({
          productName: line.product.name,
          sku: line.product.sku,
          quantity: line.quantity,
          unitPrice: line.unitPrice.toString(),
        })),
      },
      customerHistory: {
        productIds: history.productIds,
        categoryCounts: history.categoryCounts,
      },
      inventory,
      promotions,
      candidates: deterministic.map((item) => ({
        productId: item.productId,
        sku: item.sku,
        name: item.name,
        category: item.category,
        price: item.price.toString(),
        marginPercent: marginPercentById.get(item.productId) ?? "0",
        availableQuantity: item.availableQuantity,
      })),
    };
    try {
      const merged = applyAiRanking(deterministic, await ranker(aiContext));
      ranked = merged.recommendations;
      aiEnhanced = merged.aiEnhanced;
    } catch {
      // Any AI failure falls back to the deterministic result.
      ranked = deterministic;
      aiEnhanced = false;
    }
  }

  // 5. DTO — internal roles see margin; nobody ever sees cost.
  const includeMargin = actor.role !== "CUSTOMER";
  const display = ranked.slice(0, options.limit);

  return {
    data: display.map((item) => toRecommendationDto(item, includeMargin)),
    meta: {
      quotationId,
      customerName: quotation.customer.name,
      aiAvailable,
      aiEnhanced,
      engine: aiEnhanced ? "ai-enhanced" : "deterministic",
      limit: options.limit,
    },
  };
}