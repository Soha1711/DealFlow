import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listWarehouses } from "@/lib/modules/catalog/catalog-service";
import { InventoryAdjust } from "@/components/fulfillment/inventory-adjust";
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

  const inventoryRows = warehouses.flatMap((warehouse) =>
    warehouse.inventory.map((line) => ({
      id: line.id,
      productName: line.product.name,
      warehouseName: warehouse.name,
      warehouseLocation: warehouse.location,
      quantity: line.quantity,
      reservedQuantity: line.reservedQuantity,
    }))
  );

  const totals = {
    onHand: inventoryRows.reduce((sum, row) => sum + row.quantity, 0),
    reserved: inventoryRows.reduce((sum, row) => sum + row.reservedQuantity, 0),
  };

  return (
    <>
      <PageHeader
        title="Warehouses"
        description="Fulfillment locations and their current inventory levels."
      />
      <div className="mb-6">
        <InfoBanner
          title="Inventory adjustments (Phase 5)"
          description="Adjust stock levels to replenish inventory and release backorders. Adjustments are transactional and guarded against negative stock."
        />
      </div>

      {inventoryRows.length === 0 ? (
        <EmptyState description="No inventory has been seeded yet." />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-x-8 gap-y-2 text-sm">
            <span className="text-muted-foreground">
              Warehouses:{" "}
              <span className="font-medium text-foreground">{warehouses.length}</span>
            </span>
            <span className="text-muted-foreground">
              On-hand units:{" "}
              <span className="font-medium text-foreground">
                {totals.onHand.toLocaleString()}
              </span>
            </span>
            <span className="text-muted-foreground">
              Reserved:{" "}
              <span className="font-medium text-foreground">
                {totals.reserved.toLocaleString()}
              </span>
            </span>
            <span className="text-muted-foreground">
              Available:{" "}
              <span className="font-medium text-foreground">
                {(totals.onHand - totals.reserved).toLocaleString()}
              </span>
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border bg-white">
            <Table>
              <TableHeader className="bg-muted/50">
                <TableRow className="hover:bg-muted/50">
                  <TableHead>Product</TableHead>
                  <TableHead>Warehouse</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead className="text-right">On hand</TableHead>
                  <TableHead className="text-right">Reserved</TableHead>
                  <TableHead className="text-right">Available</TableHead>
                  <TableHead className="text-right">Adjust</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {inventoryRows.map((row) => (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium text-foreground">
                      {row.productName}
                    </TableCell>
                    <TableCell>{row.warehouseName}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {row.warehouseLocation}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {row.quantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums text-muted-foreground">
                      {row.reservedQuantity.toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-medium">
                      {(row.quantity - row.reservedQuantity).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-right">
                      <InventoryAdjust inventoryId={row.id} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}
    </>
  );
}