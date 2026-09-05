import type { DiscountRiskLevel } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import {
  DISCOUNT_RISK_BADGE_CLASSES,
  DISCOUNT_RISK_LABELS,
} from "@/lib/labels";

export function RiskLevelBadge({
  level,
}: {
  level: DiscountRiskLevel | null;
}) {
  if (!level) {
    return <span className="text-xs text-muted-foreground">Not evaluated</span>;
  }
  return (
    <Badge className={DISCOUNT_RISK_BADGE_CLASSES[level]}>
      {DISCOUNT_RISK_LABELS[level]}
    </Badge>
  );
}