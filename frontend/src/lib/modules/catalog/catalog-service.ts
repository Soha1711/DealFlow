import "server-only";

import { db } from "@/lib/db";

export async function listCustomers() {
  return db.customer.findMany({
    orderBy: { name: "asc" },
  });
}

export async function listDiscountTiers() {
  return db.discountTier.findMany({
    orderBy: { minDiscount: "asc" },
  });
}

export async function listWarehouses() {
  return db.warehouse.findMany({
    orderBy: { name: "asc" },
    include: {
      inventory: {
        include: { product: true },
      },
    },
  });
}

export async function listSubscriptionPlans() {
  return db.subscriptionPlan.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: { select: { products: true } },
    },
  });
}