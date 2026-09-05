import { NextResponse } from "next/server";

import { getFulfillment } from "@/lib/modules/fulfillment/fulfillment-service";
import { fulfillmentIdSchema } from "@/lib/modules/fulfillment/validation";
import {
  errorResponse,
  getFulfillmentApiUser,
  toErrorResponse,
} from "../route-helpers";

/** GET /api/fulfillment/[id] — single fulfillment with lines + allocations. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const api = await getFulfillmentApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const parsed = fulfillmentIdSchema.safeParse(id);
    if (!parsed.success) {
      return errorResponse(400, "Invalid fulfillment id.", "VALIDATION_ERROR");
    }

    const fulfillment = await getFulfillment(parsed.data, api.user);
    return NextResponse.json({ data: fulfillment });
  } catch (error) {
    return toErrorResponse(error);
  }
}