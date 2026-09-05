import {
  ArrowRight,
  Building2,
  Boxes,
  CalendarClock,
  FileText,
  Layers,
  ListChecks,
  Package,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

import { requireAreaAccess } from "@/lib/auth-guards";
import { getPlatformStats } from "@/lib/modules/platform/platform-service";
import { roleLabel } from "@/lib/roles";
import { getNavForRole } from "@/lib/navigation";
import { NAV_ICONS } from "@/lib/nav-icons";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function DashboardPage() {
  const user = await requireAreaAccess("dashboard");
  const stats = await getPlatformStats();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const quickSections = getNavForRole(user.role)
    .filter((section) => section.title !== "Overview")
    .flatMap((section) => section.items);

  return (
    <>
      <PageHeader
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={today}
      >
        <Badge className="bg-white">{roleLabel(user.role)}</Badge>
      </PageHeader>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Customers"
          value={stats.customerCount}
          icon={Building2}
          hint="B2B accounts in CRM"
        />
        <StatCard
          title="Products"
          value={stats.productCount}
          icon={Package}
          hint="Catalog entries"
        />
        <StatCard
          title="Warehouses"
          value={stats.warehouseCount}
          icon={Layers}
          hint="Fulfillment locations"
        />
        <StatCard
          title="Subscription plans"
          value={stats.subscriptionPlanCount}
          icon={CalendarClock}
          hint="Recurring price points"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Operational Pipeline</CardTitle>
            <CardDescription>
              DealFlow360 end-to-end commercial operations: pricing, discount governance, fulfillment, and risk intelligence.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {[
              {
                title: "Quotations",
                description: "Sales quotes, dynamic pricing, and customer proposals.",
                count: stats.quotationCount,
                countLabel: "total quotes",
                href: "/quotations",
                icon: FileText,
                badgeText: "Active Pipeline",
                badgeClass: "border-blue-200 bg-blue-50 text-blue-800",
              },
              {
                title: "Approvals",
                description: "Tiered discount risk governance and sign-off queue.",
                count: stats.pendingApprovalCount,
                countLabel: "pending",
                href: "/approvals",
                icon: ListChecks,
                badgeText: stats.pendingApprovalCount > 0 ? "Action Required" : "Up to date",
                badgeClass: stats.pendingApprovalCount > 0 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-emerald-200 bg-emerald-50 text-emerald-800",
              },
              {
                title: "Fulfillment",
                description: "Multi-warehouse allocation and backorder management.",
                count: stats.fulfillmentCount,
                countLabel: "active orders",
                href: "/fulfillment",
                icon: Boxes,
                badgeText: "Operational",
                badgeClass: "border-slate-200 bg-slate-50 text-slate-800",
              },
              {
                title: "Deal Health Intelligence",
                description: "0–100 risk scoring and operational anomaly alerts.",
                count: stats.quotationCount,
                countLabel: "evaluated deals",
                href: "/deal-health",
                icon: Sparkles,
                badgeText: "Deterministic",
                badgeClass: "border-indigo-200 bg-indigo-50 text-indigo-800",
              },
            ].map((module) => (
              <Link
                key={module.title}
                href={module.href}
                className="group flex items-start justify-between rounded-lg border border-border bg-background p-4 transition-all hover:border-blue-300 hover:shadow-xs"
              >
                <div className="flex items-start gap-3">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted transition-colors group-hover:bg-blue-100 group-hover:text-blue-700">
                    <module.icon className="size-4 text-muted-foreground group-hover:text-blue-700" aria-hidden />
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground group-hover:text-blue-700">{module.title}</p>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                      {module.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-medium ${module.badgeClass}`}>
                        {module.badgeText}
                      </span>
                      <span className="text-[11px] text-muted-foreground tabular-nums">
                        {module.count} {module.countLabel}
                      </span>
                    </div>
                  </div>
                </div>
                <ArrowRight className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 group-hover:text-blue-700" aria-hidden />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card className="bg-white">
          <CardHeader>
            <CardTitle className="text-sm">Quick actions</CardTitle>
            <CardDescription>Navigate to the areas you can access.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            {quickSections.map((item) => {
              const Icon = NAV_ICONS[item.icon];
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="group flex items-center justify-between rounded-md px-2 py-2 text-sm text-foreground/80 transition-colors hover:bg-muted"
                >
                  <span className="flex items-center gap-2.5">
                    <Icon className="size-4 text-muted-foreground" aria-hidden />
                    {item.title}
                  </span>
                  <ArrowRight
                    className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100"
                    aria-hidden
                  />
                </Link>
              );
            })}
            {quickSections.length === 0 && (
              <p className="px-2 py-2 text-sm text-muted-foreground">
                No additional areas available.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {user.role === "CUSTOMER" && (
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between rounded-lg border border-blue-200 bg-blue-50/50 px-5 py-4 text-sm text-blue-900">
          <div>
            <p className="font-semibold">Welcome to your Customer Portal</p>
            <p className="text-xs text-blue-700">
              Review quotations, collaborate on commercial terms, and submit negotiation requests directly to your sales team.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/portal">View My Quotations</Link>
          </Button>
        </div>
      )}
    </>
  );
}