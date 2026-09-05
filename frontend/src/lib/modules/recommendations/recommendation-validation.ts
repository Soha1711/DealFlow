import { z } from "zod";

/**
 * Zod schemas for the recommendation API and for the structured output the
 * optional AI ranking layer must conform to. AI output is validated before it
 * is ever merged into a response; malformed output is discarded and the
 * deterministic engine's result is used instead.
 */

export const recommendationsQuerySchema = z.object({
  quotationId: z.string().min(1, "quotationId is required").max(64, "quotationId is too long"),
  limit: z.coerce
    .number()
    .int("limit must be an integer")
    .min(1, "limit must be at least 1")
    .max(20, "limit must be at most 20")
    .default(6),
  /** Set to "0"/"false" to skip the AI ranking layer entirely. */
  ai: z
    .enum(["0", "1", "true", "false"], { message: "ai must be a boolean flag" })
    .optional(),
});

export type RecommendationsQuery = z.infer<typeof recommendationsQuerySchema>;

/**
 * Structured output contract for the AI ranking layer. The model may only
 * pick `productId`s from the candidate list the server provides, and may only
 * explain/re-rank — it can never introduce prices, inventory, or products.
 */
export const aiRecommendationSchema = z.object({
  productId: z.string().min(1).max(64),
  /** 0–100 relevance/confidence estimate. */
  confidence: z.number().min(0).max(100).int().optional(),
  /** Short, factual reason for the recommendation. */
  reason: z.string().trim().max(300).optional(),
  /** Optional commercial rationale (e.g. margin narrative). */
  rationale: z.string().trim().max(500).optional(),
});

export const aiRankingOutputSchema = z.object({
  recommendations: z.array(aiRecommendationSchema).max(50),
});

export type AiRankingOutput = z.infer<typeof aiRankingOutputSchema>;