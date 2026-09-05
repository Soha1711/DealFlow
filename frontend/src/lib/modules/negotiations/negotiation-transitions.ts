import type { NegotiationStatus, QuotationStatus } from "@prisma/client";

/**
 * Pure state-machine rules for quotation negotiations.
 *
 * Negotiation status lifecycle:
 *   Customer submits request ───────────▶ PENDING
 *                                           │
 *        ┌────────── Sales counters ────────┼────────── Sales rejects ──────────┐
 *        │                                  │                                   │
 *        ▼                                  ▼                                   ▼
 *    COUNTERED ── Customer responds ──▶ (PENDING)                            REJECTED
 *        │                                                                      │
 *        └────────── Sales accepts ─────────┴───────────────────────────────────┘
 *                                           ▼
 *                                       ACCEPTED
 *
 * Quotation status interactions:
 *   APPROVED ── Customer submits request ──▶ UNDER_NEGOTIATION
 *   UNDER_NEGOTIATION ── Sales rejects request ──▶ APPROVED
 *   UNDER_NEGOTIATION ── Sales counters request ──▶ UNDER_NEGOTIATION
 *   UNDER_NEGOTIATION ── Sales accepts changes ──▶ DISCOUNT_CHECK (Pricing recalculated)
 *                                                    ├── LOW Risk: APPROVED
 *                                                    └── Higher Risk: PENDING_MANAGER
 *   APPROVED ── Customer accepts quote ──▶ CONFIRMED
 *
 * All functions here are pure and unit-testable without database access.
 */

export type NegotiationAction =
  | "submit"
  | "counter"
  | "respond"
  | "accept"
  | "reject";

export type NegotiationTransitionContext = {
  currentNegotiationStatus?: NegotiationStatus;
  quotationStatus: QuotationStatus;
};

export type TransitionResult<T> =
  | { ok: true; nextStatus: T }
  | { ok: false; reason: "INVALID_STATE" | "ALREADY_ACTED"; message: string };

const INVALID_STATE = (message: string): TransitionResult<never> =>
  ({ ok: false, reason: "INVALID_STATE" as const, message });

const ALREADY_ACTED = (message: string): TransitionResult<never> =>
  ({ ok: false, reason: "ALREADY_ACTED" as const, message });

/**
 * Resolves the next status for a QuotationNegotiation record.
 */
export function resolveNegotiationStatusTransition(
  currentStatus: NegotiationStatus | undefined,
  action: NegotiationAction
): TransitionResult<NegotiationStatus> {
  if (action === "submit") {
    if (currentStatus !== undefined) {
      return INVALID_STATE("A negotiation is already active.");
    }
    return { ok: true, nextStatus: "PENDING" };
  }

  if (!currentStatus) {
    return INVALID_STATE("No active negotiation found.");
  }

  if (currentStatus === "ACCEPTED" || currentStatus === "REJECTED") {
    return ALREADY_ACTED("This negotiation round has already been resolved.");
  }

  switch (action) {
    case "counter":
      if (currentStatus !== "PENDING") {
        return INVALID_STATE("Only pending negotiations can be countered.");
      }
      return { ok: true, nextStatus: "COUNTERED" };

    case "respond":
      if (currentStatus !== "COUNTERED") {
        return INVALID_STATE("Customer can only respond to a countered negotiation.");
      }
      return { ok: true, nextStatus: "PENDING" };

    case "accept":
      if (currentStatus !== "PENDING" && currentStatus !== "COUNTERED") {
        return INVALID_STATE("Only pending or countered negotiations can be accepted.");
      }
      return { ok: true, nextStatus: "ACCEPTED" };

    case "reject":
      if (currentStatus !== "PENDING" && currentStatus !== "COUNTERED") {
        return INVALID_STATE("Only pending or countered negotiations can be rejected.");
      }
      return { ok: true, nextStatus: "REJECTED" };

    default:
      return INVALID_STATE("Unknown negotiation action.");
  }
}

/**
 * Checks if a quotation's status allows a customer to start a negotiation.
 * Only APPROVED quotations can be negotiated.
 */
export function canInitiateNegotiation(quotationStatus: QuotationStatus): boolean {
  return quotationStatus === "APPROVED";
}

/**
 * Checks if a quotation's status allows a customer to accept the quotation as-is.
 * Only APPROVED quotations can be accepted by the customer.
 */
export function canCustomerAcceptQuotation(quotationStatus: QuotationStatus): boolean {
  return quotationStatus === "APPROVED";
}
