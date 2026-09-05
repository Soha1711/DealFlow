import type { Role } from "@prisma/client";

import { forbidden } from "./fulfillment-errors";

/**
 * Server-side authorization rules for the fulfillment workflow.
 *
 *   OPERATIONS — view/allocate/fulfill/release/cancel fulfillments
 *   ADMIN       — everything OPERATIONS can do, plus inventory adjustment
 *   SALES_REP   — read-only status for their own quotations
 *   SALES_MANAGER — read-only status for quotations they can view
 *   FINANCE / CUSTOMER — no fulfillment access in this phase
 *
 * The helpers are pure and unit-testable; the service calls the `assert*`
 * functions on every request so authorization is enforced server-side,
 * never only in the UI.
 */

export type FulfillmentActor = {
  role: Role;
  userId: string;
};

export function canOperateFulfillment(role: Role): boolean {
  return role === "OPERATIONS" || role === "ADMIN";
}

export function canAdjustInventory(role: Role): boolean {
  return role === "ADMIN";
}

export function canViewFulfillment(
  actor: FulfillmentActor,
  salesRepId: string
): boolean {
  if (actor.role === "OPERATIONS" || actor.role === "ADMIN") return true;
  if (actor.role === "SALES_MANAGER") return true;
  if (actor.role === "SALES_REP") return actor.userId === salesRepId;
  return false;
}

/** Whether the role may see the fulfillment queue at all. */
export function canViewFulfillmentQueue(role: Role): boolean {
  return (
    role === "OPERATIONS" ||
    role === "ADMIN" ||
    role === "SALES_MANAGER" ||
    role === "SALES_REP"
  );
}

export function assertCanOperateFulfillment(role: Role): void {
  if (!canOperateFulfillment(role)) {
    throw forbidden(
      "You are not authorized to perform fulfillment operations.",
      "FULFILLMENT_FORBIDDEN"
    );
  }
}

export function assertCanAdjustInventory(role: Role): void {
  if (!canAdjustInventory(role)) {
    throw forbidden(
      "Only administrators can adjust inventory.",
      "INVENTORY_FORBIDDEN"
    );
  }
}

export function assertCanViewFulfillment(
  actor: FulfillmentActor,
  salesRepId: string
): void {
  if (!canViewFulfillment(actor, salesRepId)) {
    throw forbidden(
      "You cannot view this fulfillment.",
      "FULFILLMENT_FORBIDDEN"
    );
  }
}

export function assertCanViewFulfillmentQueue(role: Role): void {
  if (!canViewFulfillmentQueue(role)) {
    throw forbidden(
      "You do not have access to fulfillment.",
      "FULFILLMENT_FORBIDDEN"
    );
  }
}