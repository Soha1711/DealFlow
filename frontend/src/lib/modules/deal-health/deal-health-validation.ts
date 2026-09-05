import { z } from "zod";

export const dealHealthIdSchema = z.string().min(1, "Quotation ID is required");

export const listDealHealthQuerySchema = z.object({
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
  q: z.string().trim().max(100, "Search query is too long").optional(),
  level: z.enum(["ALL", "HEALTHY", "AT_RISK", "CRITICAL"]).optional(),
  salesRepId: z.string().trim().optional(),
});

export type ListDealHealthQuery = z.infer<typeof listDealHealthQuerySchema>;
