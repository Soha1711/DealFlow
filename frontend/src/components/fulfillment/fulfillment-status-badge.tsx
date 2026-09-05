import type {
  FulfillmentAllocationStatus,
  FulfillmentLineStatus,
  FulfillmentStatus,
} from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  FULFILLMENT_ALLOCATION_STATUS_BADGE_CLASSES,
  FULFILLMENT_ALLOCATION_STATUS_LABELS,
  FULFILLMENT_LINE_STATUS_BADGE_CLASSES,
  FULFILLMENT_LINE_STATUS_LABELS,
  FULFILLMENT_STATUS_BADGE_CLASSES,
  FULFILLMENT_STATUS_LABELS,
} from "@/lib/labels";

export function FulfillmentStatusBadge({ status }: { status: FulfillmentStatus }) {
  return (
    <Badge className={FULFILLMENT_STATUS_BADGE_CLASSES[status]}>
      {FULFILLMENT_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FulfillmentLineStatusBadge({
  status,
}: {
  status: FulfillmentLineStatus;
}) {
  return (
    <Badge className={FULFILLMENT_LINE_STATUS_BADGE_CLASSES[status]}>
      {FULFILLMENT_LINE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FulfillmentAllocationStatusBadge({
  status,
}: {
  status: FulfillmentAllocationStatus;
}) {
  return (
    <Badge className={FULFILLMENT_ALLOCATION_STATUS_BADGE_CLASSES[status]}>
      {FULFILLMENT_ALLOCATION_STATUS_LABELS[status]}
    </Badge>
  );
}