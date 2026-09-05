import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listCustomers } from "@/lib/modules/catalog/catalog-service";
import { CUSTOMER_TIER_LABELS } from "@/lib/labels";
import { formatDate } from "@/lib/format";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { InfoBanner } from "@/components/layout/info-banner";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin · Customers" };

const tierStyles: Record<string, string> = {
  PLATINUM: "bg-slate-800 text-white hover:bg-slate-800",
  GOLD: "bg-amber-50 text-amber-700 hover:bg-amber-50",
  SILVER: "bg-slate-50 text-slate-700 hover:bg-slate-50",
  STANDARD: "",
};

export default async function AdminCustomersPage() {
  await requireAreaAccess("admin-customers");
  const customers = await listCustomers();

  return (
    <>
      <PageHeader
        title="Customers"
        description="B2B accounts, tiering and relationship data from the CRM foundation."
      />
      <div className="mb-6">
        <InfoBanner
          title="Read-only in Phase 1"
          description="Customer relationship management (create, edit, tier changes) is implemented in a later phase."
        />
      </div>

      {customers.length === 0 ? (
        <EmptyState description="No customers have been seeded yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Tier</TableHead>
                <TableHead>Added</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {customers.map((customer) => (
                <TableRow key={customer.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">
                    {customer.name}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {customer.email}
                  </TableCell>
                  <TableCell>
                    <Badge
                      className={
                        tierStyles[customer.tier] ?? "text-muted-foreground"
                      }
                    >
                      {CUSTOMER_TIER_LABELS[customer.tier]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDate(customer.createdAt)}
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