import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { BILLING_INTERVAL_LABELS } from "@/lib/labels";
import { listSubscriptions } from "@/lib/modules/billing/subscription-service";
import { listBillingQuerySchema } from "@/lib/modules/billing/billing-validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { BillingPagination } from "@/components/billing/billing-pagination";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";

export const metadata: Metadata = { title: "Subscriptions" };

export default async function SubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAreaAccess("billing");

  const raw = await searchParams;
  const flattened = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsed = listBillingQuerySchema.safeParse(flattened);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };

  let result: Awaited<ReturnType<typeof listSubscriptions>>;
  try {
    result = await listSubscriptions(
      { role: user.role, userId: user.id },
      {
        page: query.page,
        pageSize: query.pageSize,
        q: query.q,
        status: query.status,
      }
    );
  } catch {
    return (
      <>
        <PageHeader
          title="Subscriptions"
          description="Recurring billing for subscription products."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load subscriptions</AlertTitle>
          <AlertDescription>
            The subscription list could not be loaded. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data, pagination } = result;

  return (
    <>
      <PageHeader
        title="Subscriptions"
        description="Recurring billing for subscription products."
      />
      <BillingTabs active="subscriptions" />

      {data.length === 0 ? (
        <EmptyState
          title="No subscriptions yet"
          description="Subscriptions are created automatically when billing is generated for a quotation with recurring lines."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Product</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Quotation</TableHead>
                <TableHead>Interval</TableHead>
                <TableHead className="text-right">Recurring amount</TableHead>
                <TableHead>Next billing</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((subscription) => (
                <TableRow key={subscription.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link
                      href={`/billing/subscriptions/${subscription.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {subscription.product.name}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subscription.customer.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {subscription.quotation.quotationNumber}
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {BILLING_INTERVAL_LABELS[
                        subscription.subscriptionPlan?.billingInterval ??
                          subscription.billingInterval
                      ]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(subscription.recurringAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(subscription.nextBillingDate)}
                  </TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge status={subscription.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <BillingPagination
            basePath="/billing/subscriptions"
            page={pagination.page}
            totalPages={pagination.totalPages}
            params={{ q: query.q, status: query.status }}
          />
        </div>
      )}
    </>
  );
} 