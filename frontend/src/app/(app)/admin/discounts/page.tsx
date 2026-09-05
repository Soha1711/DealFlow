import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listDiscountTiers } from "@/lib/modules/catalog/catalog-service";
import { APPROVAL_LEVEL_LABELS } from "@/lib/labels";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin · Discount Rules" };

const approvalStyles: Record<string, string> = {
  NONE: "bg-muted text-muted-foreground hover:bg-muted",
  MANAGER:
    "bg-blue-50 text-blue-700 hover:bg-blue-50",
  MANAGER_AND_FINANCE:
    "bg-amber-50 text-amber-700 hover:bg-amber-50",
};

export default async function AdminDiscountsPage() {
  await requireAreaAccess("admin-discounts");
  const tiers = await listDiscountTiers();

  return (
    <>
      <PageHeader
        title="Discount Rules"
        description="Discount governance tiers and the approval level required to grant them."
        backHref="/admin"
        backLabel="Back to administration"
      />

      {tiers.length === 0 ? (
        <EmptyState description="No discount tiers have been seeded yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Tier</TableHead>
                <TableHead>Discount range</TableHead>
                <TableHead>Required approval</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tiers.map((tier) => (
                <TableRow key={tier.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">
                    {tier.name}
                  </TableCell>
                  <TableCell className="tabular-nums text-muted-foreground">
                    {tier.minDiscount}% – {tier.maxDiscount === 100 ? "100+" : `${tier.maxDiscount}%`}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={approvalStyles[tier.approvalLevel] ?? ""}
                    >
                      {APPROVAL_LEVEL_LABELS[tier.approvalLevel]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  );
}