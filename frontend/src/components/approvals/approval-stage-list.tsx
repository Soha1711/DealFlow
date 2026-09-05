import type { Approval, ApprovalLevel, DiscountApprovalLevel } from "@prisma/client";
import { Check, CircleDashed, X } from "lucide-react";

import { formatDate } from "@/lib/format";
import { APPROVAL_LEVEL_STAGE_LABELS } from "@/lib/labels";

type StageStatus = "NOT_STARTED" | "PENDING" | "APPROVED" | "REJECTED";

type Stage = {
  level: ApprovalLevel;
  label: string;
  status: StageStatus;
  approverName?: string;
  actedAt?: Date | null;
  reason?: string | null;
};

function stageIcon(status: StageStatus) {
  switch (status) {
    case "APPROVED":
      return <Check className="size-4 text-emerald-700" aria-hidden />;
    case "REJECTED":
      return <X className="size-4 text-red-700" aria-hidden />;
    case "PENDING":
      return <CircleDashed className="size-4 text-amber-700" aria-hidden />;
    default:
      return <CircleDashed className="size-4 text-muted-foreground" aria-hidden />;
  }
}

function stageText(stage: Stage): string {
  switch (stage.status) {
    case "APPROVED":
      return `Approved${stage.actedAt ? ` ${formatDate(stage.actedAt)}` : ""}${
        stage.approverName ? ` by ${stage.approverName}` : ""
      }`;
    case "REJECTED":
      return `Rejected${stage.actedAt ? ` ${formatDate(stage.actedAt)}` : ""}${
        stage.approverName ? ` by ${stage.approverName}` : ""
      }`;
    case "PENDING":
      return "Pending — awaiting action";
    default:
      return "Not started";
  }
}

/**
 * Builds the approval chain from the quotation's required approval depth and
 * its approval records. CRITICAL quotes show both Manager and Finance stages;
 * MEDIUM/HIGH show the Manager stage only.
 */
export function buildApprovalStages(
  requiredApprovalLevel: DiscountApprovalLevel | null,
  approvals: Pick<
    Approval,
    "level" | "status" | "actedAt" | "reason" | "approverId"
  >[],
  approverNames?: Record<string, string | undefined>
): Stage[] {
  const byLevel = new Map<ApprovalLevel, Stage>();
  for (const approval of approvals) {
    byLevel.set(approval.level, {
      level: approval.level,
      label: APPROVAL_LEVEL_STAGE_LABELS[approval.level],
      status: approval.status,
      approverName: approval.approverId
        ? approverNames?.[approval.approverId]
        : undefined,
      actedAt: approval.actedAt,
      reason: approval.reason,
    });
  }

  const stages: ApprovalLevel[] =
    requiredApprovalLevel === "MANAGER_AND_FINANCE"
      ? ["MANAGER", "FINANCE"]
      : requiredApprovalLevel === "MANAGER"
        ? ["MANAGER"]
        : [];

  return stages.map((level) => {
    const existing = byLevel.get(level);
    if (existing) return existing;
    return {
      level,
      label: APPROVAL_LEVEL_STAGE_LABELS[level],
      status: "NOT_STARTED" as const,
    };
  });
}

export function ApprovalStageList({ stages }: { stages: Stage[] }) {
  if (stages.length === 0) return null;
  return (
    <ol className="flex flex-col gap-3">
      {stages.map((stage) => (
        <li
          key={stage.level}
          className="flex items-start gap-3 rounded-lg border border-border bg-background p-3"
        >
          <span className="mt-0.5 shrink-0">{stageIcon(stage.status)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-foreground">{stage.label}</p>
            <p className="text-sm text-muted-foreground">{stageText(stage)}</p>
            {stage.reason && (
              <p className="mt-1 text-sm text-red-700">
                Reason: {stage.reason}
              </p>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}