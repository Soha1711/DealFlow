import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { canManageBilling } from "@/lib/modules/billing/billing-guards";
import { listBillableQuotations } from "@/lib/modules/billing/billing-service";
import { listInvoices } from "@/lib/modules/billing/invoice-service";
import { listBillingQuerySchema } from "@/lib/modules/billing/billing-validation";
import { INVOICE_TYPE_LABELS } from "@/lib/labels";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { BillingTabs } from "@/components/billing/billing-tabs";
import { BillingPagination } from "@/components/billing/billing-pagination";
import { InvoiceStatusBadge } from "@/components/billing/invoice-status-badge";
import { GenerateBillingButton } from "@/components/billing/generate-billing-button";

export const metadata: Metadata = { title: "Billing" };

export default async function BillingPage({
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

  let result: Awaited<ReturnType<typeof listInvoices>>;
  let billable: Awaited<ReturnType<typeof listBillableQuotations>> = [];
  try {
    result = await listInvoices(
      { role: user.role, userId: user.id },
      {
        page: query.page,
        pageSize: query.pageSize,
        q: query.q,
        status: query.status,
        type: query.type,
      }
    );
    if (canManageBilling(user.role)) {
      billable = await listBillableQuotations({ role: user.role, userId: user.id });
    }
  } catch {
    return (
      <>
        <PageHeader
          title="Billing"
          description="Invoices, payments and subscription billing."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load billing</AlertTitle>
          <AlertDescription>
            The billing dashboard could not be loaded. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data, pagination } = result;

  return (
    <>
      <PageHeader
        title="Billing"
        description="Invoices, payments and subscription billing for delivered business."
      />
      <BillingTabs active="invoices" />

      {canManageBilling(user.role) && (
        <Card className="mb-6 bg-white">
          <CardHeader>
            <CardTitle>Approved quotations ready to bill</CardTitle>
          </CardHeader>
          <CardContent>
            {billable.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No approved quotations are waiting to be billed.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Quotation</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Sales rep</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">Approved</TableHead>
                      <TableHead className="text-right">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {billable.map((quotation) => (
                      <TableRow key={quotation.id} className="hover:bg-muted/30">
                        <TableCell>
                          <Link
                            href={`/quotations/${quotation.id}`}
                            className="font-medium text-blue-700 hover:underline"
                          >
                            {quotation.quotationNumber}
                          </Link>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {quotation.customer.name}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {quotation.salesRep.name}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatCurrency(quotation.total)}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {formatDate(quotation.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <GenerateBillingButton quotationId={quotation.id} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No invoices yet"
          description="Generate billing from an approved quotation to create invoices and subscriptions."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Invoice</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Paid</TableHead>
                <TableHead>Issue date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((invoice) => (
                <TableRow key={invoice.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link
                      href={`/billing/invoices/${invoice.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {invoice.invoiceNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.customer.name}
                  </TableCell>
                  <TableCell>
                    <Badge variant={invoice.type === "RECURRING" ? "secondary" : "outline"}>
                      {INVOICE_TYPE_LABELS[invoice.type]}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <InvoiceStatusBadge status={invoice.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(invoice.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(invoice.paidAmount)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {invoice.issueDate ? formatDate(invoice.issueDate) : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <BillingPagination
            basePath="/billing"
            page={pagination.page}
            totalPages={pagination.totalPages}
            params={{ q: query.q, status: query.status, type: query.type }}
          />
        </div>
      )}
    </>
  );
} 