import { NextResponse, type NextRequest } from "next/server";

import { counterNegotiation } from "@/lib/modules/negotiations/negotiation-service";
import { counterNegotiationSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string; negotiationId: string }> };

/**
 * POST /api/quotations/:id/negotiations/:negotiationId/counter
 * Sales rep sends counter-proposal to customer.
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

    const parsed = counterNegotiationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updatedNegotiation = await counterNegotiation(
      negotiationId,
      { userId: api.user.userId, role: api.user.role },
      parsed.data
    );

    return NextResponse.json({ data: updatedNegotiation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
