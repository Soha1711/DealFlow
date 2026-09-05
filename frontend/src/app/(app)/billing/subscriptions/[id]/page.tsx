import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { BILLING_INTERVAL_LABELS } from "@/lib/labels";
import { canManageBilling } from "@/lib/modules/billing/billing-guards";
import { getSubscription } from "@/lib/modules/billing/subscription-service";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PageHeader } from "@/components/layout/page-header";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { BillingScheduleStatusBadge } from "@/components/billing/billing-schedule-status-badge";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";
import { BillSubscriptionButton } from "@/components/billing/bill-subscription-button";

export const metadata: Metadata = { title: "Subscription" };

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("billing");
  const { id } = await params;

  const subscription = await getSubscription(id, {
    role: user.role,
    userId: user.id,
  });
  if (!subscription) notFound();

  const manage = canManageBilling(user.role);
  const intervalLabel =
    BILLING_INTERVAL_LABELS[
      subscription.subscriptionPlan?.billingInterval ?? subscription.billingInterval
    ];

  return (
    <>
      <PageHeader
        title={subscription.product.name}
        description={`Subscription · ${subscription.quotation.quotationNumber}`}
      >
        <SubscriptionStatusBadge status={subscription.status} />
      </PageHeader>
      <BillingTabs active="subscriptions" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle>Billing history</CardTitle>
            <CardDescription>
              Each schedule row represents one billing period and links to the
              invoice generated for it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {subscription.schedules.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No billing schedules have been generated yet.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Period</TableHead>
                      <TableHead>Due date</TableHead>
                      <TableHead className="text-right">Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Invoice</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subscription.schedules.map((schedule) => (
                      <TableRow key={schedule.id} className="hover:bg-muted/30">
                        <TableCell className="text-muted-foreground">
                          {formatDate(schedule.periodStart)} →{" "}
                          {formatDate(schedule.periodEnd)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(schedule.dueDate)}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(schedule.amount)}
                        </TableCell>
                        <TableCell>
                          <BillingScheduleStatusBadge status={schedule.status} />
                        </TableCell>
                        <TableCell>
                          {schedule.invoice ? (
                            <Button asChild variant="link" className="h-auto p-0 text-blue-700">
                              <Link href={`/billing/invoices/${schedule.invoice.id}`}>
                                {schedule.invoice.invoiceNumber}
                                <ArrowUpRight className="size-3.5" aria-hidden />
                              </Link>
                            </Button>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {manage && subscription.status === "ACTIVE" && (
              <div className="mt-4">
                <BillSubscriptionButton subscriptionId={subscription.id} />
              </div>
            )}
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">Customer</dt>
                  <dd className="font-medium text-foreground">
                    {subscription.customer.name}
                  </dd>
                  <dd className="text-muted-foreground">
                    {subscription.customer.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Plan</dt>
                  <dd className="font-medium text-foreground">
                    {subscription.subscriptionPlan?.name ?? "Custom"}
                    <span className="text-muted-foreground">
                      {" "}
                      · {intervalLabel}
                    </span>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-muted-foreground">
                    Recurring amount
                  </dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(subscription.recurringAmount)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Started</dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(subscription.startDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Next billing</dt>
                  <dd className="font-medium text-foreground">
                    {formatDate(subscription.nextBillingDate)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Quotation</dt>
                  <dd>
                    <Button asChild variant="link" className="h-auto p-0 text-blue-700">
                      <Link href={`/quotations/${subscription.quotation.id}`}>
                        {subscription.quotation.quotationNumber}
                        <ArrowUpRight className="size-3.5" aria-hidden />
                      </Link>
                    </Button>
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
} 