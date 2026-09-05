import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatDate } from "@/lib/format";
import { listFulfillments } from "@/lib/modules/fulfillment/fulfillment-service";
import { listFulfillmentsQuerySchema } from "@/lib/modules/fulfillment/validation";
import { db } from "@/lib/db";
import { listQuotations } from "@/lib/modules/quotations/quotation-service";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { EmptyState } from "@/components/layout/empty-state";
import { PageHeader } from "@/components/layout/page-header";
import { FulfillmentPagination } from "@/components/fulfillment/fulfillment-pagination";
import { FulfillmentStatusBadge } from "@/components/fulfillment/fulfillment-status-badge";
import { FulfillmentStatusFilter } from "@/components/fulfillment/fulfillment-status-filter";
import { StartFulfillmentButton } from "@/components/fulfillment/start-fulfillment-button";

export const metadata: Metadata = { title: "Fulfillment" };

export default async function FulfillmentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAreaAccess("fulfillment");

  const raw = await searchParams;
  const flattened = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsed = listFulfillmentsQuerySchema.safeParse(flattened);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };

  let result: Awaited<ReturnType<typeof listFulfillments>>;
  let awaiting: Awaited<ReturnType<typeof listQuotations>>["data"] = [];
  try {
    result = await listFulfillments(
      { role: user.role, userId: user.id },
      query
    );
    // Approved quotations with no active fulfillment, ready to be started.
    const approved = await listQuotations({
      role: user.role,
      userId: user.id,
      page: 1,
      pageSize: 100,
      status: "APPROVED",
    });
    if (approved.data.length > 0) {
      const active = await db.fulfillment.findMany({
        where: {
          quotationId: { in: approved.data.map((q) => q.id) },
          status: { not: "CANCELLED" },
        },
        select: { quotationId: true },
      });
      const activeIds = new Set(active.map((f) => f.quotationId));
      awaiting = approved.data.filter((q) => !activeIds.has(q.id));
    }
  } catch {
    return (
      <>
        <PageHeader
          title="Fulfillment"
          description="Allocate inventory across warehouses and manage deliveries."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load fulfillment</AlertTitle>
          <AlertDescription>
            The fulfillment queue could not be loaded. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data, pagination } = result;

  return (
    <>
      <PageHeader
        title="Fulfillment"
        description="Allocate inventory across warehouses and manage deliveries."
      >
        <FulfillmentStatusFilter status={query.status} />
      </PageHeader>

      {awaiting.length > 0 && (
        <div className="mb-6 overflow-hidden rounded-lg border border-border bg-white">
          <div className="border-b border-border bg-muted/50 px-4 py-3">
            <h2 className="text-sm font-medium text-foreground">
              Approved quotations awaiting fulfillment
            </h2>
          </div>
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-muted/50">
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales rep</TableHead>
                <TableHead>Total</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {awaiting.map((quotation) => (
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
                  <TableCell className="tabular-nums">
                    ${quotation.total.toNumber().toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </TableCell>
                  <TableCell className="text-right">
                    <StartFulfillmentButton quotationId={quotation.id} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No fulfillments"
          description="Fulfillments for approved quotations will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales rep</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Requested</TableHead>
                <TableHead className="text-right">Allocated</TableHead>
                <TableHead className="text-right">Backorder</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((fulfillment) => (
                <TableRow key={fulfillment.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link
                      href={`/fulfillment/${fulfillment.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {fulfillment.quotationNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fulfillment.customerName}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {fulfillment.salesRepName}
                  </TableCell>
                  <TableCell>
                    <FulfillmentStatusBadge status={fulfillment.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fulfillment.requestedQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {fulfillment.allocatedQuantity}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">
                    {fulfillment.backorderQuantity}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(fulfillment.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <FulfillmentPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            status={query.status}
          />
        </div>
      )}
    </>
  );
}