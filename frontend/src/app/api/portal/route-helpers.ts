import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { NegotiationError } from "@/lib/modules/negotiations/negotiation-errors";
import { db } from "@/lib/db";

export type PortalApiUser = {
  userId: string;
  customerId: string;
  role: "CUSTOMER" | "ADMIN";
};

export function errorResponse(
  status: number,
  message: string,
  code = "ERROR",
  issues?: unknown
): NextResponse {
  return NextResponse.json(
    { error: { message, code, ...(issues !== undefined ? { issues } : {}) } },
    { status }
  );
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof NegotiationError) {
    return errorResponse(error.status, error.message, error.code);
  }
  if (error instanceof ZodError) {
    return errorResponse(
      400,
      "Invalid request payload.",
      "VALIDATION_ERROR",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }
  console.error("[portal api] unexpected error:", error);
  return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
}

/**
 * Validates that the request has an active session with role CUSTOMER or ADMIN
 * and resolves the customerId.
 */
export async function getPortalApiUser(): Promise<
  { user: PortalApiUser } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return { error: errorResponse(401, "Authentication required.", "UNAUTHENTICATED") };
  }

  const role = session.user.role;
  if (role !== "CUSTOMER" && role !== "ADMIN") {
    return {
      error: errorResponse(
        403,
        "Only customer accounts can access the customer portal.",
        "FORBIDDEN"
      ),
    };
  }

  let customerId = session.user.customerId;

  // Fallback: If session JWT didn't carry customerId, lookup from DB
  if (!customerId) {
    const user = await db.user.findUnique({
      where: { id: session.user.id },
      select: { customerId: true },
    });
    customerId = user?.customerId;
  }

  // For ADMIN preview without customerId, find the first customer
  if (!customerId && role === "ADMIN") {
    const firstCustomer = await db.customer.findFirst({ select: { id: true } });
    customerId = firstCustomer?.id;
  }

  if (!customerId) {
    return {
      error: errorResponse(
        403,
        "No customer account is linked to your user profile.",
        "NO_CUSTOMER_LINKED"
      ),
    };
  }

  return {
    user: {
      userId: session.user.id,
      customerId,
      role,
    },
  };
}
