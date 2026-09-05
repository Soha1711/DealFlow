import { z } from "zod";
import { db } from "@/lib/db";
import {
  createQuotation,
  getQuotation,
  submitQuotation,
  addQuotationLineToDraft,
} from "@/lib/modules/quotations/quotation-service";
import {
  approveApproval,
  rejectApproval,
  listApprovalsForQuotation,
} from "@/lib/modules/approvals/approval-service";
import {
  createFulfillment,
  allocateFulfillment,
} from "@/lib/modules/fulfillment/fulfillment-service";
import {
  createBillingFromQuotation,
} from "@/lib/modules/billing/billing-service";
import {
  issueInvoice,
} from "@/lib/modules/billing/invoice-service";
import {
  getDealHealth,
} from "@/lib/modules/deal-health/deal-health-service";
import {
  getRecommendations,
} from "@/lib/modules/recommendations/recommendation-service";
import {
  getCustomerHistory,
  getInventorySnapshot,
} from "@/lib/modules/recommendations/recommendation-tools";
import {
  acceptNegotiation,
  counterNegotiation,
  rejectNegotiation,
} from "@/lib/modules/negotiations/negotiation-service";
import { sanitizeQuotationForCustomer } from "@/lib/modules/negotiations/negotiation-guards";
import { assertCanExecuteTool, type AgentActor, type ToolName } from "./tool-policy";
import { AgentExecutionError } from "./agent-errors";

export type ToolExecutionResult = {
  success: boolean;
  toolName: ToolName;
  data?: unknown;
  error?: string;
  summary: string;
};

export interface AgentTool<TInput = Record<string, unknown>> {
  name: ToolName;
  description: string;
  parameters: z.ZodType<TInput>;
  execute: (input: TInput, actor: AgentActor, confirmed?: boolean) => Promise<ToolExecutionResult>;
}

// ---------------------------------------------------------------------------
// Tool Definitions
// ---------------------------------------------------------------------------

export const inspectQuotationTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_quotation",
  description: "Inspect full quotation details, status, line items, and pricing totals.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_quotation", quotationId: input.quotationId });
    const quote = await getQuotation(input.quotationId);
    if (!quote) {
      throw new AgentExecutionError(`Quotation ${input.quotationId} not found.`);
    }

    if (actor.role === "CUSTOMER") {
      const sanitized = sanitizeQuotationForCustomer(quote);
      return {
        success: true,
        toolName: "inspect_quotation",
        data: sanitized,
        summary: `Inspected quotation ${quote.quotationNumber} (Status: ${quote.status}, Total: $${Number(quote.total).toFixed(2)})`,
      };
    }

    return {
      success: true,
      toolName: "inspect_quotation",
      data: {
        id: quote.id,
        quotationNumber: quote.quotationNumber,
        status: quote.status,
        customer: quote.customer,
        salesRep: quote.salesRep,
        subtotal: Number(quote.subtotal),
        discountTotal: Number(quote.discountTotal),
        total: Number(quote.total),
        margin: Number(quote.margin),
        riskLevel: quote.riskLevel,
        riskScore: quote.riskScore,
        requiredApprovalLevel: quote.requiredApprovalLevel,
        lines: quote.lines.map((l) => ({
          id: l.id,
          productId: l.productId,
          productName: l.product.name,
          sku: l.product.sku,
          quantity: l.quantity,
          unitPrice: Number(l.unitPrice),
          discountPercent: l.discountPercent,
          lineTotal: Number(l.lineTotal),
          margin: Number(l.margin),
          isRecurring: l.isRecurring,
        })),
      },
      summary: `Inspected quotation ${quote.quotationNumber}: Status ${quote.status}, Margin $${Number(quote.margin).toFixed(2)}, Total $${Number(quote.total).toFixed(2)}.`,
    };
  },
};

export const inspectDealHealthTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_deal_health",
  description: "Inspect deal health score (0-100), risk anomalies, and category scores for a deal.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_deal_health", quotationId: input.quotationId });
    const health = await getDealHealth(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "inspect_deal_health",
      data: health,
      summary: `Deal Health Score: ${health.score}/100 (${health.level}). Anomalies detected: ${health.anomalies.length}.`,
    };
  },
};

export const inspectCustomerHistoryTool: AgentTool<{ customerId: string }> = {
  name: "inspect_customer_history",
  description: "Inspect customer's past purchases and category buying patterns.",
  parameters: z.object({
    customerId: z.string().min(1, "customerId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_customer_history" });
    const history = await getCustomerHistory(input.customerId);
    const customer = await db.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, tier: true, email: true },
    });
    return {
      success: true,
      toolName: "inspect_customer_history",
      data: { customer, history },
      summary: `Customer ${customer?.name ?? input.customerId} (${customer?.tier ?? "STANDARD"} tier) has purchased ${history.productIds.length} unique products.`,
    };
  },
};

export const inspectRecommendationsTool: AgentTool<{ quotationId: string; limit?: number }> = {
  name: "inspect_recommendations",
  description: "Get product recommendations (upsells, cross-sells, alternatives) for a quotation.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_recommendations", quotationId: input.quotationId });
    const recs = await getRecommendations(
      input.quotationId,
      { role: actor.role, userId: actor.userId },
      { limit: input.limit ?? 3, useAi: false }
    );
    return {
      success: true,
      toolName: "inspect_recommendations",
      data: recs,
      summary: `Found ${recs.data?.length ?? 0} product recommendation(s) for quotation.`,
    };
  },
};

export const inspectInventoryFulfillmentTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_inventory_fulfillment",
  description: "Inspect inventory levels, warehouse stock, and fulfillment status for a quotation.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_inventory_fulfillment", quotationId: input.quotationId });
    const quote = await getQuotation(input.quotationId);
    if (!quote) throw new AgentExecutionError("Quotation not found.");

    const stockSnapshot = await getInventorySnapshot();

    const fulfillment = await db.fulfillment.findFirst({
      where: { quotationId: input.quotationId, status: { not: "CANCELLED" } },
      include: {
        lines: {
          include: {
            product: { select: { name: true, sku: true } },
            allocations: { include: { inventory: { include: { warehouse: true } } } },
          },
        },
      },
    });

    return {
      success: true,
      toolName: "inspect_inventory_fulfillment",
      data: { fulfillment, stockSnapshot },
      summary: fulfillment
        ? `Fulfillment status is ${fulfillment.status} with ${fulfillment.lines.length} physical line(s).`
        : `No active fulfillment record yet. Available warehouse stock checked for ${quote.lines.length} item(s).`,
    };
  },
};

export const inspectBillingStatusTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_billing_status",
  description: "Inspect invoices, payment status, and recurring subscriptions for a quotation.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_billing_status", quotationId: input.quotationId });
    const invoices = await db.invoice.findMany({
      where: { quotationId: input.quotationId },
      include: { payments: true, lines: true },
      orderBy: { createdAt: "desc" },
    });
    const subscriptions = await db.subscription.findMany({
      where: { quotationId: input.quotationId },
      include: { product: true, schedules: true },
    });

    return {
      success: true,
      toolName: "inspect_billing_status",
      data: { invoices, subscriptions },
      summary: `Quotation has ${invoices.length} invoice(s) and ${subscriptions.length} active recurring subscription(s).`,
    };
  },
};

export const inspectApprovalsTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_approvals",
  description: "Inspect approvals history and current pending approval stages for a quotation.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_approvals", quotationId: input.quotationId });
    const approvals = await listApprovalsForQuotation(input.quotationId);
    const pending = approvals.filter((a) => a.status === "PENDING");
    return {
      success: true,
      toolName: "inspect_approvals",
      data: approvals,
      summary: `Quotation has ${approvals.length} approval record(s); ${pending.length} currently PENDING.`,
    };
  },
};

export const inspectNegotiationsTool: AgentTool<{ quotationId: string }> = {
  name: "inspect_negotiations",
  description: "Inspect customer negotiation threads, counter-proposals, and messages for a quotation.",
  parameters: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "inspect_negotiations", quotationId: input.quotationId });
    const negotiations = await db.quotationNegotiation.findMany({
      where: { quotationId: input.quotationId },
      include: { createdBy: { select: { name: true, email: true } }, actedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });
    return {
      success: true,
      toolName: "inspect_negotiations",
      data: negotiations,
      summary: `Quotation has ${negotiations.length} negotiation request(s).`,
    };
  },
};

export const createQuotationTool: AgentTool<{
  customerId: string;
  lines: { productId: string; quantity: number; unitPrice: string; discountPercent?: number }[];
}> = {
  name: "create_quotation",
  description: "Create a new DRAFT quotation with priced line items.",
  parameters: z.object({
    customerId: z.string().min(1, "customerId is required"),
    lines: z.array(
      z.object({
        productId: z.string().min(1),
        quantity: z.number().int().positive(),
        unitPrice: z.string().min(1),
        discountPercent: z.number().min(0).max(100).optional(),
      })
    ).min(1, "At least one line item is required"),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "create_quotation", confirmed });
    const quote = await createQuotation({
      salesRepId: actor.userId,
      customerId: input.customerId,
      lines: input.lines.map((l) => ({
        productId: l.productId,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        discountPercent: l.discountPercent ?? 0,
      })),
    });
    return {
      success: true,
      toolName: "create_quotation",
      data: quote,
      summary: `Successfully created DRAFT quotation ${quote.quotationNumber} with total $${Number(quote.total).toFixed(2)}.`,
    };
  },
};

export const addQuotationLineTool: AgentTool<{
  quotationId: string;
  productId: string;
  quantity: number;
  unitPrice?: string;
  discountPercent?: number;
}> = {
  name: "add_quotation_line",
  description: "Add a line item to an existing DRAFT quotation and recompute pricing atomically.",
  parameters: z.object({
    quotationId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.string().optional(),
    discountPercent: z.number().min(0).max(100).optional(),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "add_quotation_line", quotationId: input.quotationId, confirmed });
    const quote = await addQuotationLineToDraft(
      input.quotationId,
      { userId: actor.userId, role: actor.role },
      {
        productId: input.productId,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        discountPercent: input.discountPercent,
      }
    );
    return {
      success: true,
      toolName: "add_quotation_line",
      data: quote,
      summary: `Added product to quotation ${quote.quotationNumber}. New subtotal: $${Number(quote.subtotal).toFixed(2)}, total: $${Number(quote.total).toFixed(2)}.`,
    };
  },
};

export const submitQuotationTool: AgentTool<{ quotationId: string }> = {
  name: "submit_quotation",
  description: "Submit a DRAFT quotation for automated discount-risk calculation and approval routing.",
  parameters: z.object({
    quotationId: z.string().min(1),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "submit_quotation", quotationId: input.quotationId, confirmed });
    const quote = await submitQuotation(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "submit_quotation",
      data: quote,
      summary: `Submitted quotation ${quote.quotationNumber}. Status transitioned to ${quote.status} (Risk Level: ${quote.riskLevel}).`,
    };
  },
};

export const approveDealTool: AgentTool<{ approvalId: string; reason?: string }> = {
  name: "approve_deal",
  description: "Approve a pending deal approval stage as an authorized Sales Manager or Finance reviewer.",
  parameters: z.object({
    approvalId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "approve_deal",
      toolParams: { approvalId: input.approvalId, reason: input.reason },
      confirmed,
    });
    const outcome = await approveApproval(
      input.approvalId,
      { userId: actor.userId, role: actor.role }
    );
    return {
      success: true,
      toolName: "approve_deal",
      data: outcome,
      summary: `Approved stage ${input.approvalId}. Next quotation status: ${outcome.nextQuotationStatus}.`,
    };
  },
};

export const rejectDealTool: AgentTool<{ approvalId: string; reason?: string }> = {
  name: "reject_deal",
  description: "Reject a pending deal approval stage as an authorized reviewer.",
  parameters: z.object({
    approvalId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "reject_deal",
      toolParams: { approvalId: input.approvalId, reason: input.reason },
      confirmed,
    });
    const outcome = await rejectApproval(
      input.approvalId,
      { userId: actor.userId, role: actor.role },
      input.reason ?? "Rejected by reviewer"
    );
    return {
      success: true,
      toolName: "reject_deal",
      data: outcome,
      summary: `Rejected approval stage ${input.approvalId}. Quotation transitioned to REJECTED.`,
    };
  },
};

export const startFulfillmentTool: AgentTool<{ quotationId: string }> = {
  name: "start_fulfillment",
  description: "Initialize warehouse fulfillment for an APPROVED or CONFIRMED quotation.",
  parameters: z.object({
    quotationId: z.string().min(1),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "start_fulfillment", quotationId: input.quotationId, confirmed });
    const fulfillment = await createFulfillment(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "start_fulfillment",
      data: fulfillment,
      summary: `Created fulfillment order ${fulfillment.id} (Status: ${fulfillment.status}).`,
    };
  },
};

export const allocateInventoryTool: AgentTool<{ fulfillmentId: string }> = {
  name: "allocate_inventory",
  description: "Allocate stock across warehouses for an active fulfillment order.",
  parameters: z.object({
    fulfillmentId: z.string().min(1),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "allocate_inventory", confirmed });
    const fulfillment = await allocateFulfillment(input.fulfillmentId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "allocate_inventory",
      data: fulfillment,
      summary: `Allocated inventory for fulfillment ${fulfillment?.id}. Current status: ${fulfillment?.status}.`,
    };
  },
};

export const generateBillingTool: AgentTool<{ quotationId: string }> = {
  name: "generate_billing",
  description: "Generate atomic hybrid invoices and recurring subscriptions from a billable quotation.",
  parameters: z.object({
    quotationId: z.string().min(1),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "generate_billing", quotationId: input.quotationId, confirmed });
    const result = await createBillingFromQuotation(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "generate_billing",
      data: result,
      summary: `Billing generated successfully: Type ${result.type}, Invoices created: ${result.oneTimeInvoice ? 1 : 0}, Subscriptions: ${result.subscriptions.length}.`,
    };
  },
};

export const issueInvoiceTool: AgentTool<{ invoiceId: string }> = {
  name: "issue_invoice",
  description: "Transition a draft invoice to ISSUED and lock payment due dates.",
  parameters: z.object({
    invoiceId: z.string().min(1),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "issue_invoice",
      toolParams: { invoiceId: input.invoiceId },
      confirmed,
    });
    const updated = await issueInvoice(input.invoiceId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "issue_invoice",
      data: updated,
      summary: `Issued invoice ${updated.invoiceNumber} with due date ${updated.dueDate?.toISOString().slice(0, 10)}.`,
    };
  },
};

export const respondNegotiationTool: AgentTool<{
  negotiationId: string;
  action: "accept" | "counter" | "reject";
  responseMessage?: string;
  counterUnitPrice?: string;
  counterQuantity?: number;
}> = {
  name: "respond_negotiation",
  description: "Respond to customer negotiation counter-offer (accept, counter, or reject).",
  parameters: z.object({
    negotiationId: z.string().min(1),
    action: z.enum(["accept", "counter", "reject"]),
    responseMessage: z.string().max(1000).optional(),
    counterUnitPrice: z.string().optional(),
    counterQuantity: z.number().int().positive().optional(),
  }),
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "respond_negotiation",
      toolParams: input,
      confirmed,
    });
    const context = { userId: actor.userId, role: actor.role };
    let result: unknown;
    if (input.action === "accept") {
      result = await acceptNegotiation(input.negotiationId, context, {
        message: input.responseMessage,
      });
    } else if (input.action === "counter") {
      result = await counterNegotiation(input.negotiationId, context, {
        message: input.responseMessage ?? "Counter-offer proposed",
      });
    } else {
      result = await rejectNegotiation(input.negotiationId, context, {
        reason: input.responseMessage ?? "Counter-offer rejected",
      });
    }

    return {
      success: true,
      toolName: "respond_negotiation",
      data: result,
      summary: `Responded to negotiation ${input.negotiationId} with action '${input.action}'.`,
    };
  },
};

// ---------------------------------------------------------------------------
// Tool Registry Map
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AGENT_TOOL_REGISTRY: Record<ToolName, AgentTool<any>> = {
  inspect_quotation: inspectQuotationTool,
  inspect_deal_health: inspectDealHealthTool,
  inspect_customer_history: inspectCustomerHistoryTool,
  inspect_recommendations: inspectRecommendationsTool,
  inspect_inventory_fulfillment: inspectInventoryFulfillmentTool,
  inspect_billing_status: inspectBillingStatusTool,
  inspect_approvals: inspectApprovalsTool,
  inspect_negotiations: inspectNegotiationsTool,
  create_quotation: createQuotationTool,
  add_quotation_line: addQuotationLineTool,
  submit_quotation: submitQuotationTool,
  approve_deal: approveDealTool,
  reject_deal: rejectDealTool,
  start_fulfillment: startFulfillmentTool,
  allocate_inventory: allocateInventoryTool,
  generate_billing: generateBillingTool,
  issue_invoice: issueInvoiceTool,
  respond_negotiation: respondNegotiationTool,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTool(name: ToolName): AgentTool<any> | undefined {
  return AGENT_TOOL_REGISTRY[name];
}
