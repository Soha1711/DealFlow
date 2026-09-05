import { NextResponse, type NextRequest } from "next/server";

import { rejectNegotiation } from "@/lib/modules/negotiations/negotiation-service";
import { rejectNegotiationSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string; negotiationId: string }> };

/**
 * POST /api/quotations/:id/negotiations/:negotiationId/reject
 * Sales rep rejects customer negotiation with reason, reverting quote to APPROVED.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { negotiationId } = await params;
    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "Request body is required.", "BAD_REQUEST");
    }

    const parsed = rejectNegotiationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updatedNegotiation = await rejectNegotiation(
      negotiationId,
      { userId: api.user.userId, role: api.user.role },
      parsed.data
    );

    return NextResponse.json({ data: updatedNegotiation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
