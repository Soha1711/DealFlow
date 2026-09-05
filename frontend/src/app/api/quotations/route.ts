import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createQuotation,
  listQuotations,
} from "@/lib/modules/quotations/quotation-service";
import {
  createQuotationSchema,
  listQuotationsQuerySchema,
} from "@/lib/modules/quotations/validation";
import {
  errorResponse,
  getQuotationApiUser,
  toErrorResponse,
} from "@/app/api/quotations/route-helpers";

/**
 * GET /api/quotations?page=1&pageSize=20&q=...&status=DRAFT
 * Lists quotations with server-side pagination. Sales reps only see their own.
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listQuotationsQuerySchema.safeParse(params);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const { data, pagination } = await listQuotations({
      role: api.user.role,
      userId: api.user.userId,
      page: parsed.data.page,
      pageSize: parsed.data.pageSize,
      search: parsed.data.q,
      status: parsed.data.status,
    });

    return NextResponse.json({ data, pagination });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/quotations
 * Creates a DRAFT quotation. The sales rep is taken from the session, the
 * quotation number is generated server-side and all totals are recalculated.
 */
export async function POST(request: NextRequest) {
  try {
    const api = await getQuotationApiUser();
    if ("error" in api) return api.error;

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "Request body is required.", "BAD_REQUEST");
    }

    const parsed = createQuotationSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const quotation = await createQuotation({
      salesRepId: api.user.userId,
      customerId: parsed.data.customerId,
      validUntil:
        parsed.data.validUntil == null ? null : new Date(parsed.data.validUntil),
      lines: parsed.data.lines,
    });

    return NextResponse.json({ data: quotation }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}