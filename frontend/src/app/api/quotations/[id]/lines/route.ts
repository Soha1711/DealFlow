import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { addQuotationLineToDraft } from "@/lib/modules/quotations/quotation-service";
import {
  addQuotationLineSchema,
  quotationIdSchema,
} from "@/lib/modules/quotations/validation";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

/**
 * POST /api/quotations/:id/lines
 *
 * Adds a single line to a DRAFT quotation owned by the caller — the "Add to
 * Quote" path for recommendations. The product is re-validated and priced by
 * the normal quotation service (Phase 2 pricing engine), and the quotation
 * stays under Phase 3 discount/approval governance. Nothing here trusts the
 * recommendation layer: the product must exist and the quote must be an
 * editable DRAFT owned by the current user.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = quotationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "Request body is required.", "BAD_REQUEST");
    }
    const parsed = addQuotationLineSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const quotation = await addQuotationLineToDraft(
      parsedId.data,
      { userId: api.user.userId, role: api.user.role },
      parsed.data
    );

    return NextResponse.json({ data: quotation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}