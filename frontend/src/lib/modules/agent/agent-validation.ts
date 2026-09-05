import { z } from "zod";

export const runAgentSchema = z.object({
  prompt: z.string().trim().min(1, "prompt is required").max(1000, "prompt must be under 1000 characters"),
  quotationId: z.string().trim().min(1).max(64).optional().nullable(),
  confirmation: z
    .object({
      toolName: z.string().min(1),
      params: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
});

export type RunAgentInput = z.infer<typeof runAgentSchema>;

export const listAgentAuditQuerySchema = z.object({
  quotationId: z.string().trim().min(1).optional(),
});
