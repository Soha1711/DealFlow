import { z } from "zod";
import { type Role, Prisma } from "@prisma/client";
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
  backorderFulfillment,
  releaseBackorder,
} from "@/lib/modules/fulfillment/fulfillment-service";
import {
  createBillingFromQuotation,
} from "@/lib/modules/billing/billing-service";
import {
  getSubscription,
} from "@/lib/modules/billing/subscription-service";
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
} from "@/lib/modules/recommendations/recommendation-tools";
import {
  acceptNegotiation,
  counterNegotiation,
  rejectNegotiation,
} from "@/lib/modules/negotiations/negotiation-service";
import { sanitizeQuotationForCustomer } from "@/lib/modules/negotiations/negotiation-guards";
import {
  assertCanExecuteTool,
  TOOL_POLICIES,
  type AgentActor,
  type ToolClassification,
  type ToolImpactLevel,
  type ToolName,
} from "./tool-policy";
import { AgentExecutionError } from "./agent-errors";

export type ToolExecutionResult<TData = unknown> = {
  success: boolean;
  toolName: ToolName;
  data?: TData;
  error?: string;
  summary: string;
};

export interface AgentTool<TInput = Record<string, unknown>, TOutput = unknown> {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType<TInput>;
  outputSchema: z.ZodType<TOutput>;
  parameters: z.ZodType<TInput>; // alias for backwards compatibility
  classification: ToolClassification;
  requiredRoles: Role[];
  requiresConfirmation: boolean;
  domainService: string;
  auditInfo: {
    category: string;
    impactLevel: ToolImpactLevel;
    tags?: string[];
  };
  execute: (input: TInput, actor: AgentActor, confirmed?: boolean) => Promise<ToolExecutionResult<TOutput>>;
}

// ---------------------------------------------------------------------------
// 1. READ TOOLS
// ---------------------------------------------------------------------------

export const getQuotationTool: AgentTool<{ quotationId: string }> = {
  name: "getQuotation",
  description: "Inspect full quotation details, commercial lines, margins, status, and pricing totals.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getQuotation.allowedRoles,
  requiresConfirmation: false,
  domainService: "quotation-service.getQuotation",
  auditInfo: { category: "QUOTATION", impactLevel: "READ_ONLY", tags: ["quotation", "inspect"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getQuotation", quotationId: input.quotationId });
    const quote = await getQuotation(input.quotationId);
    if (!quote) {
      throw new AgentExecutionError(`Quotation ${input.quotationId} not found.`);
    }

    if (actor.role === "CUSTOMER") {
      const sanitized = sanitizeQuotationForCustomer(quote);
      return {
        success: true,
        toolName: "getQuotation",
        data: sanitized,
        summary: `Inspected quotation ${quote.quotationNumber} (Status: ${quote.status}, Total: $${Number(quote.total).toFixed(2)})`,
      };
    }

    const payload = {
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
    };

    return {
      success: true,
      toolName: "getQuotation",
      data: payload,
      summary: `Inspected quotation ${quote.quotationNumber}: Status ${quote.status}, Margin $${Number(quote.margin).toFixed(2)}, Total $${Number(quote.total).toFixed(2)}.`,
    };
  },
};

export const getCustomerTool: AgentTool<{
  customerId?: string;
  name?: string;
  email?: string;
}> = {
  name: "getCustomer",
  description: "Find and inspect customer profile, tier, and active quotations by name (e.g. 'Acme'), email, or id.",
  inputSchema: z.object({
    customerId: z.string().optional(),
    name: z.string().optional(),
    email: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getCustomer.allowedRoles,
  requiresConfirmation: false,
  domainService: "db.customer",
  auditInfo: { category: "CUSTOMER", impactLevel: "READ_ONLY", tags: ["customer", "search"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getCustomer" });

    // Look up customer
    const orConditions: Prisma.CustomerWhereInput[] = [];
    if (input.customerId) orConditions.push({ id: input.customerId });
    if (input.name) orConditions.push({ name: { contains: input.name, mode: "insensitive" } });
    if (input.email) orConditions.push({ email: { contains: input.email, mode: "insensitive" } });

    const customer = await db.customer.findFirst({
      where: orConditions.length > 0 ? { OR: orConditions } : undefined,
      include: {
        quotations: {
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            quotationNumber: true,
            status: true,
            total: true,
            riskLevel: true,
            riskScore: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    if (!customer) {
      return {
        success: false,
        toolName: "getCustomer",
        error: `Customer not found matching criteria: ${JSON.stringify(input)}`,
        summary: `Customer search returned 0 results.`,
      };
    }

    const activeQuotes = customer.quotations.filter(
      (q: { status: string }) => !["COMPLETED", "CANCELLED", "REJECTED"].includes(q.status)
    );

    return {
      success: true,
      toolName: "getCustomer",
      data: {
        customer: {
          id: customer.id,
          name: customer.name,
          email: customer.email,
          tier: customer.tier,
        },
        quotations: customer.quotations,
        activeQuotations: activeQuotes,
      },
      summary: `Identified customer ${customer.name} (${customer.tier} tier) with ${customer.quotations.length} total quotation(s) and ${activeQuotes.length} active deal(s).`,
    };
  },
};

export const getCustomerHistoryTool: AgentTool<{ customerId: string }> = {
  name: "getCustomerHistory",
  description: "Inspect customer's past purchases and category buying patterns.",
  inputSchema: z.object({
    customerId: z.string().min(1, "customerId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getCustomerHistory.allowedRoles,
  requiresConfirmation: false,
  domainService: "recommendation-tools.getCustomerHistory",
  auditInfo: { category: "CUSTOMER", impactLevel: "READ_ONLY", tags: ["customer", "history"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getCustomerHistory" });
    const history = await getCustomerHistory(input.customerId);
    const customer = await db.customer.findUnique({
      where: { id: input.customerId },
      select: { id: true, name: true, tier: true, email: true },
    });
    return {
      success: true,
      toolName: "getCustomerHistory",
      data: { customer, history },
      summary: `Customer ${customer?.name ?? input.customerId} (${customer?.tier ?? "STANDARD"} tier) has purchased ${history.productIds.length} unique products.`,
    };
  },
};

export const getDealHealthTool: AgentTool<{ quotationId: string }> = {
  name: "getDealHealth",
  description: "Inspect deal health score (0-100), risk anomalies, and category scores for a deal.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getDealHealth.allowedRoles,
  requiresConfirmation: false,
  domainService: "deal-health-service.getDealHealth",
  auditInfo: { category: "DEAL_HEALTH", impactLevel: "READ_ONLY", tags: ["deal_health", "score"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getDealHealth", quotationId: input.quotationId });
    const health = await getDealHealth(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "getDealHealth",
      data: health,
      summary: `Deal Health Score: ${health.score}/100 (${health.level}). Anomalies detected: ${health.anomalies.length}.`,
    };
  },
};

export const getDealHealthDetailsTool: AgentTool<{ quotationId: string; anomalyType?: string }> = {
  name: "getDealHealthDetails",
  description: "Inspect root-cause metrics for detected deal health anomalies (discount risk, inventory shortfall, margin dilution, velocity stall).",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
    anomalyType: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getDealHealthDetails.allowedRoles,
  requiresConfirmation: false,
  domainService: "deal-health-engine.evaluateDealHealth",
  auditInfo: { category: "DEAL_HEALTH", impactLevel: "READ_ONLY", tags: ["deal_health", "anomalies", "root_cause"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getDealHealthDetails", quotationId: input.quotationId });
    const health = await getDealHealth(input.quotationId, { userId: actor.userId, role: actor.role });

    const filteredAnomalies = input.anomalyType
      ? health.anomalies.filter((a) => a.code.toLowerCase().includes(input.anomalyType!.toLowerCase()) || a.title.toLowerCase().includes(input.anomalyType!.toLowerCase()))
      : health.anomalies;

    return {
      success: true,
      toolName: "getDealHealthDetails",
      data: {
        quotationId: health.quotationId,
        quotationNumber: health.quotationNumber,
        score: health.score,
        level: health.level,
        anomalies: filteredAnomalies,
        factors: health.factors,
        recommendations: health.recommendations,
        metrics: health.metrics,
      },
      summary: `Diagnosed ${filteredAnomalies.length} anomaly details for quotation ${health.quotationNumber} (Risk Level: ${health.level}).`,
    };
  },
};

export const getApprovalStatusTool: AgentTool<{ quotationId: string }> = {
  name: "getApprovalStatus",
  description: "Inspect approval tiers, routing status, and manager/finance review history for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getApprovalStatus.allowedRoles,
  requiresConfirmation: false,
  domainService: "approval-service.listApprovalsForQuotation",
  auditInfo: { category: "APPROVAL", impactLevel: "READ_ONLY", tags: ["approval", "status"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getApprovalStatus", quotationId: input.quotationId });
    const approvals = await listApprovalsForQuotation(input.quotationId);
    const quote = await db.quotation.findUnique({
      where: { id: input.quotationId },
      select: { status: true, requiredApprovalLevel: true, riskScore: true, riskLevel: true },
    });
    const pending = approvals.filter((a) => a.status === "PENDING");

    return {
      success: true,
      toolName: "getApprovalStatus",
      data: {
        quotationId: input.quotationId,
        quotationStatus: quote?.status ?? "UNKNOWN",
        requiredApprovalLevel: quote?.requiredApprovalLevel ?? null,
        riskLevel: quote?.riskLevel ?? "LOW",
        riskScore: quote?.riskScore ?? 0,
        approvals,
        pendingApprovals: pending,
        requiresHumanApproval: pending.length > 0,
      },
      summary: `Quotation status: ${quote?.status}. Approvals: ${approvals.length} total, ${pending.length} currently PENDING (${pending.map((p) => p.level).join(", ") || "None"}).`,
    };
  },
};

export const getInventoryTool: AgentTool<{
  quotationId?: string;
  productId?: string;
}> = {
  name: "getInventory",
  description: "Inspect warehouse stock levels and available vs reserved inventory for quotation lines or a product.",
  inputSchema: z.object({
    quotationId: z.string().optional(),
    productId: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getInventory.allowedRoles,
  requiresConfirmation: false,
  domainService: "db.inventory",
  auditInfo: { category: "INVENTORY", impactLevel: "READ_ONLY", tags: ["inventory", "stock"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({
      actor,
      toolName: "getInventory",
      quotationId: input.quotationId,
    });

    let productIds: string[] = [];
    let quotationLines: Array<{ id: string; productId: string; quantity: number; product: { name: string; sku: string } }> = [];

    if (input.quotationId) {
      const q = await db.quotation.findUnique({
        where: { id: input.quotationId },
        include: { lines: { include: { product: { select: { name: true, sku: true } } } } },
      });
      if (q) {
        quotationLines = q.lines;
        productIds = q.lines.map((l) => l.productId);
      }
    } else if (input.productId) {
      productIds = [input.productId];
    }

    const inventoryRecords = await db.inventory.findMany({
      where: productIds.length > 0 ? { productId: { in: productIds } } : {},
      include: { product: true, warehouse: true },
    });

    const items = productIds.map((pid) => {
      const line = quotationLines.find((l) => l.productId === pid);
      const invs = inventoryRecords.filter((r) => r.productId === pid);
      const totalQty = invs.reduce((sum, r) => sum + r.quantity, 0);
      const totalReserved = invs.reduce((sum, r) => sum + r.reservedQuantity, 0);
      const available = Math.max(0, totalQty - totalReserved);
      const requested = line ? line.quantity : 0;
      const shortage = requested > available;

      return {
        productId: pid,
        productName: line?.product.name ?? invs[0]?.product.name ?? "Product",
        sku: line?.product.sku ?? invs[0]?.product.sku ?? "",
        requestedQuantity: requested,
        availableQuantity: available,
        totalQuantity: totalQty,
        reservedQuantity: totalReserved,
        hasShortage: shortage,
        shortageAmount: shortage ? requested - available : 0,
        warehouseBreakdown: invs.map((r) => ({
          warehouseId: r.warehouseId,
          warehouseName: r.warehouse.name,
          quantity: r.quantity,
          reservedQuantity: r.reservedQuantity,
          available: Math.max(0, r.quantity - r.reservedQuantity),
        })),
      };
    });

    const hasAnyShortage = items.some((item) => item.hasShortage);
    const totalAvailable = items.reduce((sum, i) => sum + i.availableQuantity, 0);

    return {
      success: true,
      toolName: "getInventory",
      data: {
        items,
        totalAvailable,
        hasShortage: hasAnyShortage,
      },
      summary: `Inventory check complete for ${items.length} product(s). Total available stock: ${totalAvailable}. Shortage detected: ${hasAnyShortage ? "YES (Backorder required)" : "NO (All in stock)"}.`,
    };
  },
};

export const getFulfillmentTool: AgentTool<{ quotationId: string }> = {
  name: "getFulfillment",
  description: "Inspect fulfillment order status, line allocations, and backorders for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getFulfillment.allowedRoles,
  requiresConfirmation: false,
  domainService: "fulfillment-service.getFulfillmentForQuotation",
  auditInfo: { category: "FULFILLMENT", impactLevel: "READ_ONLY", tags: ["fulfillment", "allocations"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getFulfillment", quotationId: input.quotationId });
    const quote = await getQuotation(input.quotationId);
    if (!quote) throw new AgentExecutionError("Quotation not found.");

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

    const hasBackorders = Boolean(
      fulfillment?.lines.some((l) => l.backorderQuantity > 0 || l.status === "BACKORDERED")
    );
    const isFullyAllocated = Boolean(
      fulfillment &&
        fulfillment.lines.length > 0 &&
        fulfillment.lines.every((l) => l.allocatedQuantity >= l.requestedQuantity)
    );

    return {
      success: true,
      toolName: "getFulfillment",
      data: {
        fulfillment,
        lines: fulfillment?.lines ?? [],
        hasBackorders,
        isFullyAllocated,
      },
      summary: fulfillment
        ? `Fulfillment order ${fulfillment.id} (Status: ${fulfillment.status}, Lines: ${fulfillment.lines.length}, Backorders: ${hasBackorders ? "YES" : "NO"}).`
        : `No active fulfillment record yet for quotation ${quote.quotationNumber}.`,
    };
  },
};

export const getInvoiceTool: AgentTool<{ quotationId: string }> = {
  name: "getInvoice",
  description: "Inspect invoices, payment status, and recurring subscriptions for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getInvoice.allowedRoles,
  requiresConfirmation: false,
  domainService: "billing-service",
  auditInfo: { category: "BILLING", impactLevel: "READ_ONLY", tags: ["billing", "invoice"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getInvoice", quotationId: input.quotationId });
    const invoices = await db.invoice.findMany({
      where: { quotationId: input.quotationId },
      include: { payments: true, lines: true },
      orderBy: { createdAt: "desc" },
    });
    const subscriptions = await db.subscription.findMany({
      where: { quotationId: input.quotationId },
      include: { product: true, schedules: true },
    });

    const totalBilled = invoices.reduce((sum, i) => sum + Number(i.total), 0);
    const totalPaid = invoices.reduce(
      (sum, i) => sum + i.payments.reduce((pSum, p) => pSum + Number(p.amount), 0),
      0
    );
    const hasOverdue = invoices.some((i) => i.status === "OVERDUE");

    return {
      success: true,
      toolName: "getInvoice",
      data: {
        invoices,
        subscriptions,
        totalBilled,
        totalPaid,
        hasOverdue,
      },
      summary: `Quotation has ${invoices.length} invoice(s) (Total billed: $${totalBilled.toFixed(2)}, Paid: $${totalPaid.toFixed(2)}, Overdue: ${hasOverdue ? "YES" : "NO"}).`,
    };
  },
};

export const getSubscriptionTool: AgentTool<{
  subscriptionId?: string;
  quotationId?: string;
  customerId?: string;
}> = {
  name: "getSubscription",
  description: "Inspect customer recurring subscriptions, terms, and renewal cycles.",
  inputSchema: z.object({
    subscriptionId: z.string().optional(),
    quotationId: z.string().optional(),
    customerId: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getSubscription.allowedRoles,
  requiresConfirmation: false,
  domainService: "subscription-service.getSubscription",
  auditInfo: { category: "BILLING", impactLevel: "READ_ONLY", tags: ["subscription", "read"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getSubscription" });
    const billingActor = { userId: actor.userId, role: actor.role };
    if (input.subscriptionId) {
      const sub = await getSubscription(input.subscriptionId, billingActor);
      return {
        success: true,
        toolName: "getSubscription",
        data: sub,
        summary: `Retrieved subscription ${sub.id} (Status: ${sub.status}).`,
      };
    }
    const subs = await db.subscription.findMany({
      where: {
        ...(input.quotationId ? { quotationId: input.quotationId } : {}),
        ...(input.customerId ? { customerId: input.customerId } : {}),
      },
      include: { product: true, schedules: true },
    });
    return {
      success: true,
      toolName: "getSubscription",
      data: { subscriptions: subs },
      summary: `Found ${subs.length} subscription(s).`,
    };
  },
};

export const getNegotiationHistoryTool: AgentTool<{ quotationId: string }> = {
  name: "getNegotiationHistory",
  description: "Inspect customer negotiation threads, counter-proposals, and messages for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getNegotiationHistory.allowedRoles,
  requiresConfirmation: false,
  domainService: "db.quotationNegotiation",
  auditInfo: { category: "NEGOTIATION", impactLevel: "READ_ONLY", tags: ["negotiation", "history"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getNegotiationHistory", quotationId: input.quotationId });
    const negotiations = await db.quotationNegotiation.findMany({
      where: { quotationId: input.quotationId },
      include: { createdBy: { select: { name: true, email: true } }, actedBy: { select: { name: true } } },
      orderBy: { createdAt: "asc" },
    });

    const active = negotiations.find((n) => n.status === "PENDING" || n.status === "COUNTERED") ?? null;

    return {
      success: true,
      toolName: "getNegotiationHistory",
      data: {
        quotationId: input.quotationId,
        negotiations,
        activeNegotiation: active,
      },
      summary: `Quotation has ${negotiations.length} negotiation request(s). Active status: ${active ? active.status : "None"}.`,
    };
  },
};

export const getProductDetailsTool: AgentTool<{
  productId?: string;
  sku?: string;
}> = {
  name: "getProductDetails",
  description: "Inspect product catalog specifications, base price, cost, and max allowed discount.",
  inputSchema: z.object({
    productId: z.string().optional(),
    sku: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getProductDetails.allowedRoles,
  requiresConfirmation: false,
  domainService: "db.product",
  auditInfo: { category: "CATALOG", impactLevel: "READ_ONLY", tags: ["product", "catalog"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getProductDetails" });
    const orConditions: Prisma.ProductWhereInput[] = [];
    if (input.productId) orConditions.push({ id: input.productId });
    if (input.sku) orConditions.push({ sku: input.sku });

    const products = await db.product.findMany({
      where: orConditions.length > 0 ? { OR: orConditions } : undefined,
      include: { inventory: { include: { warehouse: true } } },
    });

    return {
      success: true,
      toolName: "getProductDetails",
      data: { products },
      summary: `Retrieved product details for ${products.length} product(s).`,
    };
  },
};

export const getRecommendationsTool: AgentTool<{ quotationId: string; limit?: number }> = {
  name: "getRecommendations",
  description: "Get product recommendations (upsells, cross-sells, alternatives) for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1, "quotationId is required"),
    limit: z.number().int().min(1).max(10).optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "READ",
  requiredRoles: TOOL_POLICIES.getRecommendations.allowedRoles,
  requiresConfirmation: false,
  domainService: "recommendation-service.getRecommendations",
  auditInfo: { category: "RECOMMENDATION", impactLevel: "READ_ONLY", tags: ["recommendation"] },
  execute: async (input, actor) => {
    await assertCanExecuteTool({ actor, toolName: "getRecommendations", quotationId: input.quotationId });
    const recs = await getRecommendations(
      input.quotationId,
      { role: actor.role, userId: actor.userId },
      { limit: input.limit ?? 3, useAi: false }
    );
    return {
      success: true,
      toolName: "getRecommendations",
      data: recs,
      summary: `Found ${recs.data?.length ?? 0} product recommendation(s) for quotation.`,
    };
  },
};

// ---------------------------------------------------------------------------
// 2. ACTION TOOLS
// ---------------------------------------------------------------------------

export const prepareQuotationTool: AgentTool<{
  customerId: string;
  lines: { productId: string; quantity: number; unitPrice: string; discountPercent?: number }[];
}> = {
  name: "prepareQuotation",
  description: "Create a new DRAFT quotation with priced line items.",
  inputSchema: z.object({
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
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.prepareQuotation.allowedRoles,
  requiresConfirmation: false,
  domainService: "quotation-service.createQuotation",
  auditInfo: { category: "QUOTATION", impactLevel: "SAFE_MUTATION", tags: ["quotation", "create"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "prepareQuotation", confirmed });
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
      toolName: "prepareQuotation",
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
  name: "addQuotationLine",
  description: "Add a line item to an existing DRAFT quotation and recompute pricing atomically.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
    productId: z.string().min(1),
    quantity: z.number().int().positive(),
    unitPrice: z.string().optional(),
    discountPercent: z.number().min(0).max(100).optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.addQuotationLine.allowedRoles,
  requiresConfirmation: false,
  domainService: "quotation-service.addQuotationLineToDraft",
  auditInfo: { category: "QUOTATION", impactLevel: "SAFE_MUTATION", tags: ["quotation", "add_line"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "addQuotationLine", quotationId: input.quotationId, confirmed });
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
      toolName: "addQuotationLine",
      data: quote,
      summary: `Added product to quotation ${quote.quotationNumber}. New subtotal: $${Number(quote.subtotal).toFixed(2)}, total: $${Number(quote.total).toFixed(2)}.`,
    };
  },
};

export const submitQuotationTool: AgentTool<{ quotationId: string }> = {
  name: "submitQuotation",
  description: "Submit a DRAFT quotation for automated discount-risk calculation and approval routing.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.submitQuotation.allowedRoles,
  requiresConfirmation: false,
  domainService: "quotation-service.submitQuotation",
  auditInfo: { category: "QUOTATION", impactLevel: "SAFE_MUTATION", tags: ["quotation", "submit"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "submitQuotation", quotationId: input.quotationId, confirmed });
    const quote = await submitQuotation(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "submitQuotation",
      data: quote,
      summary: `Submitted quotation ${quote.quotationNumber}. Status transitioned to ${quote.status} (Risk Level: ${quote.riskLevel}).`,
    };
  },
};

export const prepareApprovalTool: AgentTool<{ approvalId: string; reason?: string }> = {
  name: "prepareApproval",
  description: "Process a deal approval stage. Classified as HIGH_IMPACT requiring user confirmation.",
  inputSchema: z.object({
    approvalId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.prepareApproval.allowedRoles,
  requiresConfirmation: true,
  domainService: "approval-service.approveApproval",
  auditInfo: { category: "APPROVAL", impactLevel: "HIGH_IMPACT", tags: ["approval", "manager_signoff"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "prepareApproval",
      toolParams: { approvalId: input.approvalId, reason: input.reason },
      confirmed,
    });
    const outcome = await approveApproval(
      input.approvalId,
      { userId: actor.userId, role: actor.role }
    );
    return {
      success: true,
      toolName: "prepareApproval",
      data: outcome,
      summary: `Approved stage ${input.approvalId}. Next quotation status: ${outcome.nextQuotationStatus}.`,
    };
  },
};

export const approveDealTool: AgentTool<{ approvalId: string; reason?: string }> = {
  name: "approveDeal",
  description: "Approve a pending deal approval stage as an authorized Sales Manager or Finance reviewer.",
  inputSchema: z.object({
    approvalId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.approveDeal.allowedRoles,
  requiresConfirmation: true,
  domainService: "approval-service.approveApproval",
  auditInfo: { category: "APPROVAL", impactLevel: "HIGH_IMPACT", tags: ["approval", "approve"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "approveDeal",
      toolParams: { approvalId: input.approvalId, reason: input.reason },
      confirmed,
    });
    const outcome = await approveApproval(
      input.approvalId,
      { userId: actor.userId, role: actor.role }
    );
    return {
      success: true,
      toolName: "approveDeal",
      data: outcome,
      summary: `Approved stage ${input.approvalId}. Next quotation status: ${outcome.nextQuotationStatus}.`,
    };
  },
};

export const rejectDealTool: AgentTool<{ approvalId: string; reason?: string }> = {
  name: "rejectDeal",
  description: "Reject a pending deal approval stage as an authorized reviewer.",
  inputSchema: z.object({
    approvalId: z.string().min(1),
    reason: z.string().max(500).optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.rejectDeal.allowedRoles,
  requiresConfirmation: true,
  domainService: "approval-service.rejectApproval",
  auditInfo: { category: "APPROVAL", impactLevel: "HIGH_IMPACT", tags: ["approval", "reject"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "rejectDeal",
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
      toolName: "rejectDeal",
      data: outcome,
      summary: `Rejected approval stage ${input.approvalId}. Quotation transitioned to REJECTED.`,
    };
  },
};

export const allocateInventoryTool: AgentTool<{ fulfillmentId: string }> = {
  name: "allocateInventory",
  description: "Allocate available warehouse stock across active warehouses for a fulfillment order.",
  inputSchema: z.object({
    fulfillmentId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.allocateInventory.allowedRoles,
  requiresConfirmation: false,
  domainService: "fulfillment-service.allocateFulfillment",
  auditInfo: { category: "FULFILLMENT", impactLevel: "SAFE_MUTATION", tags: ["fulfillment", "allocate"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "allocateInventory", confirmed });
    const fulfillment = await allocateFulfillment(input.fulfillmentId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "allocateInventory",
      data: fulfillment,
      summary: `Allocated inventory for fulfillment ${fulfillment?.id}. Current status: ${fulfillment?.status}.`,
    };
  },
};

export const createBackorderTool: AgentTool<{ fulfillmentId: string; reason?: string }> = {
  name: "createBackorder",
  description: "Explicitly mark unallocated fulfillment lines as backordered to prevent operational stalls.",
  inputSchema: z.object({
    fulfillmentId: z.string().min(1),
    reason: z.string().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.createBackorder.allowedRoles,
  requiresConfirmation: false,
  domainService: "fulfillment-service.backorderFulfillment",
  auditInfo: { category: "FULFILLMENT", impactLevel: "SAFE_MUTATION", tags: ["fulfillment", "backorder"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "createBackorder", confirmed });
    const fulfillment = await backorderFulfillment(input.fulfillmentId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "createBackorder",
      data: fulfillment,
      summary: `Created backorder for fulfillment ${fulfillment?.id}. Current status: ${fulfillment?.status}.`,
    };
  },
};

export const releaseBackorderTool: AgentTool<{ fulfillmentId: string }> = {
  name: "releaseBackorder",
  description: "Release pending backorders for a fulfillment order when warehouse inventory arrives.",
  inputSchema: z.object({
    fulfillmentId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.releaseBackorder.allowedRoles,
  requiresConfirmation: false,
  domainService: "fulfillment-service.releaseBackorder",
  auditInfo: { category: "FULFILLMENT", impactLevel: "SAFE_MUTATION", tags: ["fulfillment", "backorder", "release"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "releaseBackorder", confirmed });
    const result = await releaseBackorder(input.fulfillmentId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "releaseBackorder",
      data: result,
      summary: `Released backorders for fulfillment ${input.fulfillmentId}. Current status: ${result.status}.`,
    };
  },
};

export const prepareInvoiceTool: AgentTool<{ quotationId: string }> = {
  name: "prepareInvoice",
  description: "Prepare and generate commercial invoices for an accepted quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.prepareInvoice.allowedRoles,
  requiresConfirmation: false,
  domainService: "billing-service.createBillingFromQuotation",
  auditInfo: { category: "BILLING", impactLevel: "SAFE_MUTATION", tags: ["billing", "invoice", "prepare"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "prepareInvoice", quotationId: input.quotationId, confirmed });
    const result = await createBillingFromQuotation(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "prepareInvoice",
      data: result,
      summary: `Prepared invoices for quotation ${input.quotationId}: One-time invoice: ${result.oneTimeInvoice ? result.oneTimeInvoice.invoiceNumber : "None"}, Subscriptions: ${result.subscriptions.length}.`,
    };
  },
};

export const createBillingScheduleTool: AgentTool<{ quotationId: string }> = {
  name: "createBillingSchedule",
  description: "Create recurring billing schedules and one-time invoices for a quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.createBillingSchedule.allowedRoles,
  requiresConfirmation: false,
  domainService: "billing-service.createBillingFromQuotation",
  auditInfo: { category: "BILLING", impactLevel: "SAFE_MUTATION", tags: ["billing", "schedule", "create"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "createBillingSchedule", quotationId: input.quotationId, confirmed });
    const result = await createBillingFromQuotation(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "createBillingSchedule",
      data: result,
      summary: `Billing schedule created for quotation ${input.quotationId}. Recurring items: ${result.subscriptions.length}.`,
    };
  },
};

export const respondToNegotiationTool: AgentTool<{
  negotiationId: string;
  action: "accept" | "counter" | "reject";
  responseMessage?: string;
  counterUnitPrice?: string;
  counterQuantity?: number;
}> = {
  name: "respondToNegotiation",
  description: "Respond to customer negotiation counter-offer (accept, counter, or reject).",
  inputSchema: z.object({
    negotiationId: z.string().min(1),
    action: z.enum(["accept", "counter", "reject"]),
    responseMessage: z.string().max(1000).optional(),
    counterUnitPrice: z.string().optional(),
    counterQuantity: z.number().int().positive().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.respondToNegotiation.allowedRoles,
  requiresConfirmation: true,
  domainService: "negotiation-service",
  auditInfo: { category: "NEGOTIATION", impactLevel: "HIGH_IMPACT", tags: ["negotiation", "respond"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({
      actor,
      toolName: "respondToNegotiation",
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
      toolName: "respondToNegotiation",
      data: result,
      summary: `Responded to negotiation ${input.negotiationId} with action '${input.action}'.`,
    };
  },
};

export const startFulfillmentTool: AgentTool<{ quotationId: string }> = {
  name: "startFulfillment",
  description: "Initialize warehouse fulfillment for an APPROVED or CONFIRMED quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.startFulfillment.allowedRoles,
  requiresConfirmation: false,
  domainService: "fulfillment-service.createFulfillment",
  auditInfo: { category: "FULFILLMENT", impactLevel: "SAFE_MUTATION", tags: ["fulfillment", "start"] },
  execute: async (input, actor, confirmed) => {
    await assertCanExecuteTool({ actor, toolName: "startFulfillment", quotationId: input.quotationId, confirmed });
    const fulfillment = await createFulfillment(input.quotationId, { userId: actor.userId, role: actor.role });
    return {
      success: true,
      toolName: "startFulfillment",
      data: fulfillment,
      summary: `Created fulfillment order ${fulfillment.id} (Status: ${fulfillment.status}).`,
    };
  },
};

export const generateBillingTool: AgentTool<{ quotationId: string }> = {
  name: "generate_billing",
  description: "Generate atomic hybrid invoices and recurring subscriptions from a billable quotation.",
  inputSchema: z.object({
    quotationId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.generate_billing.allowedRoles,
  requiresConfirmation: false,
  domainService: "billing-service.createBillingFromQuotation",
  auditInfo: { category: "BILLING", impactLevel: "SAFE_MUTATION", tags: ["billing", "generate"] },
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
  inputSchema: z.object({
    invoiceId: z.string().min(1),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.issue_invoice.allowedRoles,
  requiresConfirmation: true,
  domainService: "billing-service.issueInvoice",
  auditInfo: { category: "BILLING", impactLevel: "HIGH_IMPACT", tags: ["billing", "issue"] },
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
  inputSchema: z.object({
    negotiationId: z.string().min(1),
    action: z.enum(["accept", "counter", "reject"]),
    responseMessage: z.string().max(1000).optional(),
    counterUnitPrice: z.string().optional(),
    counterQuantity: z.number().int().positive().optional(),
  }),
  outputSchema: z.any(),
  get parameters() {
    return this.inputSchema;
  },
  classification: "ACTION",
  requiredRoles: TOOL_POLICIES.respond_negotiation.allowedRoles,
  requiresConfirmation: true,
  domainService: "negotiation-service",
  auditInfo: { category: "NEGOTIATION", impactLevel: "HIGH_IMPACT", tags: ["negotiation", "respond"] },
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
// Backward-Compatibility Aliases
// ---------------------------------------------------------------------------

function createAliasTool<TInput, TOutput>(
  baseTool: AgentTool<TInput, TOutput>,
  aliasName: ToolName
): AgentTool<TInput, TOutput> {
  return {
    ...baseTool,
    name: aliasName,
    execute: async (input, actor, confirmed) => {
      const res = await baseTool.execute(input, actor, confirmed);
      return {
        ...res,
        toolName: aliasName,
      };
    },
  };
}

export const inspectQuotationTool = createAliasTool(getQuotationTool, "inspect_quotation");
export const inspectDealHealthTool = createAliasTool(getDealHealthTool, "inspect_deal_health");
export const inspectCustomerHistoryTool = createAliasTool(getCustomerHistoryTool, "inspect_customer_history");
export const inspectRecommendationsTool = createAliasTool(getRecommendationsTool, "inspect_recommendations");
export const inspectInventoryFulfillmentTool = createAliasTool(getFulfillmentTool, "inspect_inventory_fulfillment");
export const inspectBillingStatusTool = createAliasTool(getInvoiceTool, "inspect_billing_status");
export const inspectApprovalsTool = createAliasTool(getApprovalStatusTool, "inspect_approvals");
export const inspectNegotiationsTool = createAliasTool(getNegotiationHistoryTool, "inspect_negotiations");
export const createQuotationTool = createAliasTool(prepareQuotationTool, "create_quotation");
export const addQuotationLineLegacyTool = createAliasTool(addQuotationLineTool, "add_quotation_line");
export const submitQuotationLegacyTool = createAliasTool(submitQuotationTool, "submit_quotation");
export const approveDealLegacyTool = createAliasTool(approveDealTool, "approve_deal");
export const rejectDealLegacyTool = createAliasTool(rejectDealTool, "reject_deal");
export const startFulfillmentLegacyTool = createAliasTool(startFulfillmentTool, "start_fulfillment");
export const allocateInventoryLegacyTool = createAliasTool(allocateInventoryTool, "allocate_inventory");

// ---------------------------------------------------------------------------
// Complete Registry Map
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const AGENT_TOOL_REGISTRY: Record<ToolName, AgentTool<any, any>> = {
  // Canonical names (Section 6)
  getQuotation: getQuotationTool,
  getCustomer: getCustomerTool,
  getCustomerHistory: getCustomerHistoryTool,
  getDealHealth: getDealHealthTool,
  getDealHealthDetails: getDealHealthDetailsTool,
  getApprovalStatus: getApprovalStatusTool,
  getInventory: getInventoryTool,
  getFulfillment: getFulfillmentTool,
  getInvoice: getInvoiceTool,
  getSubscription: getSubscriptionTool,
  getNegotiationHistory: getNegotiationHistoryTool,
  getProductDetails: getProductDetailsTool,
  getRecommendations: getRecommendationsTool,
  prepareQuotation: prepareQuotationTool,
  addQuotationLine: addQuotationLineTool,
  submitQuotation: submitQuotationTool,
  prepareApproval: prepareApprovalTool,
  approveDeal: approveDealTool,
  rejectDeal: rejectDealTool,
  allocateInventory: allocateInventoryTool,
  createBackorder: createBackorderTool,
  releaseBackorder: releaseBackorderTool,
  prepareInvoice: prepareInvoiceTool,
  createBillingSchedule: createBillingScheduleTool,
  respondToNegotiation: respondToNegotiationTool,
  startFulfillment: startFulfillmentTool,

  // Legacy aliases (Backward compatibility)
  inspect_quotation: inspectQuotationTool,
  inspect_deal_health: inspectDealHealthTool,
  inspect_customer_history: inspectCustomerHistoryTool,
  inspect_recommendations: inspectRecommendationsTool,
  inspect_inventory_fulfillment: inspectInventoryFulfillmentTool,
  inspect_billing_status: inspectBillingStatusTool,
  inspect_approvals: inspectApprovalsTool,
  inspect_negotiations: inspectNegotiationsTool,
  create_quotation: createQuotationTool,
  add_quotation_line: addQuotationLineLegacyTool,
  submit_quotation: submitQuotationLegacyTool,
  approve_deal: approveDealLegacyTool,
  reject_deal: rejectDealLegacyTool,
  start_fulfillment: startFulfillmentLegacyTool,
  allocate_inventory: allocateInventoryLegacyTool,
  generate_billing: generateBillingTool,
  issue_invoice: issueInvoiceTool,
  respond_negotiation: respondNegotiationTool,
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getTool(name: ToolName): AgentTool<any, any> | undefined {
  return AGENT_TOOL_REGISTRY[name];
}
