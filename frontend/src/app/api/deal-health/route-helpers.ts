import { NextResponse } from "next/server";
import { ZodError } from "zod";
import type { Role } from "@prisma/client";

import { auth } from "@/lib/auth";
import { hasAreaAccess } from "@/lib/rbac";
import { DealHealthError } from "@/lib/modules/deal-health/deal-health-errors";

export type DealHealthApiUser = {
  userId: string;
  role: Role;
};

export async function getDealHealthApiUser(): Promise<
  { user: DealHealthApiUser } | { error: NextResponse }
> {
  const session = await auth();
  if (!session?.user?.id || !session.user.role) {
    return { error: errorResponse(401, "Authentication required.", "UNAUTHENTICATED") };
  }
  if (!hasAreaAccess(session.user.role, "deal-health")) {
    return { error: errorResponse(403, "You do not have access to deal health intelligence.", "FORBIDDEN") };
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

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof DealHealthError) {
    return errorResponse(error.status, error.message, "DEAL_HEALTH_ERROR");
  }
  if (error instanceof ZodError) {
    return errorResponse(
      400,
      "Invalid query parameters.",
      "VALIDATION_ERROR",
      error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      }))
    );
  }
  console.error("Deal Health API Error:", error);
  return errorResponse(500, "An unexpected error occurred.", "INTERNAL_ERROR");
}
