import type { QuotationStatus } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  QUOTATION_STATUS_BADGE_CLASSES,
  QUOTATION_STATUS_LABELS,
} from "@/lib/labels";

export function QuotationStatusBadge({
  status,
}: {
  status: QuotationStatus;
}) {
  return (
    <Badge className={QUOTATION_STATUS_BADGE_CLASSES[status]}>
      {QUOTATION_STATUS_LABELS[status]}
    </Badge>
  );
}