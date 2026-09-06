import { NextResponse, type NextRequest } from "next/server";

import { customerAcceptCounter } from "@/lib/modules/negotiations/negotiation-service";
import { customerAcceptCounterSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/negotiations/:id/accept
 * Customer accepts a sales representative's counter-offer.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const parsed = customerAcceptCounterSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updated = await customerAcceptCounter(
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
