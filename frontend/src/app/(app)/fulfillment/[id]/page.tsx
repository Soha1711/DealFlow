import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";
import { getFulfillment } from "@/lib/modules/fulfillment/fulfillment-service";
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
import { FulfillmentActions } from "@/components/fulfillment/fulfillment-actions";
import {
  FulfillmentAllocationStatusBadge,
  FulfillmentLineStatusBadge,
  FulfillmentStatusBadge,
} from "@/components/fulfillment/fulfillment-status-badge";
import { QuotationStatusBadge } from "@/components/quotations/status-badge";

export const metadata: Metadata = { title: "Fulfillment" };

export default async function FulfillmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("fulfillment");
  const { id } = await params;

  const fulfillment = await getFulfillment(id, {
    role: user.role,
    userId: user.id,
  }).catch(() => null);
  if (!fulfillment) notFound();

  const quotation = fulfillment.quotation;
  const hasBackorders = fulfillment.lines.some(
    (line) => line.backorderQuantity > 0
  );

  return (
    <>
      <PageHeader
        title={quotation.quotationNumber}
        description={`Fulfillment created ${formatDate(fulfillment.createdAt)}`}
      >
        <FulfillmentStatusBadge status={fulfillment.status} />
        <QuotationStatusBadge status={quotation.status} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="bg-white lg:col-span-2">
          <CardHeader>
            <CardTitle>Products</CardTitle>
            <CardDescription>
              Quantities are read from the quotation — client values are never
              trusted.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fulfillment.lines.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No physical products on this quotation (recurring/service
                products are fulfilled outside the warehouse flow).
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">Requested</TableHead>
                      <TableHead className="text-right">Allocated</TableHead>
                      <TableHead className="text-right">Fulfilled</TableHead>
                      <TableHead className="text-right">Backorder</TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fulfillment.lines.map((line) => (
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
                          {line.requestedQuantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.allocatedQuantity}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {line.fulfilledQuantity}
                        </TableCell>
                        <TableCell
                          className={`text-right tabular-nums ${
                            line.backorderQuantity > 0
                              ? "text-red-700"
                              : "text-muted-foreground"
                          }`}
                        >
                          {line.backorderQuantity}
                        </TableCell>
                        <TableCell>
                          <FulfillmentLineStatusBadge status={line.status} />
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
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Quotation status</dt>
                  <dd>
                    <QuotationStatusBadge status={quotation.status} />
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Created</dt>
                  <dd className="tabular-nums">
                    {formatDate(fulfillment.createdAt)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>

          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Operations</CardTitle>
              <CardDescription>
                Allocation is deterministic and concurrency-safe.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <FulfillmentActions
                fulfillmentId={fulfillment.id}
                status={fulfillment.status}
                hasBackorders={hasBackorders}
              />
            </CardContent>
          </Card>

          <Button asChild variant="outline" className="w-full">
            <Link href={`/quotations/${quotation.id}`}>
              View quotation
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>

      {fulfillment.lines.length > 0 && (
        <Card className="mt-6 bg-white">
          <CardHeader>
            <CardTitle>Warehouse allocation</CardTitle>
            <CardDescription>
              Per-warehouse splits with the reservation ledger backing each
              line.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {fulfillment.lines.every((line) => line.allocations.length === 0) ? (
              <p className="text-sm text-muted-foreground">
                Nothing allocated yet — run Allocate to reserve stock.
              </p>
            ) : (
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader className="bg-muted/50">
                    <TableRow className="hover:bg-muted/50">
                      <TableHead>Warehouse</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead className="text-right">
                        Allocated quantity
                      </TableHead>
                      <TableHead>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fulfillment.lines.flatMap((line) =>
                      line.allocations.map((allocation) => (
                        <TableRow
                          key={allocation.id}
                          className="hover:bg-muted/30"
                        >
                          <TableCell className="font-medium text-foreground">
                            {allocation.inventory.warehouse.name}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {line.product.name}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {allocation.quantity}
                          </TableCell>
                          <TableCell>
                            <FulfillmentAllocationStatusBadge
                              status={allocation.status}
                            />
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}