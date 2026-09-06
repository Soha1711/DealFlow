import { NextResponse, type NextRequest } from "next/server";

import { customerRejectCounter } from "@/lib/modules/negotiations/negotiation-service";
import { customerRejectCounterSchema } from "@/lib/modules/negotiations/negotiation-validation";
import {
  getPortalApiUser,
  toErrorResponse,
} from "@/app/api/portal/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/portal/negotiations/:id/reject
 * Customer declines a sales representative's counter-offer.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const authResult = await getPortalApiUser();
    if ("error" in authResult) return authResult.error;

    const { id } = await params;
    const body = await request.json().catch(() => ({}));

    const parsed = customerRejectCounterSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const updated = await customerRejectCounter(
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
