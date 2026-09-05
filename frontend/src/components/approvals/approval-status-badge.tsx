import type { ApprovalStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  APPROVAL_STATUS_BADGE_CLASSES,
  APPROVAL_STATUS_LABELS,
} from "@/lib/labels";

export function ApprovalStatusBadge({ status }: { status: ApprovalStatus }) {
  return (
    <Badge className={APPROVAL_STATUS_BADGE_CLASSES[status]}>
      {APPROVAL_STATUS_LABELS[status]}
    </Badge>
  );
}