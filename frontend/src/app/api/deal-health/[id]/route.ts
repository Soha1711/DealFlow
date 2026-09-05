import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getDealHealth } from "@/lib/modules/deal-health/deal-health-service";
import { dealHealthIdSchema } from "@/lib/modules/deal-health/deal-health-validation";
import { getDealHealthApiUser, toErrorResponse } from "../route-helpers";

/**
 * GET /api/deal-health/[id]
 * Evaluates and returns full deal health intelligence for a quotation:
 * score, level, positive/negative factors, detected anomalies and recommendations.
 */
export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const api = await getDealHealthApiUser();
    if ("error" in api) return api.error;

    const { id } = await context.params;
    const parsedId = dealHealthIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const health = await getDealHealth(parsedId.data, api.user);
    return NextResponse.json(health);
  } catch (error) {
    return toErrorResponse(error);
  }
}
