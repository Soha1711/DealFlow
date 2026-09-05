import { NextResponse, type NextRequest } from "next/server";

import { listCustomerQuotations } from "@/lib/modules/negotiations/negotiation-service";
import { listPortalQuotationsQuerySchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

/**
 * GET /api/portal/quotations
 * Lists customer-accessible quotations for the authenticated customer account.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listPortalQuotationsQuerySchema.safeParse(params);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await listCustomerQuotations(
      authResult.user.customerId,
      parsed.data
    );

    return NextResponse.json(result);
  } catch (error) {
    return toErrorResponse(error);
  }
}
