import { NextResponse, type NextRequest } from "next/server";

import { listNegotiationsForQuotation } from "@/lib/modules/negotiations/negotiation-service";
import { getQuotation } from "@/lib/modules/quotations/quotation-service";
import { canViewQuotation } from "@/lib/modules/quotations/guards";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/quotations/:id/negotiations
 * Lists negotiation history for a quotation. Sales rep must have view permission.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const quotation = await getQuotation(id);
    if (!quotation) {
      return errorResponse(404, "Quotation not found.", "NOT_FOUND");
    }

    if (
      !canViewQuotation({
        role: api.user.role,
        userId: api.user.userId,
        salesRepId: quotation.salesRepId,
        status: quotation.status,
      })
    ) {
      return errorResponse(403, "You cannot view this quotation.", "FORBIDDEN");
    }

    const negotiations = await listNegotiationsForQuotation(id);
    return NextResponse.json({ data: negotiations });
  } catch (error) {
    return toErrorResponse(error);
  }
}
