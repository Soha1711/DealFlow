import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { auth } from "@/lib/auth";
import { hasAreaAccess } from "@/lib/rbac";
import { QuotationError } from "@/lib/modules/quotations/errors";

export type ApiUser = {
  userId: string;
  role: "ADMIN" | "SALES_REP" | "SALES_MANAGER";
};

/**
 * Authenticates the request and checks area-level access to the Quotations
 * module. Returns the user, or a 401/403 `NextResponse` to short-circuit with.
 */
export async function getQuotationApiUser(): Promise<
  { user: ApiUser } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return { error: errorResponse(401, "Authentication required.", "UNAUTHENTICATED") };
  }
  if (!hasAreaAccess(session.user.role, "quotations")) {
    return { error: errorResponse(403, "You do not have access to quotations.", "FORBIDDEN") };
  }
  return { user: { userId: session.user.id, role: session.user.role } };
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
  if (error instanceof QuotationError) {
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
      return errorResponse(404, "Quotation not found.", "NOT_FOUND");
    }
    if (error.code === "P2002") {
      return errorResponse(409, "A conflicting record already exists.", "CONFLICT");
    }
  }
  console.error("[quotations api] unexpected error:", error);
  return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
}