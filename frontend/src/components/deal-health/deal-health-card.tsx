import {
  Activity,
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  Lightbulb,
  ShieldCheck,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { formatPercent } from "@/lib/format";
import { DEAL_HEALTH_SEVERITY_BADGE_CLASSES } from "@/lib/labels";
import { DealHealthBadge } from "@/components/deal-health/deal-health-badge";
import type { DealHealthResult } from "@/lib/modules/deal-health/deal-health-types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function DealHealthCard({ health }: { health: DealHealthResult }) {
  const { score, level, factors, anomalies, recommendations, metrics } = health;

  return (
    <Card className="bg-white border-border">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Activity className="size-5 text-blue-600" />
            <CardTitle>Deal Health Intelligence</CardTitle>
          </div>
          <DealHealthBadge level={level} score={score} />
        </div>
        <CardDescription>
          Deterministic real-time operational evaluation across margin, governance, fulfillment,
          billing and customer negotiations.
        </CardDescription>
      </CardHeader>

      <CardContent className="flex flex-col gap-5 text-xs">
        {/* Top metrics summary grid */}
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-border bg-muted/20 p-3 sm:grid-cols-4">
          <div className="flex flex-col">
            <span className="text-muted-foreground text-[11px]">Margin Rate</span>
            <span
              className={cn("text-sm font-bold", {
                "text-emerald-700": metrics.marginRate >= 0.2,
                "text-amber-700": metrics.marginRate > 0 && metrics.marginRate < 0.2,
                "text-red-700": metrics.marginRate <= 0,
              })}
            >
              {formatPercent(Math.round(metrics.marginRate * 100))}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-muted-foreground text-[11px]">Discount Risk</span>
            <span className="text-sm font-semibold text-foreground">
              {metrics.riskScore} / 100
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-muted-foreground text-[11px]">Backorder Units</span>
            <span
              className={cn("text-sm font-semibold", {
                "text-red-700 font-bold": metrics.activeBackorderUnits > 0,
                "text-foreground": metrics.activeBackorderUnits === 0,
              })}
            >
              {metrics.activeBackorderUnits}
            </span>
          </div>

          <div className="flex flex-col">
            <span className="text-muted-foreground text-[11px]">Overdue Invoices</span>
            <span
              className={cn("text-sm font-semibold", {
                "text-red-700 font-bold": metrics.overdueInvoicesCount > 0,
                "text-foreground": metrics.overdueInvoicesCount === 0,
              })}
            >
              {metrics.overdueInvoicesCount}
            </span>
          </div>
        </div>

        {/* Anomalies and Alerts */}
        {anomalies.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <AlertOctagon className="size-4 text-red-600" />
              <span>Detected Operational Anomalies ({anomalies.length})</span>
            </div>
            <div className="flex flex-col gap-2">
              {anomalies.map((anomaly) => (
                <div
                  key={anomaly.id}
                  className={cn(
                    "flex flex-col gap-1 rounded-md border p-3",
                    anomaly.severity === "CRITICAL"
                      ? "border-red-200 bg-red-50/50"
                      : anomaly.severity === "HIGH"
                      ? "border-amber-200 bg-amber-50/50"
                      : "border-border bg-muted/20"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 font-semibold text-foreground">
                      <AlertTriangle
                        className={cn("size-3.5", {
                          "text-red-600": anomaly.severity === "CRITICAL",
                          "text-amber-600": anomaly.severity === "HIGH",
                          "text-slate-600": anomaly.severity === "MEDIUM" || anomaly.severity === "LOW",
                        })}
                      />
                      <span>{anomaly.title}</span>
                    </div>
                    <Badge className={DEAL_HEALTH_SEVERITY_BADGE_CLASSES[anomaly.severity]}>
                      {anomaly.severity}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground text-[11px]">{anomaly.description}</p>
                  <div className="mt-1 border-t border-border/60 pt-1 text-[11px] font-medium text-blue-900">
                    <span className="font-semibold">Action: </span>
                    {anomaly.suggestedAction}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Actionable Recommendations */}
        {recommendations.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-1.5 font-semibold text-foreground">
              <Lightbulb className="size-4 text-amber-600" />
              <span>Actionable Recommendations</span>
            </div>
            <ul className="flex flex-col gap-1.5 rounded-md border border-border bg-slate-50/50 p-3">
              {recommendations.map((rec) => (
                <li key={rec.id} className="flex items-start gap-2">
                  <span className="mt-0.5 size-1.5 shrink-0 rounded-full bg-blue-600" />
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{rec.action}</span>
                    <span className="text-[11px] text-muted-foreground">{rec.reason}</span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Evaluated Factors Breakdown */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-1.5 font-semibold text-foreground">
            <ShieldCheck className="size-4 text-slate-600" />
            <span>Score Factors Breakdown</span>
          </div>
          <div className="flex flex-col gap-1.5 rounded-md border border-border divide-y divide-border">
            {factors.map((factor) => (
              <div
                key={factor.id}
                className="flex items-start justify-between p-2.5 text-[11px]"
              >
                <div className="flex items-start gap-2">
                  {factor.severity === "POSITIVE" ? (
                    <CheckCircle2 className="mt-0.5 size-3.5 text-emerald-600 shrink-0" />
                  ) : factor.severity === "CRITICAL" ? (
                    <AlertOctagon className="mt-0.5 size-3.5 text-red-600 shrink-0" />
                  ) : factor.severity === "WARNING" ? (
                    <AlertTriangle className="mt-0.5 size-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <HelpCircle className="mt-0.5 size-3.5 text-blue-600 shrink-0" />
                  )}
                  <div className="flex flex-col">
                    <span className="font-medium text-foreground">{factor.title}</span>
                    <span className="text-muted-foreground">{factor.description}</span>
                  </div>
                </div>
                <span
                  className={cn("shrink-0 font-semibold tabular-nums ml-2", {
                    "text-emerald-700": factor.impact === 0,
                    "text-amber-700": factor.impact < 0 && factor.impact >= -10,
                    "text-red-700": factor.impact < -10,
                  })}
                >
                  {factor.impact === 0 ? "+0" : `${factor.impact}`}
                </span>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
