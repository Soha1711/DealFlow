import { NextResponse, type NextRequest } from "next/server";

import { submitCustomerNegotiation } from "@/lib/modules/negotiations/negotiation-service";
import { submitNegotiationSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  errorResponse,
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/quotations/:id/negotiate
 * Customer submits a negotiation or change request on an APPROVED quotation.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "Request body is required.", "BAD_REQUEST");
    }

    const parsed = submitNegotiationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const negotiation = await submitCustomerNegotiation(
      id,
      authResult.user.customerId,
      authResult.user.userId,
      parsed.data
    );

    return NextResponse.json({ data: negotiation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}
