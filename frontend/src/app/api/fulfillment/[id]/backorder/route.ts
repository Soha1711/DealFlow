import { NextResponse } from "next/server";

import { backorderFulfillment } from "@/lib/modules/fulfillment/fulfillment-service";
import { fulfillmentActionSchema, fulfillmentIdSchema } from "@/lib/modules/fulfillment/validation";
import {
  errorResponse,
  getFulfillmentApiUser,
  toErrorResponse,
} from "../../route-helpers";

/** POST /api/fulfillment/[id]/backorder — explicitly backorders unallocated lines. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const api = await getFulfillmentApiUser();
    if ("error" in api) return api.error;

    const { id } = await params;
    const idParsed = fulfillmentIdSchema.safeParse(id);
    if (!idParsed.success) {
      return errorResponse(400, "Invalid fulfillment id.", "VALIDATION_ERROR");
    }

    const raw = await request.text().catch(() => "");
    let body: unknown = {};
    if (raw.trim()) {
      try {
        body = JSON.parse(raw);
      } catch {
        return errorResponse(400, "Invalid JSON body.", "VALIDATION_ERROR");
      }
    }
    const bodyParsed = fulfillmentActionSchema.safeParse(body);
    if (!bodyParsed.success) {
      return toErrorResponse(bodyParsed.error);
    }

    const fulfillment = await backorderFulfillment(idParsed.data, api.user);
    return NextResponse.json({ data: fulfillment });
  } catch (error) {
    return toErrorResponse(error);
  }
}