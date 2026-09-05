import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getRecommendations } from "@/lib/modules/recommendations/recommendation-service";
import { recommendationsQuerySchema } from "@/lib/modules/recommendations/recommendation-validation";
import {
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

/**
 * GET /api/recommendations?quotationId=...&limit=6&ai=1
 *
 * Returns upsell/cross-sell recommendations for a quotation. The caller must
 * have access to the quotation (sales reps only their own). Recommendations
 * are always computed by the deterministic engine; the optional AI layer may
 * re-rank and explain, and silently falls back when unavailable. The response
 * never includes product cost and never exposes internal data to customers.
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = recommendationsQuerySchema.safeParse(params);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await getRecommendations(
      parsed.data.quotationId,
      { role: api.user.role, userId: api.user.userId },
      {
        limit: parsed.data.limit,
        useAi: parsed.data.ai === undefined || parsed.data.ai === "1" || parsed.data.ai === "true",
      }
    );

    return NextResponse.json({ data: result.data, meta: result.meta });
  } catch (error) {
    return toErrorResponse(error);
  }
}