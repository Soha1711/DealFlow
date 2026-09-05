import type { InvoiceType } from "@prisma/client";

import { Badge } from "@/components/ui/badge";

export function InvoiceTypeBadge({ type }: { type: InvoiceType }) {
  return (
    <Badge variant={type === "RECURRING" ? "secondary" : "outline"}>
      {type === "ONE_TIME" ? "One-time" : "Recurring"}
    </Badge>
  );
} 