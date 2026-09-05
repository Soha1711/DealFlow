import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { notFound } from "@/lib/modules/quotations/errors";
import { canViewQuotation } from "@/lib/modules/quotations/guards";
import {
  getQuotation,
  updateDraftQuotation,
} from "@/lib/modules/quotations/quotation-service";
import { quotationIdSchema, updateQuotationSchema } from "@/lib/modules/quotations/validation";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/quotations/:id
 * Returns a single quotation. Sales reps may only view their own.
 */
export async function GET(_request: NextRequest, { params }: RouteContext) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsedId = quotationIdSchema.safeParse(id);
    if (!parsedId.success) {
      return toErrorResponse(parsedId.error);
    }

    const quotation = await getQuotation(parsedId.data);
    if (!quotation) {
      throw notFound("Quotation not found.");
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

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * PATCH /api/quotations/:id
 * Updates a DRAFT quotation owned by the current user. Lines are replaced
 * atomically and all totals are recalculated server-side.
 */
export async function PATCH(request: NextRequest, { params }: RouteContext) {
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
    const parsed = updateQuotationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const quotation = await updateDraftQuotation(
      parsedId.data,
      { userId: api.user.userId, role: api.user.role },
      {
      customerId: parsed.data.customerId,
      validUntil:
        parsed.data.validUntil === undefined
          ? undefined
          : parsed.data.validUntil === null
            ? null
            : new Date(parsed.data.validUntil),
      lines: parsed.data.lines,
    });

    return NextResponse.json({ data: quotation });
  } catch (error) {
    return toErrorResponse(error);
  }
}