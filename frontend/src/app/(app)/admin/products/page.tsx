import type { Metadata } from "next";

import { requireAreaAccess } from "@/lib/auth-guards";
import { listProducts } from "@/lib/modules/products/products-service";
import { formatCurrency, formatPercent } from "@/lib/format";
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

export const metadata: Metadata = { title: "Admin · Products" };

export default async function AdminProductsPage() {
  await requireAreaAccess("admin-products");
  const products = await listProducts();

  return (
    <>
      <PageHeader
        title="Products"
        description="Catalog, pricing, cost and per-product discount ceilings."
        backHref="/admin"
        backLabel="Back to administration"
      />

      {products.length === 0 ? (
        <EmptyState description="No products have been seeded yet." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-white">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow className="hover:bg-muted/50">
                <TableHead>Name</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Category</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Cost</TableHead>
                <TableHead className="text-right">Max discount</TableHead>
                <TableHead>Recurring</TableHead>
                <TableHead>Plan</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id} className="hover:bg-muted/30">
                  <TableCell className="font-medium text-foreground">
                    {product.name}
                  </TableCell>
                  <TableCell>
                    <code className="rounded bg-muted px-1.5 py-0.5 text-xs">
                      {product.sku}
                    </code>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.category}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatCurrency(product.price)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums text-muted-foreground">
                    {formatCurrency(product.cost)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPercent(product.maxDiscountPercent)}
                  </TableCell>
                  <TableCell>
                    {product.isRecurring ? (
                      <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50">
                        Yes
                      </Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {product.subscriptionPlan?.name ?? "—"}
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