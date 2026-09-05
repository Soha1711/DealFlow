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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const futureModules = [
  {
    title: "Quotation pipeline",
    description: "Quotation creation, line items and proposal lifecycle.",
    icon: FileText,
  },
  {
    title: "Approval queue",
    description: "Discount governance and escalation workflows.",
    icon: ListChecks,
  },
  {
    title: "Fulfillment status",
    description: "Warehouse allocation and delivery tracking.",
    icon: Boxes,
  },
  {
    title: "Deal health",
    description: "AI-assisted deal scoring and negotiation signals.",
    icon: Sparkles,
  },
];

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
            <CardTitle className="text-sm">Foundations ready</CardTitle>
            <CardDescription>
              Phase 1 configures identity, catalog and fulfilment primitives. No
              business logic exists yet for the modules below.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {futureModules.map((module) => (
              <div
                key={module.title}
                className="flex items-start gap-3 rounded-lg border border-border bg-background p-4"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-muted">
                  <module.icon className="size-4 text-muted-foreground" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-medium text-foreground">{module.title}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                    {module.description}
                  </p>
                  <span className="mt-2 inline-flex rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    Planned for a later phase
                  </span>
                </div>
              </div>
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
        <div className="mt-6 rounded-lg border border-dashed border-border bg-white px-4 py-3 text-sm text-muted-foreground">
          Your customer portal — including quotation review and negotiation — lands
          in a later phase.
        </div>
      )}
    </>
  );
}