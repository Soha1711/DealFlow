/**
 * Deterministic multi-warehouse allocation.
 *
 * For a requested quantity and a set of inventory rows (per warehouse), the
 * allocator:
 *
 *   1. sorts rows by available quantity DESC, then warehouse name ASC
 *   2. allocates greedily across warehouses until the request is satisfied
 *   3. returns the per-warehouse split plus the backorder remainder
 *
 * The sort order makes the result fully deterministic — the same inputs
 * always produce the same allocation, so it is safe to persist and audit.
 * No AI and no randomness are involved.
 *
 * Example: request 12 with A=8, B=5, C=2 available →
 *   A=8, B=4, C=0, backorder=0
 */

export type AllocationWarehouse = {
  inventoryId: string;
  warehouseName: string;
  /** Available now: quantity − reservedQuantity. */
  availableQuantity: number;
};

export type AllocationResult = {
  /** Per-warehouse slices (quantities > 0). */
  allocations: { inventoryId: string; warehouseName: string; quantity: number }[];
  /** Requested − allocated; > 0 when stock is insufficient. */
  backorder: number;
};

export function allocateAcrossWarehouses(
  requestedQuantity: number,
  warehouses: AllocationWarehouse[]
): AllocationResult {
  const sorted = [...warehouses].sort(
    (a, b) =>
      b.availableQuantity - a.availableQuantity ||
      a.warehouseName.localeCompare(b.warehouseName)
  );

  let remaining = requestedQuantity;
  const allocations: AllocationResult["allocations"] = [];

  for (const warehouse of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, Math.max(0, warehouse.availableQuantity));
    if (take > 0) {
      allocations.push({
        inventoryId: warehouse.inventoryId,
        warehouseName: warehouse.warehouseName,
        quantity: take,
      });
      remaining -= take;
    }
  }

  return {
    allocations,
    backorder: Math.max(0, remaining),
  };
}

/**
 * Sums the quantity of a line's allocations. Pure helper used by the service
 * to keep line counters consistent with its allocation records.
 */
export function sumAllocations(
  allocations: { quantity: number }[]
): number {
  return allocations.reduce((sum, allocation) => sum + allocation.quantity, 0);
}