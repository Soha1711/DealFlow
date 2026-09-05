import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { submitQuotation } from "@/lib/modules/quotations/quotation-service";
import { quotationIdSchema } from "@/lib/modules/quotations/validation";
import { getQuotationApiUser, toErrorResponse } from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST /api/quotations/:id/submit
 * Transitions an owned DRAFT quotation to PENDING_APPROVAL.
 */
export async function POST(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = quotationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const quotation = await submitQuotation(parsedId.data, {
      userId: api.user.userId,
      role: api.user.role,
    });
    return NextResponse.json({ data: quotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}