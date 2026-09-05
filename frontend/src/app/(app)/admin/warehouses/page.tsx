import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listWarehouses } from "@/lib/modules/catalog/catalog-service";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/layout/empty-state";
import { InfoBanner } from "@/components/layout/info-banner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const metadata: Metadata = { title: "Admin · Warehouses" };

export default async function AdminWarehousesPage() {
  await requireAreaAccess("admin-warehouses");
  const warehouses = await listWarehouses();

  const inventoryTotals = (warehouseId: string) => {
    const lines = warehouses.find((w) => w.id === warehouseId)?.inventory ?? [];
    return {
      skuCount: lines.length,
      onHand: lines.reduce((sum, line) => sum + line.quantity, 0),
      reserved: lines.reduce((sum, line) => sum + line.reservedQuantity, 0),
    };
  };

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Fulfillment locations and their current inventory levels."
      />
      <div className="mb-6">
        <InfoBanner
          title="Read-only in Phase 1"
          description="Warehouse and inventory management is implemented in a later phase."
        />
      </div>

      {warehouses.length === 0 ? (
        <EmptyState description="No warehouses have been seeded yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Warehouse</TableHead>
                <TableHead>Location</TableHead>
                <TableHead className="text-right">SKUs in stock</TableHead>
                <TableHead className="text-right">On-hand units</TableHead>
                <TableHead className="text-right">Reserved</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {warehouses.map((warehouse) => {
                const totals = inventoryTotals(warehouse.id);
                return (
                  <TableRow key={warehouse.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">
                      {warehouse.name}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {warehouse.location}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.skuCount}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {totals.onHand.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {totals.reserved.toLocaleString()}
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