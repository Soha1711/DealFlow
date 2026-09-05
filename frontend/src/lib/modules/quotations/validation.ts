import { z } from "zod";

/**
 * Zod schemas for quotation API inputs. Schemas are intentionally independent
 * of Prisma so malformed payloads are rejected before touching the database.
 */

/**
 * Monetary values may arrive as JSON numbers or as numeric strings (Prisma
 * serializes `Decimal` to strings). Strings are restricted to at most 2
 * decimal places; numbers are accepted as-is and rounded by the pricing engine.
 */
export const moneyInputSchema = z.union([
  z.string().regex(/^\d+(\.\d{1,2})?$/, "Amount must be a non-negative number with at most 2 decimal places"),
  z.number().finite("Amount must be a finite number"),
]);

export const quotationLineInputSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  quantity: z
    .number({ message: "quantity must be a number" })
    .int("quantity must be a whole number")
    .positive("quantity must be greater than 0"),
  unitPrice: moneyInputSchema,
  discountPercent: z
    .number({ message: "discountPercent must be a number" })
    .min(0, "discountPercent must be between 0 and 100")
    .max(100, "discountPercent must be between 0 and 100"),
});

export type QuotationLineInput = z.infer<typeof quotationLineInputSchema>;

/** Parses a date-ish string (ISO timestamp or date-only) into a Date. */
const dateStringSchema = z
  .string()
  .refine((value) => !Number.isNaN(Date.parse(value)), "Invalid date");

export const createQuotationSchema = z.object({
  customerId: z.string().min(1, "customerId is required"),
  validUntil: dateStringSchema.nullish(),
  lines: z
    .array(quotationLineInputSchema)
    .min(1, "At least one quotation line is required"),
});

export type CreateQuotationInput = z.infer<typeof createQuotationSchema>;

export const updateQuotationSchema = z
  .object({
    customerId: z.string().min(1, "customerId is required").optional(),
    validUntil: dateStringSchema.nullish(),
    lines: z
      .array(quotationLineInputSchema)
      .min(1, "At least one quotation line is required")
      .optional(),
  })
  .refine((value) => Object.keys(value).length > 0, "No fields to update");

export type UpdateQuotationInput = z.infer<typeof updateQuotationSchema>;

export const quotationIdSchema = z.string().min(1, "Quotation id is required");

/** Server-side list query params (page, pageSize, search, status). */
export const listQuotationsQuerySchema = z.object({
  page: z.coerce.number().int("page must be an integer").min(1, "page must be at least 1").default(1),
  pageSize: z.coerce
    .number()
    .int("pageSize must be an integer")
    .min(1, "pageSize must be at least 1")
    .max(100, "pageSize must be at most 100")
    .default(20),
  q: z.string().trim().max(100, "Search term is too long").optional(),
  status: z.enum(["DRAFT", "PENDING_APPROVAL"], {
    message: "status must be DRAFT or PENDING_APPROVAL",
  }).optional(),
});

export type ListQuotationsQuery = z.infer<typeof listQuotationsQuerySchema>;