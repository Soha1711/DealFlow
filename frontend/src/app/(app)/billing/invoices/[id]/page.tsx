import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { canManageBilling } from "@/lib/modules/billing/billing-guards";
import { getInvoice } from "@/lib/modules/billing/invoice-service";
import {
  INVOICE_TYPE_LABELS,
  PAYMENT_STATUS_LABELS,
} from "@/lib/labels";
import { Badge } from "@/components/ui/badge";
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
import { PageHeader } from "@/components/layout/page-header";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge";
import { IssueInvoiceButton } from "@/components/billing/issue-invoice-button";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";

export const metadata: Metadata = { title: "Invoice" };

export default async function InvoiceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("billing");
  const { id } = await params;

  const invoice = await getInvoice(id, { role: user.role, userId: user.id });
  if (!invoice) notFound();

  const manage = canManageBilling(user.role);
  const balance = Number(invoice.total) - Number(invoice.paidAmount);
  const canRecordPayment =
    manage &&
    ["ISSUED", "PARTIALLY_PAID", "OVERDUE"].includes(invoice.status) &&
    balance > 0;

  return (
    <>
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${INVOICE_TYPE_LABELS[invoice.type]} · Created ${formatDate(invoice.createdAt)}`}
      >
        <InvoiceStatusBadge status={invoice.status} />
      </PageHeader>
      <BillingTabs active="invoices" />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle>Invoice lines</CardTitle>
            <CardDescription>
              Amounts are snapshotted from the finalized quotation and never
              change.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {invoice.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No line items on this invoice.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Description</TableHead>
                      <TableHead className="text-right">Qty</TableHead>
                      <TableHead className="text-right">Unit price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Line total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoice.lines.map((line) => (
                      <TableRow key={line.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="font-medium text-foreground">
                            {line.description}
                          </p>
                          {line.isRecurring && (
                            <p className="text-xs text-muted-foreground">
                              Recurring charge
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.quantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatCurrency(line.unitPrice)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums text-red-700">
                          {line.discountAmount.gt(0)
                            ? `−${formatCurrency(line.discountAmount)}`
                            : "—"}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(line.lineTotal)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <dl className="mt-4 flex flex-col gap-2 text-sm">
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular-nums">{formatCurrency(invoice.subtotal)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Discount</dt>
                <dd className="tabular-nums text-red-700">
                  −{formatCurrency(invoice.discountTotal)}
                </dd>
              </div>
              <Separator className="my-1" />
              <div className="flex items-center justify-between font-medium">
                <dt>Total</dt>
                <dd className="tabular-nums">{formatCurrency(invoice.total)}</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Paid</dt>
                <dd className="tabular-nums text-emerald-700">
                  {formatCurrency(invoice.paidAmount)}
                </dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-muted-foreground">Balance</dt>
                <dd className="tabular-nums">
                  {formatCurrency(Math.max(0, balance))}
                </dd>
              </div>
            </dl>

            {invoice.status === "DRAFT" && manage && (
              <div className="mt-4">
                <IssueInvoiceButton invoiceId={invoice.id} />
              </div>
            )}

            {canRecordPayment && (
              <div className="mt-4">
                <RecordPaymentForm
                  invoiceId={invoice.id}
                  outstanding={balance}
                />
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
                    {invoice.customer.name}
                  </dd>
                  <dd className="text-muted-foreground">
                    {invoice.customer.email}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-xs text-muted-foreground">Type</dt>
                  <dd>
                    <Badge
                      variant={
                        invoice.type === "RECURRING" ? "secondary" : "outline"
                      }
                    >
                      {INVOICE_TYPE_LABELS[invoice.type]}
                    </Badge>
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Issue date</dt>
                  <dd className="font-medium text-foreground">
                    {invoice.issueDate ? formatDate(invoice.issueDate) : "Not issued"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Due date</dt>
                  <dd className="font-medium text-foreground">
                    {invoice.dueDate ? formatDate(invoice.dueDate) : "—"}
                  </dd>
                </div>
                {invoice.quotation && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Quotation</dt>
                    <dd>
                      <Button asChild variant="link" className="h-auto p-0 text-blue-700">
                        <Link href={`/quotations/${invoice.quotation.id}`}>
                          {invoice.quotation.quotationNumber}
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        </Link>
                      </Button>
                    </dd>
                  </div>
                )}
                {invoice.subscription && (
                  <div>
                    <dt className="text-xs text-muted-foreground">Subscription</dt>
                    <dd>
                      <Button asChild variant="link" className="h-auto p-0 text-blue-700">
                        <Link href={`/billing/subscriptions/${invoice.subscription.id}`}>
                          {invoice.subscription.product.name}
                          <ArrowUpRight className="size-3.5" aria-hidden />
                        </Link>
                      </Button>
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Payments</CardTitle>
              <CardDescription>
                {invoice.payments.length} recorded
                {invoice.payments.length === 1 ? " payment" : " payments"}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {invoice.payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No payments recorded yet.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-muted/50">
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoice.payments.map((payment) => (
                        <TableRow key={payment.id} className="hover:bg-muted/30">
                          <TableCell className="text-muted-foreground">
                            {formatDate(payment.createdAt)}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {payment.method ?? "—"}
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">
                              {PAYMENT_STATUS_LABELS[payment.status]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatCurrency(payment.amount)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
} 