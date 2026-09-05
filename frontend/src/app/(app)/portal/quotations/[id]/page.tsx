import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Clock, Mail, User } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { getCustomerQuotation } from "@/lib/modules/negotiations/negotiation-service";
import { db } from "@/lib/db";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { AcceptQuoteButton } from "@/components/portal/accept-quote-button";
import { NegotiateDialog, type QuotationLineItem } from "@/components/portal/negotiate-dialog";
import { NegotiationTimeline, type NegotiationItem } from "@/components/portal/negotiation-timeline";

export const metadata: Metadata = { title: "Quotation Review · Customer Portal" };

export default async function CustomerQuotationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("portal");
  const { id } = await params;

  let customerId = user.customerId;
  if (!customerId && user.role === "ADMIN") {
    const firstCustomer = await db.customer.findFirst({ select: { id: true } });
    customerId = firstCustomer?.id ?? null;
  }

  if (!customerId) notFound();

  let quotation: Awaited<ReturnType<typeof getCustomerQuotation>>;
  try {
    quotation = await getCustomerQuotation(id, customerId);
  } catch {
    notFound();
  }

  const lines = quotation.lines ?? [];
  const negotiations = quotation.negotiations ?? [];

  const dialogLines: QuotationLineItem[] = lines.map((line) => ({
    id: line.id,
    productId: line.productId,
    quantity: line.quantity,
    unitPrice: line.unitPrice.toString(),
    discountPercent: Number(line.discountPercent),
    discountAmount: line.discountAmount.toString(),
    lineTotal: line.lineTotal.toString(),
    product: line.product
      ? {
          id: line.product.id,
          name: line.product.name,
          sku: line.product.sku,
          price: line.product.price.toString(),
        }
      : undefined,
  }));

  const timelineNegotiations: NegotiationItem[] = negotiations.map((item) => ({
    id: item.id,
    status: item.status,
    message: item.message,
    responseMessage: item.responseMessage,
    createdAt: item.createdAt.toISOString(),
    actedAt: item.actedAt ? item.actedAt.toISOString() : null,
    createdBy: item.createdBy
      ? { name: item.createdBy.name, email: item.createdBy.email }
      : undefined,
    actedBy: item.actedBy
      ? { name: item.actedBy.name, email: item.actedBy.email }
      : null,
    proposedChanges: item.proposedChanges ?? undefined,
  }));

  return (
    <>
      <PageHeader
        title={quotation.quotationNumber}
        description={`Issued to ${quotation.customer?.name} on ${formatDate(quotation.createdAt)}`}
        backHref="/portal"
        backLabel="Back to all quotations"
      >
        <div className="flex items-center gap-3">
          <QuotationStatusBadge status={quotation.status} />
          {quotation.status === "APPROVED" && (
            <>
              <NegotiateDialog quotationId={quotation.id} lines={dialogLines} />
              <AcceptQuoteButton quotationId={quotation.id} />
            </>
          )}
        </div>
      </PageHeader>

      {quotation.status === "UNDER_NEGOTIATION" && (
        <div className="mb-6">
          <InfoBanner
            title="Quotation is Under Negotiation"
            description="Your change request is currently under review by your sales representative. You will be notified when they update terms or respond."
          />
        </div>
      )}

      {quotation.status === "CONFIRMED" && (
        <div className="mb-6">
          <InfoBanner
            title="Quotation Confirmed"
            description="You have accepted this quotation. Our operations and billing teams are preparing your order."
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle>Line Items</CardTitle>
            <CardDescription>
              {lines.length} {lines.length === 1 ? "item" : "items"} included in this proposal.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">No line items on this quotation.</p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Quantity</TableHead>
                      <TableHead className="text-right">Unit Price</TableHead>
                      <TableHead className="text-right">Discount</TableHead>
                      <TableHead className="text-right">Line Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.map((line) => (
                      <TableRow key={line.id} className="hover:bg-muted/30">
                        <TableCell>
                          <p className="font-medium text-foreground">{line.product?.name}</p>
                          <p className="text-xs text-muted-foreground">{line.product?.sku}</p>
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
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="mt-6">
              <NegotiationTimeline
                negotiations={timelineNegotiations}
                customerId={customerId}
              />
            </div>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-6">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Summary</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="flex flex-col gap-2.5 text-sm">
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular-nums font-medium">
                    {formatCurrency(Number(quotation.subtotal))}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Discount Savings</dt>
                  <dd className="tabular-nums text-red-700 font-medium">
                    −{formatCurrency(Number(quotation.discountTotal))}
                  </dd>
                </div>
                <Separator className="my-1" />
                <div className="flex items-center justify-between text-base font-semibold">
                  <dt className="text-foreground">Total Proposal Value</dt>
                  <dd className="tabular-nums text-foreground">
                    {formatCurrency(Number(quotation.total))}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Sales Representative</CardTitle>
              <CardDescription>Direct point of contact for this deal</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex items-center gap-2">
                  <User className="size-4 text-muted-foreground" />
                  <span className="font-medium text-foreground">{quotation.salesRep?.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Mail className="size-4 text-muted-foreground" />
                  <span className="text-muted-foreground">{quotation.salesRep?.email}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">
                    Valid Until: {quotation.validUntil ? formatDate(quotation.validUntil) : "No expiry date"}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}
