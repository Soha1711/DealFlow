import type { BillingScheduleStatus } from "@prisma/client";

import { cn } from "cn";
import {
  BILLING_SCHEDULE_STATUS_BADGE_CLASSES,
  BILLING_SCHEDULE_STATUS_LABELS,
} from "@/lib/labels";

export function BillingScheduleStatusBadge({
  status,
}: {
  status: BillingScheduleStatus;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        BILLING_SCHEDULE_STATUS_BADGE_CLASSES[status]
      )}
    >
      {BILLING_SCHEDULE_STATUS_LABELS[status]}
    </span>
  );
} 