import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowUpRight } from "lucide-react";

import { requireAreaAccess } from "@/lib/auth-guards";
import { formatCurrency, formatDate } from "@/lib/format";
import { getApprovalDetail, listApprovalsForQuotation } from "@/lib/modules/approvals/approval-service";
import { APPROVAL_LEVEL_STAGE_LABELS } from "@/lib/labels";
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
import { ApprovalActions } from "@/components/approvals/approval-actions";
import { ApprovalStageList, buildApprovalStages } from "@/components/approvals/approval-stage-list";
import { ApprovalStatusBadge } from "@/components/approvals/approval-status-badge";
import { RiskLevelBadge } from "@/components/approvals/risk-badge";
import { QuotationStatusBadge } from "@/components/quotations/status-badge";

export const metadata: Metadata = { title: "Approval" };

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAreaAccess("approvals");
  const { id } = await params;

  const approval = await getApprovalDetail(id, {
    role: user.role,
    userId: user.id,
  }).catch(() => null);
  if (!approval) notFound();

  const quotation = approval.quotation;
  const chain = await listApprovalsForQuotation(quotation.id);
  const approverNames = new Map<string, string>();
  for (const item of chain) {
    if (item.approver) approverNames.set(item.approver.id, item.approver.name);
  }
  const stages = buildApprovalStages(
    quotation.requiredApprovalLevel,
    chain,
    Object.fromEntries(approverNames)
  );

  const analysis = quotation.lines.map((line) => {
    const maxDiscountPercent = line.product.maxDiscountPercent;
    return {
      product: line.product,
      requested: line.discountPercent,
      max: maxDiscountPercent,
      variance: line.discountPercent - maxDiscountPercent,
      lineTotal: line.lineTotal,
    };
  });

  return (
    <>
      <PageHeader
        title={quotation.quotationNumber}
        description={`Approval created ${formatDate(approval.createdAt)}`}
      >
        <QuotationStatusBadge status={quotation.status} />
        <ApprovalStatusBadge status={approval.status} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="bg-white">
            <CardHeader>
              <CardTitle>Discount analysis</CardTitle>
              <CardDescription>
                Every line is evaluated against its product&apos;s discount
                limit.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {analysis.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No line items on this quotation.
                </p>
              ) : (
                <div className="overflow-hidden rounded-lg border border-border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-muted/50">
                        <TableHead>Product</TableHead>
                        <TableHead className="text-right">
                          Requested discount
                        </TableHead>
                        <TableHead className="text-right">
                          Maximum allowed
                        </TableHead>
                        <TableHead className="text-right">Variance</TableHead>
                        <TableHead className="text-right">Line total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {analysis.map((row) => (
                        <TableRow key={row.product.id} className="hover:bg-muted/30">
                          <TableCell>
                            <p className="font-medium text-foreground">
                              {row.product.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.product.sku}
                            </p>
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {row.requested}%
                          </TableCell>
                          <TableCell className="text-right tabular-nums text-muted-foreground">
                            {row.max}%
                          </TableCell>
                          <TableCell
                            className={`text-right tabular-nums ${
                              row.variance > 0
                                ? "font-medium text-red-700"
                                : "text-muted-foreground"
                            }`}
                          >
                            {row.variance > 0
                              ? `+${row.variance}pp`
                              : "within limit"}
                          </TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatCurrency(row.lineTotal)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {stages.length > 0 && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Approval stages</CardTitle>
                <CardDescription>
                  {quotation.requiredApprovalLevel === "MANAGER_AND_FINANCE"
                    ? "Critical discount — manager and finance approval are required."
                    : "This quotation requires manager approval."}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApprovalStageList stages={stages} />
              </CardContent>
            </Card>
          )}
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
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Quotation total</dt>
                  <dd className="font-medium tabular-nums">
                    {formatCurrency(quotation.total)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Margin</dt>
                  <dd className="tabular-nums">
                    {formatCurrency(quotation.margin)}
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Risk score</dt>
                  <dd className="font-medium tabular-nums">
                    {quotation.riskScore ?? "—"}
                    <span className="text-muted-foreground"> / 100</span>
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Risk level</dt>
                  <dd>
                    <RiskLevelBadge level={quotation.riskLevel} />
                  </dd>
                </div>
                <div className="flex items-center justify-between">
                  <dt className="text-muted-foreground">Approval level</dt>
                  <dd className="font-medium">
                    {APPROVAL_LEVEL_STAGE_LABELS[approval.level]}
                  </dd>
                </div>
                {approval.actedAt && (
                  <div className="flex items-center justify-between">
                    <dt className="text-muted-foreground">Acted on</dt>
                    <dd className="tabular-nums">
                      {formatDate(approval.actedAt)}
                    </dd>
                  </div>
                )}
                {approval.reason && (
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Rejection reason
                    </dt>
                    <dd className="text-red-700">{approval.reason}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          {approval.status === "PENDING" && (
            <Card className="bg-white">
              <CardHeader>
                <CardTitle>Decision</CardTitle>
                <CardDescription>
                  Your decision is recorded and cannot be changed.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ApprovalActions approvalId={approval.id} />
              </CardContent>
            </Card>
          )}

          <Button asChild variant="outline" className="w-full">
            <Link href={`/quotations/${quotation.id}`}>
              View full quotation
              <ArrowUpRight className="size-4" aria-hidden />
            </Link>
          </Button>
        </div>
      </div>
    </>
  );
}