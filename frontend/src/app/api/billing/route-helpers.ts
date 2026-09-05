import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { hasAreaAccess } from "@/lib/rbac";
import { BillingError } from "@/lib/modules/billing/billing-errors";
import { QuotationError } from "@/lib/modules/quotations/errors";

export type BillingApiUser = {
  userId: string;
  role: "ADMIN" | "FINANCE" | "SALES_MANAGER" | "SALES_REP";
};

/**
 * Authenticates the request and checks area-level access to the Billing
 * module. Billing is read-only for sales roles; mutations are further gated
 * by the billing services (`assertCanManageBilling`). Returns the user, or a
 * 401/403 `NextResponse` to short-circuit with.
 */
export async function getBillingApiUser(): Promise<
  { user: BillingApiUser } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return {
      error: errorResponse(401, "Authentication required.", "UNAUTHENTICATED"),
    };
  }
  if (!hasAreaAccess(session.user.role, "billing")) {
    return {
      error: errorResponse(403, "You do not have access to billing.", "FORBIDDEN"),
    };
  }
  return {
    user: {
      userId: session.user.id,
      role: session.user.role as BillingApiUser["role"],
    },
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
  if (error instanceof BillingError || error instanceof QuotationError) {
    return errorResponse(error.status, error.message, error.code ?? "ERROR");
  }
  if (error instanceof ZodError) {
    return errorResponse(
      422,
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
      return errorResponse(404, "Record not found.", "NOT_FOUND");
    }
    if (error.code === "P2002") {
      return errorResponse(409, "A conflicting record already exists.", "CONFLICT");
    }
  }
  console.error("[billing api] unexpected error:", error);
  return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
} 