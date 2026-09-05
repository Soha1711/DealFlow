import { z } from "zod";

/**
 * Zod schemas for fulfillment API inputs. Schemas are independent of Prisma
 * so malformed payloads are rejected before touching the database. None of
 * the fulfillment actions accept client-provided quantities or prices — those
 * always come from the database.
 */

export const fulfillmentIdSchema = z
  .string()
  .min(1, "fulfillmentId is required")
  .max(64, "fulfillmentId is too long");

/** Starting fulfillment only needs a quotation id; everything else is read. */
export const createFulfillmentSchema = z.object({
  quotationId: z.string().min(1, "quotationId is required").max(64, "quotationId is too long"),
});

export type CreateFulfillmentInput = z.infer<typeof createFulfillmentSchema>;

/** Fulfillment actions take no body (quantities come from the database). */
export const fulfillmentActionSchema = z.object({}).strict();

/** Server-side queue query params. */
export const listFulfillmentsQuerySchema = z.object({
  page: z.coerce
    .number()
    .int("page must be an integer")
    .min(1, "page must be at least 1")
    .default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be an integer")
    .min(1, "pageSize must be at least 1")
    .max(100, "pageSize must be at most 100")
    .default(20),
  status: z
    .enum(
      [
        "PENDING_ALLOCATION",
        "ALLOCATED",
        "PARTIALLY_ALLOCATED",
        "PARTIALLY_FULFILLED",
        "FULFILLED",
        "COMPLETED",
        "CANCELLED",
      ],
      { message: "status must be a valid fulfillment status" }
    )
    .optional(),
});

export type ListFulfillmentsQuery = z.infer<typeof listFulfillmentsQuerySchema>;

/** Admin-only inventory adjustment: integer delta, never zero. */
export const adjustInventorySchema = z.object({
  inventoryId: z.string().min(1, "inventoryId is required").max(64, "inventoryId is too long"),
  delta: z
    .number({ message: "delta must be a number" })
    .int("delta must be a whole number")
    .min(-1000000, "delta is too large")
    .max(1000000, "delta is too large")
    .refine((value) => value !== 0, "delta must not be zero"),
});

export type AdjustInventoryInput = z.infer<typeof adjustInventorySchema>;