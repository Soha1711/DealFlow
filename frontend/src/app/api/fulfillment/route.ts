import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import {
  createFulfillment,
  listFulfillments,
} from "@/lib/modules/fulfillment/fulfillment-service";
import {
  createFulfillmentSchema,
  listFulfillmentsQuerySchema,
} from "@/lib/modules/fulfillment/validation";
import {
  errorResponse,
  getFulfillmentApiUser,
  toErrorResponse,
} from "./route-helpers";

/**
 * GET /api/fulfillment?page=1&pageSize=20&status=...
 * Fulfillment queue. Sales reps only see their own quotations' fulfillments.
 */
export async function GET(request: NextRequest) {
  try {
    const api = await getFulfillmentApiUser();
    if ("error" in api) return api.error;

    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    const parsed = listFulfillmentsQuerySchema.safeParse(params);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const result = await listFulfillments(api.user, parsed.data);
    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}

/**
 * POST /api/fulfillment  { quotationId }
 * Starts fulfillment for an APPROVED quotation. Lines and quantities are read
 * from the database — client values are never trusted. Recurring/service
 * products are excluded from physical fulfillment.
 */
export async function POST(request: NextRequest) {
  try {
    const api = await getFulfillmentApiUser();
    if ("error" in api) return api.error;

    const body = await request.json().catch(() => null);
    if (!body) {
      return errorResponse(400, "Request body is required.", "BAD_REQUEST");
    }
    const parsed = createFulfillmentSchema.safeParse(body);
    if (!parsed.success) {
      return toErrorResponse(parsed.error);
    }

    const fulfillment = await createFulfillment(
      parsed.data.quotationId,
      api.user
    );
    return NextResponse.json({ data: fulfillment }, { status: 201 });
  } catch (error) {
    return toErrorResponse(error);
  }
}