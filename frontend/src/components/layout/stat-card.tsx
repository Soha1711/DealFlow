import type { LucideIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function StatCard({
  title,
  value,
  icon: Icon,
  hint,
}: {
  title: string;
  value: string | number;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="bg-white">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="flex size-8 items-center justify-center rounded-md bg-muted">
          <Icon className="size-4 text-muted-foreground" aria-hidden />
        </span>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold tracking-tight text-foreground">
          {value}
        </p>
        {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
      </CardContent>
    </Card>
  );
}