import { NextResponse, type NextRequest } from "next/server";

import { customerRespondToCounter } from "@/lib/modules/negotiations/negotiation-service";
import { respondNegotiationSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  errorResponse,
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/negotiations/:id/respond
 * Customer responds to a sales representative's counter-proposal.
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

    const parsed = respondNegotiationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updated = await customerRespondToCounter(
      id,
      authResult.user.customerId,
      authResult.user.userId,
      parsed.data
    );

    return NextResponse.json({ data: updated });
  } catch (error) {
    return toErrorResponse(error);
  }
}
