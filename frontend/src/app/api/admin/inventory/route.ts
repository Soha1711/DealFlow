import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { adjustInventory } from "@/lib/modules/fulfillment/fulfillment-service";
import { FulfillmentError } from "@/lib/modules/fulfillment/fulfillment-errors";
import { adjustInventorySchema } from "@/lib/modules/fulfillment/validation";
import { errorResponse } from "@/app/api/fulfillment/route-helpers";
import { auth } from "@/lib/auth";

/**
 * POST /api/admin/inventory  { inventoryId, delta }
 *
 * Admin-only stock adjustment (transactional, guarded against negative
 * quantities). Used to replenish stock so backorders can be released.
 */
export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return errorResponse(401, "Authentication required.", "UNAUTHENTICATED");
  }
  if (session.user.role !== "ADMIN") {
    return errorResponse(403, "Only administrators can adjust inventory.", "FORBIDDEN");
  }

  const body = await request.json().catch(() => null);
  if (!body) {
    return errorResponse(400, "Request body is required.", "BAD_REQUEST");
  }
  const parsed = adjustInventorySchema.safeParse(body);
  if (!parsed.success) {
    return errorResponse(400, "Invalid request payload.", "VALIDATION_ERROR", {
      issues: parsed.error.issues,
    });
  }

  try {
    const inventory = await adjustInventory(
      parsed.data.inventoryId,
      parsed.data.delta,
      { userId: session.user.id, role: session.user.role }
    );
    return NextResponse.json({ data: inventory });
  } catch (error) {
    if (error instanceof FulfillmentError) {
      return errorResponse(error.status, error.message, error.code ?? "ERROR");
    }
    console.error("[admin inventory api] unexpected error:", error);
    return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
  }
}