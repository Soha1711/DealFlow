import type { Metadata } from "next";
import Link from "next/link";
import { FilePlus2, TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { listQuotations } from "@/lib/modules/quotations/quotation-service";
import { listQuotationsQuerySchema } from "@/lib/modules/quotations/validation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { QuotationFilters } from "@/components/quotations/quotation-filters";
import { QuotationPagination } from "@/components/quotations/quotation-pagination";
import { QuotationStatusBadge } from "@/components/quotations/status-badge";

export const metadata: Metadata = { title: "Quotations" };

export default async function QuotationsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAreaAccess("quotations");

  const raw = await searchParams;
  const flattened = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsed = listQuotationsQuerySchema.safeParse(flattened);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };

  let result: Awaited<ReturnType<typeof listQuotations>>;
  try {
    result = await listQuotations({
      role: user.role,
      userId: user.id,
      page: query.page,
      pageSize: query.pageSize,
      search: query.q,
      status: query.status,
    });
  } catch {
    return (
      <>
        <PageHeader
          title="Quotations"
          description="Create, price and manage customer quotations."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load quotations</AlertTitle>
          <AlertDescription>
            The quotation list could not be loaded. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data, pagination } = result;
  const hasFilters = Boolean(query.q) || Boolean(query.status);

  return (
    <>
      <PageHeader
        title="Quotations"
        description="Create, price and manage customer quotations."
      >
        <Button asChild>
          <Link href="/quotations/new">
            <FilePlus2 className="size-4" aria-hidden />
            New quotation
          </Link>
        </Button>
      </PageHeader>

      <div className="mb-4">
        <QuotationFilters search={query.q} status={query.status} />
      </div>

      {data.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No matching quotations"
            description="Try adjusting your search or status filter."
          />
        ) : (
          <EmptyState
            title="No quotations yet"
            description="Create your first quotation to start pricing deals."
          />
        )
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Number</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales rep</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Subtotal</TableHead>
                <TableHead className="text-right">Discount</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead className="text-right">Margin</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((quotation) => (
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
                  <TableCell>
                    <QuotationStatusBadge status={quotation.status} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(quotation.subtotal)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-red-700">
                    −{formatCurrency(quotation.discountTotal)}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(quotation.total)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(quotation.margin)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(quotation.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <QuotationPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            search={query.q}
            status={query.status}
          />
        </div>
      )}
    </>
  );
}