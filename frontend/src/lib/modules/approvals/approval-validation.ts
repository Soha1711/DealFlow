import { z } from "zod";

/**
 * Zod schemas for approval API inputs. Schemas are independent of Prisma so
 * malformed payloads are rejected before touching the database.
 */

export const approvalIdSchema = z
  .string()
  .min(1, "approvalId is required")
  .max(64, "approvalId is too long");

/**
 * Approving takes no body. An absent body (or an empty object) is accepted;
 * anything else is rejected by `.strict()`.
 */
export const approveApprovalSchema = z.object({}).strict();

/** Rejection always requires a non-empty reason (trimmed, ≤ 500 chars). */
export const rejectApprovalSchema = z.object({
  reason: z
    .string({ message: "reason must be a string" })
    .trim()
    .min(1, "A rejection reason is required.")
    .max(500, "Reason must be at most 500 characters."),
});

export type RejectApprovalInput = z.infer<typeof rejectApprovalSchema>;

/** Server-side queue query params (page, pageSize, status, level). */
export const listApprovalsQuerySchema = z.object({
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
  status: z.enum(["PENDING", "APPROVED", "REJECTED"], {
    message: "status must be PENDING, APPROVED or REJECTED",
  }).optional(),
  level: z.enum(["MANAGER", "FINANCE"], {
    message: "level must be MANAGER or FINANCE",
  }).optional(),
});

export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;