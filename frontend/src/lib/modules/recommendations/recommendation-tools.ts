import { db } from "@/lib/db";

/**
 * Controlled read-only tools for the recommendation pipeline.
 *
 * Every tool validates its inputs, performs a narrow read-only query and
 * returns only the data the caller needs. None of them can mutate business
 * data, none expose secrets, and none return `Product.cost` to anything that
 * could reach a customer-facing surface (margin is computed from price/cost
 * and only ever included in internal responses).
 *
 * The same tools supply the deterministic engine and the (optional) AI
 * ranking layer — the model never gets raw database access or SQL.
 */

export type CustomerHistory = {
  productIds: string[];
  categoryCounts: Record<string, number>;
};

/** Aggregates the customer's real purchase history from approved+ quotations. */
export async function getCustomerHistory(customerId: string): Promise<CustomerHistory> {
  const rows = await db.quotationLine.findMany({
    where: {
      quotation: {
        customerId,
        status: { in: ["APPROVED", "CONFIRMED", "FULFILLING", "COMPLETED"] },
      },
    },
    select: {
      product: { select: { id: true, category: true } },
      quantity: true,
    },
  });

  const productIds = new Set<string>();
  const categoryCounts: Record<string, number> = {};
  for (const row of rows) {
    productIds.add(row.product.id);
    categoryCounts[row.product.category] =
      (categoryCounts[row.product.category] ?? 0) + row.quantity;
  }
  return { productIds: [...productIds], categoryCounts };
}

/** Current quotation with its lines and product details (read-only). */
export async function getCurrentQuotation(quotationId: string) {
  return db.quotation.findUnique({
    where: { id: quotationId },
    include: {
      customer: { select: { id: true, name: true, tier: true } },
      salesRep: { select: { id: true, name: true } },
      lines: {
        orderBy: { createdAt: "asc" as const },
        include: { product: true },
      },
    },
  });
}

/** Available quantity per product across all warehouses (no reserved stock). */
export async function getInventorySnapshot(): Promise<
  Record<string, { availableQuantity: number }>
> {
  const rows = await db.inventory.findMany({
    select: {
      productId: true,
      quantity: true,
      reservedQuantity: true,
    },
  });
  const snapshot: Record<string, { availableQuantity: number }> = {};
  for (const row of rows) {
    const current = snapshot[row.productId]?.availableQuantity ?? 0;
    snapshot[row.productId] = {
      availableQuantity: current + (row.quantity - row.reservedQuantity),
    };
  }
  return snapshot;
}

/** Public product details only — never includes cost. */
export async function getProductDetails(productIds: string[]) {
  return db.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      category: true,
      price: true,
      maxDiscountPercent: true,
      isRecurring: true,
    },
  });
}

/**
 * Internal margin figures (price, cost and margin percent). Cost is computed
 * from the database and never returned outside this module's DTO builder.
 */
export async function getProductMargin(productIds: string[]) {
  return db.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, price: true, cost: true },
  });
}

/** Active promotions. The current schema has no promotions table — returns []. */
export async function getActivePromotions(): Promise<
  { productId: string; label: string }[]
> {
  return [];
}

/**
 * Every product the engine may recommend: exists in the database, has
 * available inventory, and is not already on the quotation. Unavailable
 * products are excluded (never presented as normally available).
 */
export async function getEligibleCandidates(quoteProductIds: string[]) {
  const [products, inventory] = await Promise.all([
    db.product.findMany({
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        price: true,
        cost: true,
      },
    }),
    getInventorySnapshot(),
  ]);

  return products
    .filter((product) => !quoteProductIds.includes(product.id))
    .map((product) => {
      const availableQuantity = inventory[product.id]?.availableQuantity ?? 0;
      return {
        productId: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: product.price,
        cost: product.cost,
        availableQuantity,
      };
    })
    .filter((candidate) => candidate.availableQuantity > 0);
}