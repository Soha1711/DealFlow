import type { InvoiceStatus } from "@prisma/client";

import { cn } from "cn";
import {
  INVOICE_STATUS_BADGE_CLASSES,
  INVOICE_STATUS_LABELS,
} from "@/lib/labels";

export function InvoiceStatusBadge({ status }: { status: InvoiceStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        INVOICE_STATUS_BADGE_CLASSES[status]
      )}
    >
      {INVOICE_STATUS_LABELS[status]}
    </span>
  );
} 