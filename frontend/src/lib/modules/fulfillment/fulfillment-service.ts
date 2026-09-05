import type { Prisma } from "@prisma/client";

import { db } from "@/lib/db";
import { allocateAcrossWarehouses, sumAllocations } from "./allocation";
import {
  conflict,
  notFound,
} from "./fulfillment-errors";
import {
  assertCanAdjustInventory,
  assertCanOperateFulfillment,
  assertCanViewFulfillment,
  assertCanViewFulfillmentQueue,
  type FulfillmentActor,
} from "./guards";
import {
  deriveLineStatus,
  quotationStatusForFulfillment,
  resolveFulfillmentTransition,
  type FulfillmentTransitionContext,
} from "./transitions";
import type { ListFulfillmentsQuery } from "./validation";

/**
 * Fulfillment workflow service.
 *
 * Concurrency model (reuses the repository's proven patterns):
 *   - every multi-record write runs in an interactive `db.$transaction`
 *   - allocation serializes per product with `pg_advisory_xact_lock`
 *   - reservation claims are guarded conditional UPDATEs
 *     (`reservedQuantity += n WHERE quantity − reservedQuantity >= n`) whose
 *     affected-row count is checked — a failed guard rolls back the whole
 *     transaction and surfaces as a 409 conflict, so stock is never oversold
 *   - release/fulfill/cancel update `reservedQuantity` symmetrically with the
 *     same guarded pattern, so it can never go negative
 *
 * Inventory is always re-read inside the transaction; cached values are never
 * trusted. Non-physical (recurring/service) products are excluded from
 * physical warehouse allocation entirely — they never create backorders.
 */

const fulfillmentInclude = {
  quotation: {
    include: {
      customer: true,
      salesRep: { select: { id: true, name: true, email: true } },
    },
  },
  lines: {
    orderBy: { createdAt: "asc" as const },
    include: {
      product: true,
      allocations: {
        orderBy: { createdAt: "asc" as const },
        include: { inventory: { include: { warehouse: true } } },
      },
    },
  },
} as const;

const activeFulfillmentWhere = { status: { not: "CANCELLED" as const } };

/** Deterministic FNV-1a hash → positive advisory-lock key per product. */
function productLockKey(productId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < productId.length; i++) {
    hash ^= productId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

async function loadFulfillmentContext(
  tx: Prisma.TransactionClient,
  fulfillmentId: string
): Promise<FulfillmentTransitionContext> {
  const fulfillment = await tx.fulfillment.findUnique({
    where: { id: fulfillmentId },
    select: {
      status: true,
      lines: {
        select: {
          requestedQuantity: true,
          fulfilledQuantity: true,
          backorderQuantity: true,
        },
      },
    },
  });
  if (!fulfillment) {
    throw notFound("Fulfillment not found.");
  }
  return {
    status: fulfillment.status,
    hasBackorders: fulfillment.lines.some((line) => line.backorderQuantity > 0),
    allLinesFulfilled:
      fulfillment.lines.length > 0 &&
      fulfillment.lines.every(
        (line) => line.fulfilledQuantity >= line.requestedQuantity
      ),
  };
}

/**
 * Guards a reservation claim on inventory. The conditional UPDATE serializes
 * concurrent claimants on the row lock; a zero affected-row count means the
 * availability check failed and the caller must roll back (409).
 */
async function claimReservation(
  tx: Prisma.TransactionClient,
  allocationId: string,
  inventoryId: string,
  quantity: number
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "inventory"
    SET "reservedQuantity" = "reservedQuantity" + ${quantity}
    WHERE "id" = ${inventoryId}
      AND "quantity" - "reservedQuantity" >= ${quantity}
  `;
  if (updated === 0) {
    throw conflict(
      "Inventory availability changed during allocation; nothing was reserved.",
      "INVENTORY_CONFLICT"
    );
  }
  await tx.inventoryReservation.create({
    data: {
      inventoryId,
      allocationId,
      quantity,
      status: "ACTIVE",
    },
  });
}

/** Releases a reservation back to stock (fulfill or cancel). */
async function releaseReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  inventoryId: string,
  quantity: number,
  nextStatus: "FULFILLED" | "RELEASED"
): Promise<void> {
  const updated = await tx.$executeRaw`
    UPDATE "inventory"
    SET "reservedQuantity" = "reservedQuantity" - ${quantity}
    WHERE "id" = ${inventoryId}
      AND "reservedQuantity" >= ${quantity}
  `;
  if (updated === 0) {
    throw conflict(
      "Reservation consistency check failed; no stock was released.",
      "RESERVATION_CONFLICT"
    );
  }
  await tx.inventoryReservation.update({
    where: { id: reservationId },
    data: { status: nextStatus, releasedAt: new Date() },
  });
}

async function applyFulfillmentStatus(
  tx: Prisma.TransactionClient,
  fulfillmentId: string,
  quotationId: string
): Promise<void> {
  const context = await loadFulfillmentContext(tx, fulfillmentId);
  const nextStatus = quotationStatusForFulfillment(context.status);
  await tx.quotation.update({
    where: { id: quotationId },
    data: { status: nextStatus },
  });
}

/**
 * Allocates available stock for a single line: advisory lock → re-read
 * inventory → deterministic split → guarded reservations → allocation rows.
 */
async function allocateLine(
  tx: Prisma.TransactionClient,
  line: { id: string; productId: string; requestedQuantity: number }
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(${productLockKey(line.productId)})`;

  const inventoryRows = await tx.inventory.findMany({
    where: { productId: line.productId },
    include: { warehouse: { select: { name: true } } },
  });

  const result = allocateAcrossWarehouses(
    line.requestedQuantity,
    inventoryRows.map((row) => ({
      inventoryId: row.id,
      warehouseName: row.warehouse.name,
      availableQuantity: row.quantity - row.reservedQuantity,
    }))
  );

  for (const slice of result.allocations) {
    const allocation = await tx.fulfillmentAllocation.create({
      data: {
        fulfillmentLineId: line.id,
        inventoryId: slice.inventoryId,
        quantity: slice.quantity,
        status: "ALLOCATED",
      },
    });
    await claimReservation(tx, allocation.id, slice.inventoryId, slice.quantity);
  }

  const allocated = sumAllocations(result.allocations);
  await tx.fulfillmentLine.update({
    where: { id: line.id },
    data: {
      allocatedQuantity: allocated,
      backorderQuantity: result.backorder,
      status: deriveLineStatus({
        requestedQuantity: line.requestedQuantity,
        allocatedQuantity: allocated,
        fulfilledQuantity: 0,
      }),
    },
  });
}

// ---------------------------------------------------------------------------
// Read paths
// ---------------------------------------------------------------------------

export async function getFulfillment(id: string, actor: FulfillmentActor) {
  const fulfillment = await db.fulfillment.findUnique({
    where: { id },
    include: fulfillmentInclude,
  });
  if (!fulfillment) {
    throw notFound("Fulfillment not found.");
  }
  assertCanViewFulfillment(actor, fulfillment.quotation.salesRepId);
  return fulfillment;
}

/** Latest non-cancelled fulfillment for a quotation (read-only display). */
export async function getFulfillmentForQuotation(
  quotationId: string,
  actor: FulfillmentActor
) {
  const fulfillment = await db.fulfillment.findFirst({
    where: { quotationId, ...activeFulfillmentWhere },
    orderBy: { createdAt: "desc" },
    include: {
      quotation: { select: { salesRepId: true } },
      lines: {
        orderBy: { createdAt: "asc" },
        include: {
          allocations: {
            orderBy: { createdAt: "asc" },
            include: { inventory: { include: { warehouse: true } } },
          },
        },
      },
    },
  });
  if (!fulfillment) return null;
  assertCanViewFulfillment(actor, fulfillment.quotation.salesRepId);
  return fulfillment;
}

export type FulfillmentQueueParams = Pick<
  ListFulfillmentsQuery,
  "page" | "pageSize" | "status"
>;

export async function listFulfillments(
  actor: FulfillmentActor,
  params: FulfillmentQueueParams
) {
  assertCanViewFulfillmentQueue(actor.role);

  const where: Prisma.FulfillmentWhereInput = {
    ...(params.status ? { status: params.status } : {}),
    // Sales reps only ever see their own quotations' fulfillments.
    ...(actor.role === "SALES_REP"
      ? { quotation: { salesRepId: actor.userId } }
      : {}),
  };

  const total = await db.fulfillment.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / params.pageSize));
  const page = Math.min(params.page, totalPages);

  const data = await db.fulfillment.findMany({
    where,
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * params.pageSize,
    take: params.pageSize,
    include: {
      quotation: {
        select: {
          quotationNumber: true,
          customer: { select: { name: true } },
          salesRep: { select: { name: true } },
        },
      },
      lines: { select: { requestedQuantity: true, allocatedQuantity: true, backorderQuantity: true } },
    },
  });

  return {
    data: data.map((fulfillment) => ({
      id: fulfillment.id,
      status: fulfillment.status,
      quotationNumber: fulfillment.quotation.quotationNumber,
      customerName: fulfillment.quotation.customer.name,
      salesRepName: fulfillment.quotation.salesRep.name,
      requestedQuantity: fulfillment.lines.reduce((sum, line) => sum + line.requestedQuantity, 0),
      allocatedQuantity: fulfillment.lines.reduce((sum, line) => sum + line.allocatedQuantity, 0),
      backorderQuantity: fulfillment.lines.reduce((sum, line) => sum + line.backorderQuantity, 0),
      createdAt: fulfillment.createdAt,
    })),
    pagination: { page, pageSize: params.pageSize, total, totalPages },
  };
}

// ---------------------------------------------------------------------------
// Write paths
// ---------------------------------------------------------------------------

/**
 * Starts fulfillment for an APPROVED quotation. Fulfillment lines are built
 * from the quotation's current database lines (client quantities/prices are
 * never trusted). Recurring/service products are excluded from physical
 * fulfillment. Atomic: fulfillment + lines + quotation → CONFIRMED.
 */
export async function createFulfillment(
  quotationId: string,
  actor: FulfillmentActor
) {
  assertCanOperateFulfillment(actor.role);

  return db.$transaction(async (tx) => {
    const quotation = await tx.quotation.findUnique({
      where: { id: quotationId },
      include: { lines: { include: { product: true } } },
    });
    if (!quotation) {
      throw notFound("Quotation not found.");
    }
    if (quotation.status !== "APPROVED" && quotation.status !== "CONFIRMED") {
      throw conflict(
        "Fulfillment may only begin for APPROVED or CONFIRMED quotations.",
        "QUOTATION_NOT_APPROVED"
      );
    }
    const active = await tx.fulfillment.findFirst({
      where: { quotationId, ...activeFulfillmentWhere },
    });
    if (active) {
      throw conflict(
        "This quotation already has an active fulfillment.",
        "FULFILLMENT_EXISTS"
      );
    }

    // Non-physical policy: recurring/service products never go through
    // physical warehouse allocation, so they never create backorders.
    const physicalLines = quotation.lines.filter(
      (line) => !line.product.isRecurring
    );
    const noPhysicalLines = physicalLines.length === 0;

    const fulfillment = await tx.fulfillment.create({
      data: {
        quotationId,
        status: noPhysicalLines ? "COMPLETED" : "PENDING_ALLOCATION",
        lines: {
          create: physicalLines.map((line) => ({
            productId: line.productId,
            requestedQuantity: line.quantity,
          })),
        },
      },
      include: fulfillmentInclude,
    });

    await tx.quotation.update({
      where: { id: quotationId },
      data: { status: noPhysicalLines ? "COMPLETED" : "CONFIRMED" },
    });

    return fulfillment;
  });
}

/** Allocates stock for every line not yet allocated (REQUESTED). */
export async function allocateFulfillment(id: string, actor: FulfillmentActor) {
  assertCanOperateFulfillment(actor.role);

  await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUnique({
      where: { id },
      include: {
        lines: {
          where: { status: "REQUESTED" },
          include: { product: true },
        },
      },
    });
    if (!fulfillment) {
      throw notFound("Fulfillment not found.");
    }

    const context = await loadFulfillmentContext(tx, id);
    const transition = resolveFulfillmentTransition(context, "allocate");
    if (!transition.ok) {
      throw conflict(transition.message, "FULFILLMENT_STATE_CONFLICT");
    }

    for (const line of fulfillment.lines) {
      await allocateLine(tx, {
        id: line.id,
        productId: line.productId,
        requestedQuantity: line.requestedQuantity,
      });
    }

    const after = await loadFulfillmentContext(tx, id);
    const resolved = resolveFulfillmentTransition(after, "allocate");
    const nextStatus = resolved.ok ? resolved.nextStatus : "PARTIALLY_ALLOCATED";
    await tx.fulfillment.update({ where: { id }, data: { status: nextStatus } });
    await applyFulfillmentStatus(tx, id, fulfillment.quotationId);
  });

  return getFulfillment(id, actor);
}

/** Explicitly marks any unallocated (REQUESTED) lines as backordered. */
export async function backorderFulfillment(id: string, actor: FulfillmentActor) {
  assertCanOperateFulfillment(actor.role);

  await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUnique({
      where: { id },
      include: { lines: { where: { status: "REQUESTED" } } },
    });
    if (!fulfillment) {
      throw notFound("Fulfillment not found.");
    }

    const context = await loadFulfillmentContext(tx, id);
    const transition = resolveFulfillmentTransition(context, "backorder");
    if (!transition.ok) {
      throw conflict(transition.message, "FULFILLMENT_STATE_CONFLICT");
    }

    for (const line of fulfillment.lines) {
      await tx.fulfillmentLine.update({
        where: { id: line.id },
        data: {
          backorderQuantity: line.requestedQuantity,
          status: "BACKORDERED",
        },
      });
    }

    await tx.fulfillment.update({
      where: { id },
      data: { status: "PARTIALLY_ALLOCATED" },
    });
    await applyFulfillmentStatus(tx, id, fulfillment.quotationId);
  });

  return getFulfillment(id, actor);
}

/** Fulfills everything currently allocated; releases reservations. */
export async function fulfillFulfillment(id: string, actor: FulfillmentActor) {
  assertCanOperateFulfillment(actor.role);

  await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            allocations: {
              where: { status: "ALLOCATED" },
              include: {
                reservations: { where: { status: "ACTIVE" } },
              },
            },
          },
        },
      },
    });
    if (!fulfillment) {
      throw notFound("Fulfillment not found.");
    }

    const context = await loadFulfillmentContext(tx, id);
    const transition = resolveFulfillmentTransition(context, "fulfill");
    if (!transition.ok) {
      throw conflict(transition.message, "FULFILLMENT_STATE_CONFLICT");
    }

    for (const line of fulfillment.lines) {
      for (const allocation of line.allocations) {
        for (const reservation of allocation.reservations) {
          await releaseReservation(
            tx,
            reservation.id,
            reservation.inventoryId,
            reservation.quantity,
            "FULFILLED"
          );
        }
        await tx.fulfillmentAllocation.update({
          where: { id: allocation.id },
          data: { status: "FULFILLED" },
        });
      }
      const fulfilled = line.fulfilledQuantity + sumAllocations(line.allocations);
      await tx.fulfillmentLine.update({
        where: { id: line.id },
        data: {
          fulfilledQuantity: fulfilled,
          status: deriveLineStatus({
            requestedQuantity: line.requestedQuantity,
            allocatedQuantity: line.allocatedQuantity,
            fulfilledQuantity: fulfilled,
          }),
        },
      });
    }

    const after = await loadFulfillmentContext(tx, id);
    const resolved = resolveFulfillmentTransition(after, "fulfill");
    const nextStatus = resolved.ok ? resolved.nextStatus : "PARTIALLY_FULFILLED";
    await tx.fulfillment.update({ where: { id }, data: { status: nextStatus } });
    await applyFulfillmentStatus(tx, id, fulfillment.quotationId);
  });

  return getFulfillment(id, actor);
}

/** Allocates newly available stock for backordered lines. */
export async function releaseBackorder(id: string, actor: FulfillmentActor) {
  assertCanOperateFulfillment(actor.role);

  await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUnique({
      where: { id },
      include: {
        lines: {
          where: { backorderQuantity: { gt: 0 } },
          include: { product: true },
        },
      },
    });
    if (!fulfillment) {
      throw notFound("Fulfillment not found.");
    }

    const context = await loadFulfillmentContext(tx, id);
    const transition = resolveFulfillmentTransition(context, "release");
    if (!transition.ok) {
      throw conflict(transition.message, "FULFILLMENT_STATE_CONFLICT");
    }

    for (const line of fulfillment.lines) {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${productLockKey(line.productId)})`;

      const inventoryRows = await tx.inventory.findMany({
        where: { productId: line.productId },
        include: { warehouse: { select: { name: true } } },
      });
      const result = allocateAcrossWarehouses(
        line.backorderQuantity,
        inventoryRows.map((row) => ({
          inventoryId: row.id,
          warehouseName: row.warehouse.name,
          availableQuantity: row.quantity - row.reservedQuantity,
        }))
      );

      const allocated = sumAllocations(result.allocations);
      if (allocated === 0) continue; // still no stock — backorder persists

      for (const slice of result.allocations) {
        const allocation = await tx.fulfillmentAllocation.create({
          data: {
            fulfillmentLineId: line.id,
            inventoryId: slice.inventoryId,
            quantity: slice.quantity,
            status: "ALLOCATED",
          },
        });
        await claimReservation(tx, allocation.id, slice.inventoryId, slice.quantity);
      }

      const newBackorder = line.backorderQuantity - allocated;
      await tx.fulfillmentLine.update({
        where: { id: line.id },
        data: {
          allocatedQuantity: line.allocatedQuantity + allocated,
          backorderQuantity: newBackorder,
          status: deriveLineStatus({
            requestedQuantity: line.requestedQuantity,
            allocatedQuantity: line.allocatedQuantity + allocated,
            fulfilledQuantity: line.fulfilledQuantity,
          }),
        },
      });
    }

    // The post-release status is derived directly: fully allocated (no
    // backorders left) → ALLOCATED, otherwise still PARTIALLY_ALLOCATED.
    // (Calling the resolver with "release" on the post-state would return
    // NOTHING_TO_DO once backorders are gone.)
    const after = await loadFulfillmentContext(tx, id);
    const nextStatus = after.hasBackorders ? "PARTIALLY_ALLOCATED" : "ALLOCATED";
    await tx.fulfillment.update({ where: { id }, data: { status: nextStatus } });
    await applyFulfillmentStatus(tx, id, fulfillment.quotationId);
  });

  return getFulfillment(id, actor);
}

/** Cancels a fulfillment, releasing every active reservation. */
export async function cancelFulfillment(id: string, actor: FulfillmentActor) {
  assertCanOperateFulfillment(actor.role);

  await db.$transaction(async (tx) => {
    const fulfillment = await tx.fulfillment.findUnique({
      where: { id },
      include: {
        lines: {
          include: {
            allocations: {
              include: { reservations: { where: { status: "ACTIVE" } } },
            },
          },
        },
      },
    });
    if (!fulfillment) {
      throw notFound("Fulfillment not found.");
    }

    const context = await loadFulfillmentContext(tx, id);
    const transition = resolveFulfillmentTransition(context, "cancel");
    if (!transition.ok) {
      throw conflict(transition.message, "FULFILLMENT_STATE_CONFLICT");
    }

    for (const line of fulfillment.lines) {
      for (const allocation of line.allocations) {
        for (const reservation of allocation.reservations) {
          await releaseReservation(
            tx,
            reservation.id,
            reservation.inventoryId,
            reservation.quantity,
            "RELEASED"
          );
        }
        await tx.fulfillmentAllocation.update({
          where: { id: allocation.id },
          data: { status: "RELEASED" },
        });
      }
      if (line.status !== "FULFILLED") {
        await tx.fulfillmentLine.update({
          where: { id: line.id },
          data: { status: "CANCELLED" },
        });
      }
    }

    await tx.fulfillment.update({
      where: { id },
      data: { status: "CANCELLED" },
    });
    await applyFulfillmentStatus(tx, id, fulfillment.quotationId);
  });

  return getFulfillment(id, actor);
}

// ---------------------------------------------------------------------------
// Admin inventory adjustment (for restocking / backorder release testing)
// ---------------------------------------------------------------------------

/**
 * Transactional, admin-only stock adjustment. Guards against negative
 * quantities. Used by Operations/Admin to replenish stock so backorders can
 * be released.
 */
export async function adjustInventory(
  inventoryId: string,
  delta: number,
  actor: FulfillmentActor
) {
  assertCanAdjustInventory(actor.role);

  return db.$transaction(async (tx) => {
    const updated = await tx.$executeRaw`
      UPDATE "inventory"
      SET "quantity" = "quantity" + ${delta}
      WHERE "id" = ${inventoryId}
        AND "quantity" + ${delta} >= 0
    `;
    if (updated === 0) {
      const existing = await tx.inventory.findUnique({
        where: { id: inventoryId },
      });
      if (!existing) {
        throw notFound("Inventory record not found.");
      }
      throw conflict(
        "Adjustment would make inventory negative.",
        "INVENTORY_NEGATIVE"
      );
    }
    return tx.inventory.findUnique({ where: { id: inventoryId } });
  });
}