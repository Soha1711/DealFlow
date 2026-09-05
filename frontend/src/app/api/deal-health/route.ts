import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { listPortfolioDealHealth } from "@/lib/modules/deal-health/deal-health-service";
import { listDealHealthQuerySchema } from "@/lib/modules/deal-health/deal-health-validation";
import { getDealHealthApiUser, toErrorResponse } from "./route-helpers";

/**
 * GET /api/deal-health?page=1&pageSize=20&q=...&level=ALL|HEALTHY|AT_RISK|CRITICAL&salesRepId=...
 * Returns a paginated list of deals with computed health scores and portfolio KPI summary.
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getDealHealthApiUser();
    if ("error" in api) return api.error;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listDealHealthQuerySchema.safeParse(params);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await listPortfolioDealHealth(api.user, parsed.data);
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
