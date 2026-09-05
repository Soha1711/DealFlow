import { NextResponse } from "next/server";

import { approveApproval } from "@/lib/modules/approvals/approval-service";
import { approveApprovalSchema, approvalIdSchema } from "@/lib/modules/approvals/approval-validation";
import {
  errorResponse,
  getApprovalApiUser,
  toErrorResponse,
} from "../../route-helpers";

/** POST /api/approvals/[id]/approve — transactional manager/finance approval. */
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

  // Approving takes no body; tolerate an absent or empty one.
  const raw = await request.text().catch(() => "");
  let body: unknown = {};
  if (raw.trim()) {
    try {
      body = JSON.parse(raw);
    } catch {
      return errorResponse(400, "Invalid JSON body.", "VALIDATION_ERROR");
    }
  }
  const bodyParsed = approveApprovalSchema.safeParse(body);
  if (!bodyParsed.success) {
    return errorResponse(400, "Invalid request payload.", "VALIDATION_ERROR", {
      issues: bodyParsed.error.issues,
    });
  }

  try {
    const result = await approveApproval(idParsed.data, auth.user);
    return NextResponse.json({ data: result });
  } catch (error) {
    return toErrorResponse(error);
  }
}