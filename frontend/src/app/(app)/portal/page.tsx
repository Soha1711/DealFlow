import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Building2, MessageSquareQuote, TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { listCustomerQuotations } from "@/lib/modules/negotiations/negotiation-service";
import { listPortalQuotationsQuerySchema } from "@/lib/modules/negotiations/negotiation-validation";
import { db } from "@/lib/db";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { QuotationStatusBadge } from "@/components/quotations/status-badge";

export const metadata: Metadata = { title: "Customer Portal · Quotations" };

export default async function CustomerPortalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAreaAccess("portal");

  let customerId = user.customerId;
  if (!customerId && user.role === "ADMIN") {
    const firstCustomer = await db.customer.findFirst({ select: { id: true } });
    customerId = firstCustomer?.id ?? null;
  }

  if (!customerId) {
    return (
      <>
        <PageHeader
          title="Customer Portal"
          description="View and negotiate quotations for your organization."
        />
        <Alert>
          <Building2 className="size-4" aria-hidden />
          <AlertTitle>No Customer Account Linked</AlertTitle>
          <AlertDescription>
            Your user account is not currently linked to a customer company. Please
            contact your administrator.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const raw = await searchParams;
  const flattened = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsed = listPortalQuotationsQuerySchema.safeParse(flattened);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };

  let result: Awaited<ReturnType<typeof listCustomerQuotations>>;
  try {
    result = await listCustomerQuotations(customerId, query);
  } catch {
    return (
      <>
        <PageHeader
          title="Customer Portal"
          description="View and negotiate quotations for your organization."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load quotations</AlertTitle>
          <AlertDescription>
            Unable to load quotations right now. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data } = result;

  const counterOfferedQuotations = data.filter(
    (q) =>
      q.status === "UNDER_NEGOTIATION" &&
      q.negotiations?.[0]?.status === "COUNTERED"
  );

  return (
    <>
      <PageHeader
        title="My Quotations"
        description="Review proposals, negotiate terms with your sales representative, and accept quotations."
      >
        <Badge variant="outline" className="bg-white">
          Customer Portal
        </Badge>
      </PageHeader>

      {counterOfferedQuotations.length > 0 && (
        <div className="mb-6">
          <Alert className="border-amber-300 bg-amber-50 text-amber-900 shadow-2xs">
            <MessageSquareQuote className="size-4 text-amber-600" />
            <AlertTitle className="font-semibold text-amber-950">
              Counter-Offer Received
            </AlertTitle>
            <AlertDescription className="text-amber-800 text-xs mt-1">
              You have received counter-offers on {counterOfferedQuotations.length}{" "}
              {counterOfferedQuotations.length === 1 ? "quotation" : "quotations"}{" "}
              from your sales representative. Please review the updated terms to accept, decline, or reply.
            </AlertDescription>
          </Alert>
        </div>
      )}

      {data.length === 0 ? (
        <EmptyState
          title="No quotations available"
          description="Quotations prepared by your sales representative will appear here for your review and negotiation."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white shadow-2xs">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Quotation Number</TableHead>
                <TableHead>Sales Representative</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Valid Until</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((q) => {
                const latestNegotiation = q.negotiations?.[0];
                return (
                  <TableRow key={q.id} className="hover:bg-muted/30">
                    <TableCell>
                      <Link
                        href={`/portal/quotations/${q.id}`}
                        className="font-medium text-blue-700 hover:underline"
                      >
                        {q.quotationNumber}
                      </Link>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {q.salesRep.name}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <QuotationStatusBadge status={q.status} />
                        {q.status === "UNDER_NEGOTIATION" &&
                          latestNegotiation?.status === "COUNTERED" && (
                            <Badge className="bg-amber-100 text-amber-900 border-amber-300 text-[10px] px-1.5 py-0 font-normal">
                              Counter-Offer Received
                            </Badge>
                          )}
                        {q.status === "UNDER_NEGOTIATION" &&
                          latestNegotiation?.status === "PENDING" && (
                            <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[10px] px-1.5 py-0 font-normal">
                              Awaiting Sales Review
                            </Badge>
                          )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatCurrency(q.total)}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {q.validUntil ? formatDate(q.validUntil) : "No expiration"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDate(q.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      {q.status === "UNDER_NEGOTIATION" &&
                      latestNegotiation?.status === "COUNTERED" ? (
                        <Link
                          href={`/portal/quotations/${q.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-amber-700"
                        >
                          Review Counter
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : q.status === "APPROVED" ? (
                        <Link
                          href={`/portal/quotations/${q.id}`}
                          className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-xs hover:bg-emerald-700"
                        >
                          Review & Accept
                          <ArrowRight className="size-3" />
                        </Link>
                      ) : (
                        <Link
                          href={`/portal/quotations/${q.id}`}
                          className="inline-flex items-center gap-1 text-xs font-medium text-blue-700 hover:underline"
                        >
                          View
                          <ArrowRight className="size-3" />
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}
