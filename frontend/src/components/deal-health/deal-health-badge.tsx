import { cn } from "@/lib/utils";
import {
  DEAL_HEALTH_LEVEL_BADGE_CLASSES,
  DEAL_HEALTH_LEVEL_LABELS,
  type DealHealthLevel,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";

export function DealHealthBadge({
  level,
  score,
  className,
  showScore = true,
}: {
  level: DealHealthLevel;
  score?: number;
  className?: string;
  showScore?: boolean;
}) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1 font-medium tracking-tight",
        DEAL_HEALTH_LEVEL_BADGE_CLASSES[level],
        className
      )}
    >
      <span
        className={cn("size-1.5 rounded-full", {
          "bg-emerald-600": level === "HEALTHY",
          "bg-amber-600": level === "AT_RISK",
          "bg-red-600": level === "CRITICAL",
        })}
      />
      <span>{DEAL_HEALTH_LEVEL_LABELS[level]}</span>
      {showScore && score !== undefined && (
        <span className="font-semibold tabular-nums opacity-90">({score})</span>
      )}
    </Badge>
  );
}
