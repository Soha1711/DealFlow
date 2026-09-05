import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { PageHeader } from "@/components/layout/page-header";
import { DealHealthMetrics } from "@/components/deal-health/deal-health-metrics";
import { DealHealthTable } from "@/components/deal-health/deal-health-table";
import { listPortfolioDealHealth } from "@/lib/modules/deal-health/deal-health-service";
import { listDealHealthQuerySchema } from "@/lib/modules/deal-health/deal-health-validation";

export const metadata: Metadata = {
  title: "Deal Health Intelligence",
  description: "Deterministic operational risk scoring, anomaly detection, and pipeline health.",
};

export default async function DealHealthPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    pageSize?: string;
    q?: string;
    level?: string;
    salesRepId?: string;
  }>;
}) {
  const user = await requireAreaAccess("deal-health");
  const rawParams = await searchParams;

  const parsed = listDealHealthQuerySchema.parse({
    page: rawParams.page,
    pageSize: rawParams.pageSize,
    q: rawParams.q,
    level: rawParams.level,
    salesRepId: rawParams.salesRepId,
  });

  const { items, pagination, summary } = await listPortfolioDealHealth(
    { role: user.role, userId: user.id },
    parsed
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Deal Health Intelligence"
        description="Real-time operational health, margin governance, fulfillment alerts, and payment risks across your active deal pipeline."
      />

      <DealHealthMetrics summary={summary} />

      <DealHealthTable
        items={items}
        pagination={pagination}
        currentLevel={parsed.level ?? "ALL"}
        search={parsed.q ?? ""}
      />
    </div>
  );
}