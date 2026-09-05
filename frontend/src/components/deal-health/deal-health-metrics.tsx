import { Activity, AlertTriangle, CheckCircle2, ShieldAlert, TrendingUp } from "lucide-react";

import { formatCurrency } from "@/lib/format";
import type { DealHealthPortfolioSummary } from "@/lib/modules/deal-health/deal-health-types";
import { Card, CardContent } from "@/components/ui/card";

export function DealHealthMetrics({ summary }: { summary: DealHealthPortfolioSummary }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Average Health</span>
            <Activity className="size-4 text-blue-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-foreground">
              {summary.averageScore}
            </span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            Across {summary.totalDeals} active deal{summary.totalDeals === 1 ? "" : "s"}
          </p>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Healthy Deals</span>
            <CheckCircle2 className="size-4 text-emerald-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-emerald-700">
              {summary.healthyCount}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Score 75–100 (On track)</p>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">At-Risk Deals</span>
            <AlertTriangle className="size-4 text-amber-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-amber-700">
              {summary.atRiskCount}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Score 45–74 (Requires attention)</p>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Critical Deals</span>
            <ShieldAlert className="size-4 text-red-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold tracking-tight text-red-700">
              {summary.criticalCount}
            </span>
            {summary.criticalAlertsCount > 0 && (
              <span className="text-xs text-red-600 font-medium">
                ({summary.criticalAlertsCount} alerts)
              </span>
            )}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Score &lt; 45 (Immediate blocker)</p>
        </CardContent>
      </Card>

      <Card className="bg-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Portfolio Value</span>
            <TrendingUp className="size-4 text-slate-600" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-xl font-bold tracking-tight text-foreground truncate">
              {formatCurrency(summary.totalPortfolioValue)}
            </span>
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Total pipeline evaluated</p>
        </CardContent>
      </Card>
    </div>
  );
}
