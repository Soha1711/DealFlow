import type { SubscriptionStatus } from "@prisma/client";

import { cn } from "cn";
import {
  SUBSCRIPTION_STATUS_BADGE_CLASSES,
  SUBSCRIPTION_STATUS_LABELS,
} from "@/lib/labels";

export function SubscriptionStatusBadge({ status }: { status: SubscriptionStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        SUBSCRIPTION_STATUS_BADGE_CLASSES[status]
      )}
    >
      {SUBSCRIPTION_STATUS_LABELS[status]}
    </span>
  );
} 