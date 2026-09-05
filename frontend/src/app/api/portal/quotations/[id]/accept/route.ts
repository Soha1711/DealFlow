import { NextResponse, type NextRequest } from "next/server";

import { customerAcceptQuotation } from "@/lib/modules/negotiations/negotiation-service";
import {
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/quotations/:id/accept
 * Customer accepts an APPROVED quotation as-is (transitions to CONFIRMED).
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const quotation = await customerAcceptQuotation(
      id,
      authResult.user.customerId,
      authResult.user.userId
    );

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
