import "server-only";

import { db } from "@/lib/db";

export type PlatformStats = {
  customerCount: number;
  productCount: number;
  warehouseCount: number;
  subscriptionPlanCount: number;
  discountTierCount: number;
  inventoryUnits: number;
  quotationCount: number;
  pendingApprovalCount: number;
  fulfillmentCount: number;
  invoiceCount: number;
};

export async function getPlatformStats(): Promise<PlatformStats> {
  const [
    customerCount,
    productCount,
    warehouseCount,
    subscriptionPlanCount,
    discountTierCount,
    inventoryAggregate,
    quotationCount,
    pendingApprovalCount,
    fulfillmentCount,
    invoiceCount,
  ] = await Promise.all([
    db.customer.count(),
    db.product.count(),
    db.warehouse.count(),
    db.subscriptionPlan.count(),
    db.discountTier.count(),
    db.inventory.aggregate({ _sum: { quantity: true } }),
    db.quotation.count(),
    db.approval.count({ where: { status: "PENDING" } }),
    db.fulfillment.count({ where: { status: { not: "CANCELLED" } } }),
    db.invoice.count(),
  ]);

  return {
    customerCount,
    productCount,
    warehouseCount,
    subscriptionPlanCount,
    discountTierCount,
    inventoryUnits: inventoryAggregate._sum.quantity ?? 0,
    quotationCount,
    pendingApprovalCount,
    fulfillmentCount,
    invoiceCount,
  };
}