import { NextResponse } from "next/server";

import { rejectApproval } from "@/lib/modules/approvals/approval-service";
import { approvalIdSchema, rejectApprovalSchema } from "@/lib/modules/approvals/approval-validation";
import {
  errorResponse,
  getApprovalApiUser,
  toErrorResponse,
} from "../../route-helpers";

/** POST /api/approvals/[id]/reject — rejection always requires a reason. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await getApprovalApiUser();
  if ("error" in auth) return auth.error;

  const { id } = await params;
  const idParsed = approvalIdSchema.safeParse(id);
  if (!idParsed.success) {
    return errorResponse(400, "Invalid approval id.", "VALIDATION_ERROR");
  }

  const body = await request.json().catch(() => null);
  const bodyParsed = rejectApprovalSchema.safeParse(body);
  if (!bodyParsed.success) {
    return errorResponse(400, "Invalid request payload.", "VALIDATION_ERROR", {
      issues: bodyParsed.error.issues,
    });
  }

  try {
    const result = await rejectApproval(idParsed.data, auth.user, bodyParsed.data.reason);
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}