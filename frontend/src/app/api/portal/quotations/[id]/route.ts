import { NextResponse, type NextRequest } from "next/server";

import { getCustomerQuotation } from "@/lib/modules/negotiations/negotiation-service";
import {
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/portal/quotations/:id
 * Fetches a single quotation for the authenticated customer. IDOR-protected.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const quotation = await getCustomerQuotation(id, authResult.user.customerId);

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
