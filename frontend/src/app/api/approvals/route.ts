import { NextResponse } from "next/server";

import { listApprovalQueue } from "@/lib/modules/approvals/approval-service";
import { listApprovalsQuerySchema } from "@/lib/modules/approvals/approval-validation";
import {
  errorResponse,
  getApprovalApiUser,
  toErrorResponse,
} from "./route-helpers";

/** GET /api/approvals — role-scoped approval queue with server-side pagination. */
export async function GET(request: Request) {
  const auth = await getApprovalApiUser();
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const parsed = listApprovalsQuerySchema.safeParse(
    Object.fromEntries(url.searchParams)
  );
  if (!parsed.success) {
    return errorResponse(400, "Invalid query parameters.", "VALIDATION_ERROR", {
      issues: parsed.error.issues,
    });
  }

  try {
    const result = await listApprovalQueue(auth.user, parsed.data);
    return NextResponse.json({
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    return toErrorResponse(error);
  }
}