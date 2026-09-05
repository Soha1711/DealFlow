import { db } from "@/lib/db";
import type { AgentActor, ToolName } from "./tool-policy";

export type PlannedStep = {
  toolName: ToolName;
  description: string;
  params: Record<string, unknown>;
  requiresConfirmation?: boolean;
};

export type AgentPlan = {
  intent: string;
  quotationId: string | null;
  quotationNumber?: string | null;
  rationale: string;
  steps: PlannedStep[];
};

/**
 * Extracts a quotation number (e.g. Q-1001, Q-1007, or UUID) from a natural language prompt.
 */
export async function resolveQuotationFromPrompt(
  prompt: string,
  quotationId?: string | null,
  actor?: AgentActor
): Promise<{ id: string; quotationNumber: string } | null> {
  if (quotationId) {
    const q = await db.quotation.findUnique({
      where: { id: quotationId },
      select: { id: true, quotationNumber: true },
    });
    if (q) return q;
  }

  // Regex match for Q-xxxx
  const match = prompt.match(/\b(Q-\d{4,6})\b/i);
  if (match) {
    const num = match[1].toUpperCase();
    const q = await db.quotation.findUnique({
      where: { quotationNumber: num },
      select: { id: true, quotationNumber: true },
    });
    if (q) return q;
  }

  // Fallback: If caller is Sales Rep, find their most recently updated quotation
  if (actor?.role === "SALES_REP") {
    const latest = await db.quotation.findFirst({
      where: { salesRepId: actor.userId },
      orderBy: { updatedAt: "desc" },
      select: { id: true, quotationNumber: true },
    });
    if (latest) return latest;
  }

  // Fallback for Operations or Finance: find latest active quotation
  if (actor?.role === "OPERATIONS" || actor?.role === "FINANCE" || actor?.role === "ADMIN" || actor?.role === "SALES_MANAGER") {
    const latest = await db.quotation.findFirst({
      orderBy: { updatedAt: "desc" },
      select: { id: true, quotationNumber: true },
    });
    if (latest) return latest;
  }

  return null;
}

/**
 * Deterministic, autonomous multi-step planner.
 * Deconstructs the user task into a structured sequence of controlled tool executions.
 */
export async function planAgentTask(options: {
  prompt: string;
  quotationId?: string | null;
  actor: AgentActor;
}): Promise<AgentPlan> {
  const p = options.prompt.toLowerCase();
  const target = await resolveQuotationFromPrompt(options.prompt, options.quotationId, options.actor);
  const qId = target?.id ?? options.quotationId ?? null;
  const qNum = target?.quotationNumber ?? "Unknown";

  // Intent 1: Fulfillment resolution / warehouse allocation
  if (p.includes("fulfill") || p.includes("warehouse") || p.includes("inventory") || p.includes("stock") || p.includes("backorder")) {
    if (!qId) {
      return {
        intent: "RESOLVE_FULFILLMENT",
        quotationId: null,
        rationale: "Cannot resolve fulfillment without a target quotation.",
        steps: [],
      };
    }

    return {
      intent: "RESOLVE_FULFILLMENT",
      quotationId: qId,
      quotationNumber: qNum,
      rationale: `Inspect warehouse stock, initialize fulfillment for quotation ${qNum}, and allocate available inventory.`,
      steps: [
        {
          toolName: "inspect_quotation",
          description: `Verify quotation ${qNum} commercial lines and approval status`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_inventory_fulfillment",
          description: `Check existing inventory reservations and fulfillment records for quotation ${qNum}`,
          params: { quotationId: qId },
        },
        {
          toolName: "start_fulfillment",
          description: `Create fulfillment order for quotation ${qNum} if ready`,
          params: { quotationId: qId },
        },
        {
          toolName: "allocate_inventory",
          description: `Allocate multi-warehouse stock for the active fulfillment order`,
          params: { fulfillmentId: "DYNAMIC_FROM_PREVIOUS_STEP" },
        },
        {
          toolName: "inspect_inventory_fulfillment",
          description: `Verify final inventory allocation and backorder states`,
          params: { quotationId: qId },
        },
      ],
    };
  }

  // Intent 2: Billing preparation / hybrid invoicing
  if (p.includes("bill") || p.includes("invoice") || p.includes("subscription") || p.includes("payment")) {
    if (!qId) {
      return {
        intent: "PREPARE_BILLING",
        quotationId: null,
        rationale: "Cannot prepare billing without a target quotation.",
        steps: [],
      };
    }

    return {
      intent: "PREPARE_BILLING",
      quotationId: qId,
      quotationNumber: qNum,
      rationale: `Inspect approved quotation ${qNum}, generate atomic invoices and recurring subscriptions, and verify billing schedules.`,
      steps: [
        {
          toolName: "inspect_quotation",
          description: `Verify quotation ${qNum} status and line pricing`,
          params: { quotationId: qId },
        },
        {
          toolName: "generate_billing",
          description: `Generate hybrid billing (one-time invoice & recurring subscriptions) for quotation ${qNum}`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_billing_status",
          description: `Inspect generated invoices, payment status, and subscription periods`,
          params: { quotationId: qId },
        },
      ],
    };
  }

  // Intent 3: Negotiation review & management
  if (p.includes("negotiat") || p.includes("counter") || p.includes("discount request")) {
    if (!qId) {
      return {
        intent: "HANDLE_NEGOTIATION",
        quotationId: null,
        rationale: "Cannot inspect negotiation without a target quotation.",
        steps: [],
      };
    }

    return {
      intent: "HANDLE_NEGOTIATION",
      quotationId: qId,
      quotationNumber: qNum,
      rationale: `Inspect quotation ${qNum} negotiation history, evaluate deal health, and prepare response strategy.`,
      steps: [
        {
          toolName: "inspect_quotation",
          description: `Inspect current terms for quotation ${qNum}`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_negotiations",
          description: `Review customer portal negotiation thread and counter-offers`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_deal_health",
          description: `Assess deal health and risk impact of the proposed changes`,
          params: { quotationId: qId },
        },
      ],
    };
  }

  // Intent 4: Deal Health / Risk Intelligence
  if (p.includes("health") || p.includes("risk") || p.includes("anomaly") || p.includes("stalled") || p.includes("score")) {
    if (!qId) {
      return {
        intent: "ANALYZE_DEAL_HEALTH",
        quotationId: null,
        rationale: "Analyze portfolio risk and identify stalled or unhealthy deals.",
        steps: [],
      };
    }

    return {
      intent: "ANALYZE_DEAL_HEALTH",
      quotationId: qId,
      quotationNumber: qNum,
      rationale: `Evaluate 360° deal health score and risk anomalies for quotation ${qNum}.`,
      steps: [
        {
          toolName: "inspect_quotation",
          description: `Inspect commercial details for quotation ${qNum}`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_deal_health",
          description: `Calculate deal health scorecard, anomaly flags, and actionable recommendations`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_recommendations",
          description: `Check if high-margin upsell or complementary products can recover deal margin`,
          params: { quotationId: qId, limit: 3 },
        },
      ],
    };
  }

  // Intent 5: Standard "Prepare for approval" / "Submit quotation"
  // E.g.: "Prepare this quotation for approval", "Submit quotation", "Prepare Q-1007"
  if (qId) {
    return {
      intent: "PREPARE_QUOTATION_FOR_APPROVAL",
      quotationId: qId,
      quotationNumber: qNum,
      rationale: `Inspect quotation ${qNum}, evaluate deal health and margin risks, check product optimizations, and submit for automated approval routing.`,
      steps: [
        {
          toolName: "inspect_quotation",
          description: `Inspect quotation ${qNum} commercial lines, pricing, and current status`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_deal_health",
          description: `Check deal health metrics, margin thresholds, and risk score`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_recommendations",
          description: `Check for catalog cross-sell and margin-improving recommendations`,
          params: { quotationId: qId, limit: 3 },
        },
        {
          toolName: "submit_quotation",
          description: `Submit quotation ${qNum} for deterministic discount check and approval routing`,
          params: { quotationId: qId },
        },
        {
          toolName: "inspect_approvals",
          description: `Verify approval routing outcome and pending reviewer levels`,
          params: { quotationId: qId },
        },
      ],
    };
  }

  // General fallback
  return {
    intent: "GENERAL_INSPECTION",
    quotationId: null,
    rationale: "Inspect accessible quotations and system context.",
    steps: [],
  };
}
