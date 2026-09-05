import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listSubscriptionPlans } from "@/lib/modules/catalog/catalog-service";
import { BILLING_INTERVAL_LABELS } from "@/lib/labels";
import { formatCurrency } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin · Subscription Plans" };

export default async function AdminSubscriptionsPage() {
  await requireAreaAccess("admin-subscriptions");
  const plans = await listSubscriptionPlans();

  return (
    <>
      <PageHeader
        title="Subscription Plans"
        description="Recurring price points that subscription-capable products can attach to."
        backHref="/admin"
        backLabel="Back to administration"
      />

      {plans.length === 0 ? (
        <EmptyState description="No subscription plans have been seeded yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Plan</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead>Billing interval</TableHead>
                <TableHead className="text-right">Linked products</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {plans.map((plan) => (
                <TableRow key={plan.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">
                    {plan.name}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(plan.price)}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {BILLING_INTERVAL_LABELS[plan.billingInterval]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {plan._count.products}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}