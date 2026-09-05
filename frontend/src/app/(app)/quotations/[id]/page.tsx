import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePenLine } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  canEditQuotation,
  canViewQuotation,
} from "@/lib/modules/quotations/guards";
import { getQuotation } from "@/lib/modules/quotations/quotation-service";
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
import { QuotationStatusBadge } from "@/components/quotations/status-badge";
import { SubmitQuotationButton } from "@/components/quotations/submit-quotation-button";

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

      {quotation.status === "PENDING_APPROVAL" && (
        <div className="mb-6">
          <InfoBanner
            title="Submitted for approval"
            description="This quotation is pending review and can no longer be edited."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
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
        </div>
      </div>
    </>
  );
}