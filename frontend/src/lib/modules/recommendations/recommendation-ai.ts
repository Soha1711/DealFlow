import {
  aiRankingOutputSchema,
  type AiRankingOutput,
} from "./recommendation-validation";
import type { ScoredRecommendation } from "./recommendation-engine";

/** A deterministic recommendation, optionally annotated by the AI layer. */
export type RankedRecommendation = ScoredRecommendation & {
  /** True when the AI layer ranked/annotated this item. */
  aiRanked?: boolean;
  /** AI-provided commercial rationale; only present when the AI ranked it. */
  aiRationale?: string;
};

/**
 * Optional AI ranking layer.
 *
 * The AI is a pure enhancement: it may re-rank and explain the deterministic
 * candidate pool, nothing more. It never mutates data, never sees raw SQL or
 * database access, and can only reference `productId`s the server supplied.
 * Prices, inventory, margins, discount limits, risk and approvals always come
 * from the deterministic application layer.
 *
 * Any failure — missing key, network error, timeout, malformed output — falls
 * back to the deterministic engine. The quotation workflow never depends on
 * the AI.
 */

export const AI_TIMEOUT_MS = 10_000;

export type AiContextPayload = {
  customer: { name: string; tier: string } | null;
  quotation: {
    quotationNumber: string;
    lines: { productName: string; sku: string; quantity: number; unitPrice: string }[];
  } | null;
  customerHistory: {
    productIds: string[];
    categoryCounts: Record<string, number>;
  };
  inventory: Record<string, { availableQuantity: number }>;
  promotions: { productId: string; label: string }[];
  candidates: {
    productId: string;
    sku: string;
    name: string;
    category: string;
    price: string;
    marginPercent: string;
    availableQuantity: number;
  }[];
};

/** Extracts the model's JSON from a chat response and validates it with Zod. */
export function parseAiOutput(raw: string): AiRankingOutput | null {
  if (!raw) return null;
  let text = raw.trim();

  // Strip markdown code fences if the model wrapped the JSON in them.
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();

  try {
    const parsed: unknown = JSON.parse(text);
    const result = aiRankingOutputSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export type AiRanker = (context: AiContextPayload) => Promise<AiRankingOutput | null>;

function env(name: string): string | undefined {
  return process.env[name]?.trim();
}

/**
 * Creates the production ranker (OpenAI-compatible chat completions endpoint)
 * when an API key is configured, or `null` when AI is unavailable. Configure:
 *
 *   AI_API_KEY=...            (required)
 *   AI_BASE_URL=...           (default https://api.openai.com/v1)
 *   AI_MODEL=...              (default gpt-4o-mini)
 */
export function createRanker(): AiRanker | null {
  const apiKey = env("AI_API_KEY");
  if (!apiKey) return null;

  const baseUrl = (env("AI_BASE_URL") ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = env("AI_MODEL") ?? "gpt-4o-mini";

  return async (context: AiContextPayload): Promise<AiRankingOutput | null> => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "system",
              content:
                "You are a sales-assistant that ranks upsell and cross-sell " +
                "recommendations for B2B quotations. The context below was " +
                "gathered from controlled read-only tools " +
                "(getCustomerHistory, getCurrentQuotation, getInventory, " +
                "getProductDetails, getProductMargin, getActivePromotions, " +
                "getProductRecommendations). You may ONLY pick productIds from " +
                "the provided candidate list — never invent products, prices, " +
                "inventory or history. Never mention costs or internal data. " +
                "Reply with a single JSON object: " +
                '{"recommendations":[{"productId":"...","confidence":0,"reason":"...","rationale":"..."}]}.',
            },
            { role: "user", content: JSON.stringify(context) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { choices?: { message?: { content?: string } }[] };
      const content = payload.choices?.[0]?.message?.content;
      return parseAiOutput(content ?? "");
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
}

/**
 * Merges the AI ranking with the deterministic result.
 *
 * The AI may only re-rank/annotate candidates the server already scored:
 * unknown product ids are dropped, and deterministic items the AI skipped are
 * appended (by score) so the response never shrinks below the limit due to
 * AI. Returns the final list plus whether the AI layer contributed.
 */
export function applyAiRanking(
  deterministic: ScoredRecommendation[],
  aiOutput: AiRankingOutput | null
): { recommendations: RankedRecommendation[]; aiEnhanced: boolean } {
  if (!aiOutput || aiOutput.recommendations.length === 0) {
    return { recommendations: deterministic, aiEnhanced: false };
  }

  const byId = new Map(deterministic.map((item) => [item.productId, item]));
  const ordered: RankedRecommendation[] = [];
  const mentioned = new Set<string>();

  for (const ai of aiOutput.recommendations) {
    const base = byId.get(ai.productId);
    if (!base || mentioned.has(ai.productId)) continue;
    mentioned.add(ai.productId);
    ordered.push({
      ...base,
      aiRanked: true,
      score: ai.confidence ?? base.score,
      reason: ai.reason?.trim() || base.reason,
      ...(ai.rationale?.trim() ? { aiRationale: ai.rationale.trim() } : {}),
    });
  }

  // Append anything the AI skipped so deterministic coverage is preserved.
  for (const item of deterministic) {
    if (!mentioned.has(item.productId)) ordered.push(item);
  }

  return {
    recommendations: ordered.slice(0, deterministic.length),
    aiEnhanced: mentioned.size > 0,
  };
}