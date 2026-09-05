import "server-only";

import { db } from "@/lib/db";

export async function listProducts() {
  return db.product.findMany({
    orderBy: { name: "asc" },
    include: { subscriptionPlan: true },
  });
}

export type ProductWithPlan = Awaited<ReturnType<typeof listProducts>>[number];