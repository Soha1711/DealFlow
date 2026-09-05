import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { getBillingApiUser, toErrorResponse } from "@/app/api/billing/route-helpers";
import { listBillingQuerySchema } from "@/lib/modules/billing/billing-validation";
import { listBillingSchedules } from "@/lib/modules/billing/billing-schedule-service";

/**
 * GET /api/billing-schedules?page=1&pageSize=20&status=&q=
 * Server-side paginated billing schedule list (upcoming and past periods).
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getBillingApiUser();
    if ("error" in api) return api.error;

    const parsed = listBillingQuerySchema.safeParse(
      Object.fromEntries(request.nextUrl.searchParams)
    );
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await listBillingSchedules(api.user, {
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      q: parsed.data.q,
      status: parsed.data.status,
    });
    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
} 