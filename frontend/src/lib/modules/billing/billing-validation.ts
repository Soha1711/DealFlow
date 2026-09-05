import { z } from "zod";

/**
 * Zod schemas for billing API inputs. Schemas are independent of Prisma so
 * malformed payloads are rejected before touching the database. Monetary
 * values may arrive as JSON numbers or numeric strings (Prisma serializes
 * Decimal to strings) and are always normalized server-side.
 */

export const moneyInputSchema = z.union([
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative number with at most 2 decimal places"),
  z.number().finite("Amount must be a finite number"),
]);

export const idSchema = z
  .string()
  .min(1, "id is required")
  .max(64, "id is too long");

export const invoiceIdSchema = idSchema;
export const subscriptionIdSchema = idSchema;
export const quotationIdSchema = idSchema;

/** Issue/void take no body; everything else is read from the database. */
export const invoiceActionSchema = z.object({}).strict();

/** Recording an internal payment against an invoice. */
export const recordPaymentSchema = z
  .object({
    amount: moneyInputSchema,
    method: z
      .string()
      .trim()
      .min(1, "method is required")
      .max(40, "method is too long")
      .optional(),
    reference: z
      .string()
      .trim()
      .max(120, "reference is too long")
      .optional(),
    // Optional caller-supplied idempotency key. When provided it must be unique
    // across payments (DB unique constraint); a duplicate is rejected so a
    // double-click or webhook retry can never credit the invoice twice.
    idempotencyKey: z
      .string()
      .trim()
      .min(1, "idempotencyKey must not be empty")
      .max(120, "idempotencyKey is too long")
      .optional(),
  })
  // Unknown fields (e.g. a client-supplied invoice total) are rejected so the
  // server never trusts browser-provided amounts.
  .strict();

export type RecordPaymentInput = z.infer<typeof recordPaymentSchema>;

/** Creating billing from a quotation needs no body — data comes from the DB. */
export const createBillingSchema = z.object({}).strict();

/** Server-side list query params shared by invoice/subscription/schedule lists. */
export const listBillingQuerySchema = z.object({
  page: z.coerce.number().int("page must be an integer").min(1, "page must be at least 1").default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be an integer")
    .min(1, "pageSize must be at least 1")
    .max(100, "pageSize must be at most 100")
    .default(20),
  q: z.string().trim().max(100, "Search term is too long").optional(),
  status: z.string().trim().max(40, "status is too long").optional(),
  type: z.string().trim().max(40, "type is too long").optional(),
});

export type ListBillingQuery = z.infer<typeof listBillingQuerySchema>; 