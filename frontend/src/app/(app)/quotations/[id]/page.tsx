import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight, FilePenLine } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { APPROVAL_LEVEL_LABELS } from "@/lib/labels";
import {
  canEditQuotation,
  canViewQuotation,
} from "@/lib/modules/quotations/guards";
import { getQuotation } from "@/lib/modules/quotations/quotation-service";
import { listApprovalsForQuotation } from "@/lib/modules/approvals/approval-service";
import { getFulfillmentForQuotation } from "@/lib/modules/fulfillment/fulfillment-service";
import { getBillingForQuotation } from "@/lib/modules/billing/billing-service";
import { canManageBilling } from "@/lib/modules/billing/billing-guards";
import { listNegotiationsForQuotation } from "@/lib/modules/negotiations/negotiation-service";
import { canSalesRepActOnNegotiation } from "@/lib/modules/negotiations/negotiation-guards";
import { getDealHealth } from "@/lib/modules/deal-health/deal-health-service";
import { DealHealthCard } from "@/components/deal-health/deal-health-card";
import { NegotiationPanel } from "@/components/quotations/negotiation-panel";
import { ApprovalStageList, buildApprovalStages } from "@/components/approvals/approval-stage-list";
import { RiskLevelBadge } from "@/components/approvals/risk-badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { InfoBanner } from "@/components/layout/info-banner";
import { PageHeader } from "@/components/layout/page-header";
import { RecommendationsPanel } from "@/components/recommendations/recommendations-panel";
import { QuotationStatusBadge } from "@/components/quotations/status-badge";
import { SubmitQuotationButton } from "@/components/quotations/submit-quotation-button";
import { FulfillmentStatusBadge } from "@/components/fulfillment/fulfillment-status-badge";
import { StartFulfillmentButton } from "@/components/fulfillment/start-fulfillment-button";
import { GenerateBillingButton } from "@/components/billing/generate-billing-button";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge";
import { SubscriptionStatusBadge } from "@/components/billing/subscription-status-badge";

export const metadata: Metadata = { title: "Quotation" };

export default async function QuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("quotations");
  const { id } = await params;

  const quotation = await getQuotation(id);
  if (!quotation) notFound();

  if (
    !canViewQuotation({
      role: user.role,
      userId: user.id,
      salesRepId: quotation.salesRepId,
      status: quotation.status,
    })
  ) {
    notFound();
  }

  const editable = canEditQuotation({
    role: user.role,
    userId: user.id,
    salesRepId: quotation.salesRepId,
    status: quotation.status,
  });

  const approvals = await listApprovalsForQuotation(quotation.id);
  const approverNames = new Map<string, string>();
  for (const approval of approvals) {
    if (approval.approver) {
      approverNames.set(approval.approver.id, approval.approver.name);
    }
  }
  const stages = buildApprovalStages(
    quotation.requiredApprovalLevel,
    approvals,
    Object.fromEntries(approverNames)
  );

  const fulfillment = await getFulfillmentForQuotation(quotation.id, {
    role: user.role,
    userId: user.id,
  }).catch(() => null);

  const billing = await getBillingForQuotation(quotation.id, {
    role: user.role,
    userId: user.id,
  }).catch(() => ({ invoices: [], subscriptions: [] }));
  const canBill = canManageBilling(user.role);
  const billableNow =
    quotation.status === "APPROVED" ||
    quotation.status === "CONFIRMED" ||
    quotation.status === "FULFILLING" ||
    quotation.status === "COMPLETED";
  const hasBilling =
    billing.invoices.length > 0 || billing.subscriptions.length > 0;

  const negotiations = await listNegotiationsForQuotation(quotation.id).catch(() => []);
  const canActNegotiation = canSalesRepActOnNegotiation({
    role: user.role,
    userId: user.id,
    salesRepId: quotation.salesRepId,
    quotationStatus: quotation.status,
  });

  const dealHealth = await getDealHealth(quotation.id, {
    role: user.role,
    userId: user.id,
  }).catch(() => null);

  return (
    <>
      <PageHeader
        title={quotation.quotationNumber}
        description={`Created ${formatDate(quotation.createdAt)}`}
      >
        <QuotationStatusBadge status={quotation.status} />
        {editable && (
          <>
            <Button asChild variant="outline">
              <Link href={`/quotations/${quotation.id}/edit`}>
                <FilePenLine className="size-4" aria-hidden />
                Edit
              </Link>
            </Button>
            <SubmitQuotationButton quotationId={quotation.id} />
          </>
        )}
      </PageHeader>

      {(quotation.status === "PENDING_APPROVAL" ||
        quotation.status === "PENDING_MANAGER" ||
        quotation.status === "PENDING_FINANCE") && (
        <div className="mb-6">
          <InfoBanner
            title={
              quotation.status === "PENDING_FINANCE"
                ? "Awaiting finance approval"
                : quotation.status === "PENDING_MANAGER"
                  ? "Awaiting manager approval"
                  : "Submitted for approval"
            }
            description="This quotation is under review and can no longer be edited."
          />
        </div>
      )}

      {quotation.status === "APPROVED" && quotation.requiredApprovalLevel === "NONE" && (
        <div className="mb-6">
          <InfoBanner
            title="Approved"
            description="Discounts are within product limits — no approval was required."
          />
        </div>
      )}

      {quotation.status === "DRAFT" && (
        <div className="mb-6">
          <RecommendationsPanel
            quotationId={quotation.id}
            canAdd={editable}
          />
        </div>
      )}

      {quotation.status === "UNDER_NEGOTIATION" && (
        <div className="mb-6">
          <InfoBanner
            title="Quotation Under Negotiation"
            description="The customer has submitted a change request. Review their proposal below to accept, counter, or decline."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="bg-white">
          <CardHeader>
            <CardTitle>Line items</CardTitle>
            <CardDescription>
              {quotation.lines.length} product{" "}
              {quotation.lines.length === 1 ? "line" : "lines"} on this
              quotation.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {quotation.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No line items on this quotation.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                      <TableHead className="text-right">Margin</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {quotation.lines.map((line) => (
                      <TableRow key={line.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="font-medium text-foreground">
                            {line.product.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {line.product.sku}
                          </p>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.discountPercent > 0 ? (
                            <span className="text-red-700">
                              {line.discountPercent}%{" "}
                              <span className="text-muted-foreground">
                                (−{formatCurrency(line.discountAmount)})
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(line.lineTotal)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-muted-foreground">
                          {formatCurrency(line.margin)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {(negotiations.length > 0 || quotation.status === "UNDER_NEGOTIATION") && (
          <NegotiationPanel
            quotationId={quotation.id}
            quotationStatus={quotation.status}
            negotiations={negotiations}
            lines={quotation.lines}
            canAct={canActNegotiation}
          />
        )}

        {dealHealth && <DealHealthCard health={dealHealth} />}
      </div>

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
                    {quotation.customer.name}
                  </dd>
                  <dd className="text-muted-foreground">
                    {quotation.customer.email}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Sales rep</dt>
                  <dd className="font-medium text-foreground">
                    {quotation.salesRep.name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Valid until</dt>
                  <dd className="font-medium text-foreground">
                    {quotation.validUntil
                      ? formatDate(quotation.validUntil)
                      : "No expiry"}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Totals</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(quotation.subtotal)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Discount</dt>
                  <dd className="tabular-nums text-red-700">
                    −{formatCurrency(quotation.discountTotal)}
                  </dd>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between font-medium">
                  <dt>Total</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(quotation.total)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Margin</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(quotation.margin)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          {fulfillment ? (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Fulfillment</CardTitle>
                <CardDescription>
                  Warehouse allocation progress for this quotation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between text-sm">
                  <dt className="text-muted-foreground">Status</dt>
                  <dd>
                    <FulfillmentStatusBadge status={fulfillment.status} />
                  </dd>
                </div>
                <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                  <Link href={`/fulfillment/${fulfillment.id}`}>
                    View fulfillment
                    <ArrowUpRight className="size-4" aria-hidden />
                  </Link>
                </Button>
              </CardContent>
            </Card>
          ) : (quotation.status === "APPROVED" || quotation.status === "CONFIRMED") &&
            (user.role === "ADMIN" || user.role === "OPERATIONS") ? (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Fulfillment</CardTitle>
                <CardDescription>
                  This quotation has been approved/confirmed and is ready to be fulfilled.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <StartFulfillmentButton quotationId={quotation.id} />
              </CardContent>
            </Card>
          ) : null}

          {hasBilling && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>
                  Invoices and subscriptions generated from this quotation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col gap-3">
                  {billing.invoices.map((invoice) => (
                    <div
                      key={invoice.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 flex-col">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto justify-start p-0 text-blue-700"
                        >
                          <Link href={`/billing/invoices/${invoice.id}`}>
                            {invoice.invoiceNumber}
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          </Link>
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {invoice.type === "ONE_TIME"
                            ? "One-time"
                            : "Recurring"}
                          {" · "}
                          {formatCurrency(invoice.total)}
                        </span>
                      </div>
                      <InvoiceStatusBadge status={invoice.status} />
                    </div>
                  ))}
                  {billing.subscriptions.map((subscription) => (
                    <div
                      key={subscription.id}
                      className="flex items-center justify-between gap-3 text-sm"
                    >
                      <div className="flex min-w-0 flex-col">
                        <Button
                          asChild
                          variant="link"
                          className="h-auto justify-start p-0 text-blue-700"
                        >
                          <Link
                            href={`/billing/subscriptions/${subscription.id}`}
                          >
                            {subscription.product.name}
                            <ArrowUpRight className="size-3.5" aria-hidden />
                          </Link>
                        </Button>
                        <span className="text-xs text-muted-foreground">
                          {formatCurrency(subscription.recurringAmount)}
                          {" · "}
                          {subscription.subscriptionPlan?.billingInterval ??
                            "subscription"}
                        </span>
                      </div>
                      <SubscriptionStatusBadge status={subscription.status} />
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {!hasBilling && canBill && billableNow && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Billing</CardTitle>
                <CardDescription>
                  Generate one-time invoices and subscriptions from this
                  finalized quotation.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <GenerateBillingButton quotationId={quotation.id} />
              </CardContent>
            </Card>
          )}

          {(quotation.riskScore !== null || quotation.riskLevel !== null) && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Discount risk</CardTitle>
                <CardDescription>
                  Deterministic score computed at submission.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="flex flex-col gap-3 text-sm">
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Risk level</dt>
                    <dd>
                      <RiskLevelBadge level={quotation.riskLevel} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Risk score</dt>
                    <dd className="font-medium tabular-nums">
                      {quotation.riskScore ?? "—"}
                      <span className="text-muted-foreground"> / 100</span>
                    </dd>
                  </div>
                  {quotation.requiredApprovalLevel && (
                    <div className="flex items-center justify-between">
                      <dt className="text-muted-foreground">
                        Required approval
                      </dt>
                      <dd className="font-medium">
                        {APPROVAL_LEVEL_LABELS[quotation.requiredApprovalLevel]}
                      </dd>
                    </div>
                  )}
                </dl>
                {stages.length > 0 && (
                  <Separator className="my-3" />
                )}
                {stages.length > 0 && (
                  <ApprovalStageList stages={stages} />
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}