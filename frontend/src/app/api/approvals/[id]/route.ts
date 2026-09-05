import { NextResponse } from "next/server";

import { getApprovalDetail } from "@/lib/modules/approvals/approval-service";
import { approvalIdSchema } from "@/lib/modules/approvals/approval-validation";
import {
  errorResponse,
  getApprovalApiUser,
  toErrorResponse,
} from "../route-helpers";

/** GET /api/approvals/[id] — single approval with its quotation and lines. */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApprovalApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const parsed = approvalIdSchema.safeParse(id);
  if (!parsed.success) {
    return errorResponse(400, "Invalid approval id.", "VALIDATION_ERROR");
  }

  try {
    const approval = await getApprovalDetail(parsed.data, auth.user);
    return NextResponse.json({ data: approval });
  } catch (error) {
    return toErrorResponse(error);
  }
}