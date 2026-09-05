import type {
  FulfillmentLineStatus,
  FulfillmentStatus,
  QuotationStatus,
} from "@prisma/client";

/**
 * Pure state-machine rules for fulfillment.
 *
 * Quotation (existing enum, mirrored from fulfillment progress):
 *   APPROVED → CONFIRMED (fulfillment created)
 *   CONFIRMED → FULFILLING (allocation started)
 *   FULFILLING → COMPLETED (all physical lines fulfilled)
 *   CANCELLED fulfillment → APPROVED (reopenable)
 *
 * Fulfillment:
 *   PENDING_ALLOCATION
 *     → ALLOCATED | PARTIALLY_ALLOCATED   (allocate / release)
 *     → PARTIALLY_FULFILLED | FULFILLED   (fulfill)
 *     → COMPLETED                         (all lines fulfilled)
 *     → CANCELLED                         (terminal; releases reservations)
 *
 * Line status is derived from quantities via `deriveLineStatus`:
 *   fulfilledQuantity === requestedQuantity       → FULFILLED
 *   0 < fulfilledQuantity < requestedQuantity     → PARTIALLY_FULFILLED
 *   allocatedQuantity > 0, nothing fulfilled      → ALLOCATED | BACKORDERED
 *   otherwise                                     → REQUESTED
 */

export type FulfillmentAction = "allocate" | "fulfill" | "backorder" | "release" | "cancel";

export type FulfillmentTransitionContext = {
  status: FulfillmentStatus;
  /** Any line with backorderQuantity > 0. */
  hasBackorders: boolean;
  /** Every line FULFILLED (fulfilledQuantity === requestedQuantity). */
  allLinesFulfilled: boolean;
};

export type TransitionResult =
  | { ok: true; nextStatus: FulfillmentStatus }
  | { ok: false; reason: "INVALID_STATE" | "BACKORDERS_REMAIN" | "NOTHING_TO_DO"; message: string };

const INVALID_STATE = {
  ok: false,
  reason: "INVALID_STATE" as const,
  message: "This action is not valid in the fulfillment's current state.",
} as const;

export function resolveFulfillmentTransition(
  context: FulfillmentTransitionContext,
  action: FulfillmentAction
): TransitionResult {
  const { status, hasBackorders, allLinesFulfilled } = context;

  if (action === "cancel") {
    if (!["PENDING_ALLOCATION", "ALLOCATED", "PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"].includes(status)) {
      return INVALID_STATE;
    }
    return { ok: true, nextStatus: "CANCELLED" };
  }

  if (action === "allocate") {
    if (!["PENDING_ALLOCATION", "ALLOCATED", "PARTIALLY_ALLOCATED"].includes(status)) {
      return INVALID_STATE;
    }
    return {
      ok: true,
      nextStatus: hasBackorders ? "PARTIALLY_ALLOCATED" : "ALLOCATED",
    };
  }

  if (action === "backorder") {
    if (status !== "PENDING_ALLOCATION") return INVALID_STATE;
    return { ok: true, nextStatus: "PARTIALLY_ALLOCATED" };
  }

  if (action === "release") {
    if (status !== "PARTIALLY_ALLOCATED" && status !== "PARTIALLY_FULFILLED") {
      return INVALID_STATE;
    }
    if (!hasBackorders) {
      return {
        ok: false,
        reason: "NOTHING_TO_DO",
        message: "There are no backorders to release.",
      };
    }
    return {
      ok: true,
      nextStatus: hasBackorders ? "PARTIALLY_ALLOCATED" : "ALLOCATED",
    };
  }

  if (action === "fulfill") {
    if (!["ALLOCATED", "PARTIALLY_ALLOCATED", "PARTIALLY_FULFILLED"].includes(status)) {
      return INVALID_STATE;
    }
    if (allLinesFulfilled) {
      return { ok: true, nextStatus: "COMPLETED" };
    }
    return { ok: true, nextStatus: "PARTIALLY_FULFILLED" };
  }

  return INVALID_STATE;
}

/**
 * Derives a line's status from its quantities. Pure and deterministic —
 * persisted line status must always match this derivation.
 */
export function deriveLineStatus(line: {
  requestedQuantity: number;
  allocatedQuantity: number;
  fulfilledQuantity: number;
}): FulfillmentLineStatus {
  const { requestedQuantity, allocatedQuantity, fulfilledQuantity } = line;
  if (fulfilledQuantity >= requestedQuantity) return "FULFILLED";
  if (fulfilledQuantity > 0) return "PARTIALLY_FULFILLED";
  if (allocatedQuantity >= requestedQuantity) return "ALLOCATED";
  if (allocatedQuantity > 0) return "BACKORDERED";
  return "REQUESTED";
}

/**
 * Maps a fulfillment status to the quotation status it implies.
 * Used to keep the quotation lifecycle in sync with fulfillment progress.
 */
export function quotationStatusForFulfillment(
  fulfillmentStatus: FulfillmentStatus
): QuotationStatus {
  switch (fulfillmentStatus) {
    case "PENDING_ALLOCATION":
      return "CONFIRMED";
    case "ALLOCATED":
    case "PARTIALLY_ALLOCATED":
    case "PARTIALLY_FULFILLED":
    case "FULFILLED":
      return "FULFILLING";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "APPROVED";
  }
}