import type { Metadata } from "next";
import {
  Building2,
  CalendarClock,
  Layers,
  Package,
  PackagePlus,
  Percent,
  Users,
  Warehouse as WarehouseIcon,
} from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { getPlatformStats } from "@/lib/modules/platform/platform-service";
import { PageHeader } from "@/components/layout/page-header";
import { StatCard } from "@/components/layout/stat-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import Link from "next/link";

export const metadata: Metadata = { title: "Administration" };

const adminAreas = [
  {
    title: "Products",
    description: "Catalog, pricing, cost and discount ceilings.",
    href: "/admin/products",
    icon: Package,
  },
  {
    title: "Customers",
    description: "B2B accounts, tiers and relationship data.",
    href: "/admin/customers",
    icon: Users,
  },
  {
    title: "Discount Rules",
    description: "Discount governance tiers and approval levels.",
    href: "/admin/discounts",
    icon: Percent,
  },
  {
    title: "Warehouses",
    description: "Fulfillment locations and inventory levels.",
    href: "/admin/warehouses",
    icon: WarehouseIcon,
  },
  {
    title: "Subscription Plans",
    description: "Recurring price points and billing intervals.",
    href: "/admin/subscriptions",
    icon: CalendarClock,
  },
];

export default async function AdminPage() {
  await requireAreaAccess("admin");
  const stats = await getPlatformStats();

  return (
    <>
      <PageHeader
        title="Administration"
        description="Foundation configuration for the DealFlow360 workspace."
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Customers"
          value={stats.customerCount}
          icon={Building2}
        />
        <StatCard title="Products" value={stats.productCount} icon={Package} />
        <StatCard title="Warehouses" value={stats.warehouseCount} icon={Layers} />
        <StatCard
          title="Subscription plans"
          value={stats.subscriptionPlanCount}
          icon={CalendarClock}
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {adminAreas.map((area) => (
          <Link key={area.href} href={area.href} className="group">
            <Card className="h-full bg-white transition-colors group-hover:border-blue-200">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm">{area.title}</CardTitle>
                  <span className="flex size-8 items-center justify-center rounded-md bg-muted">
                    <area.icon className="size-4 text-muted-foreground" aria-hidden />
                  </span>
                </div>
                <CardDescription>{area.description}</CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <span className="inline-flex items-center gap-1 text-xs font-medium text-blue-700">
                  <PackagePlus className="size-3.5" aria-hidden />
                  Manage {area.title.toLowerCase()}
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}