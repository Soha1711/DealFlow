import "server-only";

import { db } from "@/lib/db";

export type PlatformStats = {
  customerCount: number;
  productCount: number;
  warehouseCount: number;
  subscriptionPlanCount: number;
  discountTierCount: number;
  inventoryUnits: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const [customerCount, productCount, warehouseCount, subscriptionPlanCount, discountTierCount, inventoryAggregate] =
    await Promise.all([
      db.customer.count(),
      db.product.count(),
      db.warehouse.count(),
      db.subscriptionPlan.count(),
      db.discountTier.count(),
      db.inventory.aggregate({ _sum: { quantity: true } }),
    ]);

  return {
    customerCount,
    productCount,
    warehouseCount,
    subscriptionPlanCount,
    discountTierCount,
    inventoryUnits: inventoryAggregate._sum.quantity ?? 0,
  };
}