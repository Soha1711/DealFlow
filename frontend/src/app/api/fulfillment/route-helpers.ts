import { Prisma } from "@prisma/client";
import type { Role } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { FulfillmentError } from "@/lib/modules/fulfillment/fulfillment-errors";
import { QuotationError } from "@/lib/modules/quotations/errors";
import { ApprovalError } from "@/lib/modules/approvals/approval-errors";

export type FulfillmentApiUser = {
  userId: string;
  role: Role;
};

/**
 * Authenticates the request and checks coarse fulfillment access. FINANCE and
 * CUSTOMER are rejected here; finer record-level rules (owner-only reads for
 * sales reps, operations-only actions) are enforced by the service layer.
 */
export async function getFulfillmentApiUser(): Promise<
  { user: FulfillmentApiUser } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return {
      error: errorResponse(401, "Authentication required.", "UNAUTHENTICATED"),
    };
  }
  const allowed: Role[] = ["ADMIN", "OPERATIONS", "SALES_REP", "SALES_MANAGER"];
  if (!allowed.includes(session.user.role as Role)) {
    return {
      error: errorResponse(
        403,
        "You do not have access to fulfillment.",
        "FORBIDDEN"
      ),
    };
  }
  return {
    user: { userId: session.user.id, role: session.user.role as Role },
  };
}

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

/** Translates any thrown error into a structured JSON error response. */
export function toErrorResponse(error: unknown): NextResponse {
  if (
    error instanceof FulfillmentError ||
    error instanceof QuotationError ||
    error instanceof ApprovalError
  ) {
    return errorResponse(error.status, error.message, error.code ?? "ERROR");
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
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") {
      return errorResponse(404, "Fulfillment not found.", "NOT_FOUND");
    }
    if (error.code === "P2002") {
      return errorResponse(409, "A conflicting record already exists.", "CONFLICT");
    }
  }
  console.error("[fulfillment api] unexpected error:", error);
  return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
}