import type { Metadata } from "next";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { listApprovalQueue } from "@/lib/modules/approvals/approval-service";
import { listApprovalsQuerySchema } from "@/lib/modules/approvals/approval-validation";
import { APPROVAL_LEVEL_STAGE_LABELS } from "@/lib/labels";
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
import { ApprovalPagination } from "@/components/approvals/approval-pagination";
import { ApprovalStatusBadge } from "@/components/approvals/approval-status-badge";
import { RiskLevelBadge } from "@/components/approvals/risk-badge";

export const metadata: Metadata = { title: "Approvals" };

export default async function ApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireAreaAccess("approvals");

  const raw = await searchParams;
  const flattened = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ])
  );
  const parsed = listApprovalsQuerySchema.safeParse(flattened);
  const query = parsed.success ? parsed.data : { page: 1, pageSize: 20 };

  let result: Awaited<ReturnType<typeof listApprovalQueue>>;
  try {
    result = await listApprovalQueue(
      { role: user.role, userId: user.id },
      query
    );
  } catch {
    return (
      <>
        <PageHeader
          title="Approvals"
          description="Review discount requests against product discount limits."
        />
        <Alert variant="destructive">
          <TriangleAlert className="size-4" aria-hidden />
          <AlertTitle>Failed to load approvals</AlertTitle>
          <AlertDescription>
            The approval queue could not be loaded. Please try again.
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { data, pagination } = result;

  return (
    <>
      <PageHeader
        title="Approvals"
        description="Review discount requests against product discount limits."
      />

      {data.length === 0 ? (
        <EmptyState
          title="No pending approvals"
          description="Quotations that require approval will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Quotation</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Sales rep</TableHead>
                <TableHead className="text-right">Total</TableHead>
                <TableHead>Discount risk</TableHead>
                <TableHead className="text-right">Risk score</TableHead>
                <TableHead>Approval level</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((approval) => (
                <TableRow key={approval.id} className="hover:bg-muted/30">
                  <TableCell>
                    <Link
                      href={`/approvals/${approval.id}`}
                      className="font-medium text-blue-700 hover:underline"
                    >
                      {approval.quotation.quotationNumber}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {approval.quotation.customer.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {approval.quotation.salesRep.name}
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatCurrency(approval.quotation.total)}
                  </TableCell>
                  <TableCell>
                    <RiskLevelBadge level={approval.quotation.riskLevel} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {approval.quotation.riskScore ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {APPROVAL_LEVEL_STAGE_LABELS[approval.level]}
                  </TableCell>
                  <TableCell>
                    <ApprovalStatusBadge status={approval.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(approval.createdAt)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <ApprovalPagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            status={query.status}
            level={query.level}
          />
        </div>
      )}
    </>
  );
}