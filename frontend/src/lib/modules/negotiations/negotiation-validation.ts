import { z } from "zod";
import { quotationLineInputSchema } from "@/lib/modules/quotations/validation";

/**
 * Zod validation schemas for Customer Portal & Quotation Negotiation inputs.
 * All customer inputs are strictly validated before processing.
 */

export const proposedLineChangeSchema = z.object({
  productId: z.string().min(1, "productId is required"),
  requestedQuantity: z
    .number()
    .int("Quantity must be a whole number")
    .positive("Quantity must be greater than 0")
    .optional(),
  requestedDiscountPercent: z
    .number()
    .min(0, "Discount must be between 0 and 100")
    .max(100, "Discount must be between 0 and 100")
    .optional(),
  notes: z.string().trim().max(300, "Notes must not exceed 300 characters").optional(),
});

export const submitNegotiationSchema = z.object({
  message: z
    .string({ message: "Negotiation message is required" })
    .trim()
    .min(5, "Please explain your negotiation request (minimum 5 characters)")
    .max(1000, "Message cannot exceed 1000 characters"),
  targetTotal: z
    .number()
    .positive("Target total must be positive")
    .optional(),
  proposedLines: z.array(proposedLineChangeSchema).optional(),
});

export type SubmitNegotiationInput = z.infer<typeof submitNegotiationSchema>;

export const respondNegotiationSchema = z.object({
  message: z
    .string({ message: "Response message is required" })
    .trim()
    .min(2, "Response message must be at least 2 characters")
    .max(1000, "Response cannot exceed 1000 characters"),
});

export type RespondNegotiationInput = z.infer<typeof respondNegotiationSchema>;

export const rejectNegotiationSchema = z.object({
  reason: z
    .string({ message: "Rejection reason is required" })
    .trim()
    .min(5, "Please provide a reason for declining the negotiation request")
    .max(500, "Rejection reason cannot exceed 500 characters"),
});

export type RejectNegotiationInput = z.infer<typeof rejectNegotiationSchema>;

export const counterNegotiationSchema = z.object({
  message: z
    .string({ message: "Counter-proposal message is required" })
    .trim()
    .min(5, "Please provide counter-proposal details (minimum 5 characters)")
    .max(1000, "Message cannot exceed 1000 characters"),
});

export type CounterNegotiationInput = z.infer<typeof counterNegotiationSchema>;

export const acceptNegotiationSchema = z.object({
  message: z.string().trim().max(500).optional(),
  lines: z
    .array(quotationLineInputSchema)
    .min(1, "At least one quotation line is required")
    .optional(),
});

export type AcceptNegotiationInput = z.infer<typeof acceptNegotiationSchema>;

export const customerAcceptCounterSchema = z.object({
  message: z.string().trim().max(500, "Message cannot exceed 500 characters").optional(),
});

export type CustomerAcceptCounterInput = z.infer<typeof customerAcceptCounterSchema>;

export const customerRejectCounterSchema = z.object({
  reason: z.string().trim().max(500, "Reason cannot exceed 500 characters").optional(),
});

export type CustomerRejectCounterInput = z.infer<typeof customerRejectCounterSchema>;

export const listPortalQuotationsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  search: z.string().trim().max(100).optional(),
  status: z
    .enum(["APPROVED", "UNDER_NEGOTIATION", "CONFIRMED", "FULFILLING", "COMPLETED"])
    .optional(),
});

export type ListPortalQuotationsQuery = z.infer<typeof listPortalQuotationsQuerySchema>;

