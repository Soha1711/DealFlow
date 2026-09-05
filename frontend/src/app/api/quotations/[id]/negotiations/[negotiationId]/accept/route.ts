import { NextResponse, type NextRequest } from "next/server";

import { acceptNegotiation } from "@/lib/modules/negotiations/negotiation-service";
import { acceptNegotiationSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string; negotiationId: string }> };

/**
 * POST /api/quotations/:id/negotiations/:negotiationId/accept
 * Sales rep accepts customer negotiation, recalculates pricing, reruns discount risk & approvals.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { negotiationId } = await params;
    const body = await request.json().catch(() => ({}));

    const parsed = acceptNegotiationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updatedQuotation = await acceptNegotiation(
      negotiationId,
      { userId: api.user.userId, role: api.user.role },
      parsed.data
    );

    return NextResponse.json({ data: updatedQuotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}
