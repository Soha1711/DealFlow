import type { AgentTaskState, ReasonerDecision } from "./agent-types";
import { queryLlmReasoner } from "./agent-ai";
import { TOOL_POLICIES, type ToolName } from "./tool-policy";

/**
 * Intelligent Reasoner that orchestrates DealFlow360 business operations.
 * Implements a hybrid approach:
 * 1. Queries LLM provider when configured and available.
 * 2. Uses deterministic business rule reasoner as resilient fallback.
 */
export async function decideNextStep(state: AgentTaskState): Promise<ReasonerDecision> {
  // Step limit guard
  if (state.currentStep >= state.maxSteps) {
    return {
      type: "COMPLETE",
      summary: `Reached maximum step limit (${state.maxSteps}). Halting execution safely.`,
      verifiedOutcome: "Execution bounded by step limit.",
    };
  }

  // 1. Try LLM Reasoner if available
  try {
    const aiDecision = await queryLlmReasoner(state);
    if (aiDecision) {
      // Validate that tool exists and actor is authorized
      if (aiDecision.type === "CALL_TOOL" || aiDecision.type === "REQUEST_CONFIRMATION") {
        const policy = TOOL_POLICIES[aiDecision.toolName];
        if (policy && policy.allowedRoles.includes(state.actor.role)) {
          return aiDecision;
        }
      } else {
        return aiDecision;
      }
    }
  } catch {
    // Graceful fallback to deterministic reasoner
  }

  // 2. Deterministic Intelligent Reasoner
  return deterministicReasoner(state);
}

/**
 * Deterministic business intelligence reasoner.
 * Inspects goal, current state, tool execution history, and observed results to decide the next action.
 */
function deterministicReasoner(state: AgentTaskState): ReasonerDecision {
  const p = state.prompt.toLowerCase();
  const calledTools = new Set(state.history.map((h) => h.toolName));
  const lastStep = state.history[state.history.length - 1];

  // Helper to check if a canonical or legacy tool was called
  const hasCalled = (canonical: ToolName, legacy?: ToolName): boolean => {
    return calledTools.has(canonical) || (legacy ? calledTools.has(legacy) : false);
  };

  // Helper to extract customer name
  const extractCustomerName = (): string | null => {
    const match = state.prompt.match(/\b(Acme|Northwind|Bluepeak|Helios|Apex|Vanguard|Stellar|OmniCorp|Meridian|Summit|Quantum|Cascade|Pacific)\b/i);
    return match ? match[1] : null;
  };

  // -------------------------------------------------------------------------
  // Scenario A: Acme / Customer Deal Investigation & Remediation
  // Goal: "Analyze Acme's unhealthy deal and handle everything you can without requiring my approval"
  // -------------------------------------------------------------------------
  if (
    p.includes("acme") ||
    (p.includes("analyze") && p.includes("deal")) ||
    p.includes("investigate") ||
    p.includes("unhealthy")
  ) {
    const custName = extractCustomerName() ?? "Acme";

    // Step 1: Identify customer if not already resolved
    if (!state.customerId && !hasCalled("getCustomer")) {
      return {
        type: "CALL_TOOL",
        toolName: "getCustomer",
        params: { name: custName },
        hypothesis: `Identify customer '${custName}' and locate their active quotations.`,
      };
    }

    // Step 2: If we have a quotation ID, inspect quotation commercial terms
    if (state.quotationId && !hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: `Inspect commercial terms, status, and discount details for quotation ${state.quotationNumber ?? state.quotationId}.`,
      };
    }

    // Step 3: Inspect Deal Health scorecard
    if (state.quotationId && !hasCalled("getDealHealth", "inspect_deal_health")) {
      return {
        type: "CALL_TOOL",
        toolName: "getDealHealth",
        params: { quotationId: state.quotationId },
        hypothesis: `Calculate deal health score and detect risk anomalies.`,
      };
    }

    // Step 4: Inspect Deal Health Root-Cause Details
    if (state.quotationId && !hasCalled("getDealHealthDetails")) {
      return {
        type: "CALL_TOOL",
        toolName: "getDealHealthDetails",
        params: { quotationId: state.quotationId },
        hypothesis: `Investigate root-cause drivers of detected deal health anomalies.`,
      };
    }

    // Step 5: Check Approval Status & Governance
    if (state.quotationId && !hasCalled("getApprovalStatus", "inspect_approvals")) {
      return {
        type: "CALL_TOOL",
        toolName: "getApprovalStatus",
        params: { quotationId: state.quotationId },
        hypothesis: `Check discount governance limits and pending review stages.`,
      };
    }

    // Step 6: Check Warehouse Inventory
    if (state.quotationId && !hasCalled("getInventory")) {
      return {
        type: "CALL_TOOL",
        toolName: "getInventory",
        params: { quotationId: state.quotationId },
        hypothesis: `Inspect warehouse stock levels and detect shortages for quotation lines.`,
      };
    }

    // Step 7: Check Fulfillment Order
    if (state.quotationId && !hasCalled("getFulfillment", "inspect_inventory_fulfillment")) {
      return {
        type: "CALL_TOOL",
        toolName: "getFulfillment",
        params: { quotationId: state.quotationId },
        hypothesis: `Check fulfillment status, allocation progress, and backorders.`,
      };
    }

    // Step 8: Adaptive Safe Action: If fulfillment is pending allocation, execute inventory allocation!
    if (
      state.fulfillmentId &&
      !hasCalled("allocateInventory", "allocate_inventory") &&
      ["ADMIN", "OPERATIONS"].includes(state.actor.role)
    ) {
      // Check if last fulfillment check indicated PENDING_ALLOCATION
      const fOutput = state.history.find((h) => h.toolName === "getFulfillment" || h.toolName === "inspect_inventory_fulfillment")?.toolOutput as
        | { fulfillment?: { status?: string }; status?: string }
        | undefined;
      if (fOutput?.fulfillment?.status === "PENDING_ALLOCATION" || fOutput?.status === "PENDING_ALLOCATION") {
        return {
          type: "CALL_TOOL",
          toolName: "allocateInventory",
          params: { fulfillmentId: state.fulfillmentId },
          hypothesis: `Safely allocate available warehouse stock for fulfillment order ${state.fulfillmentId}.`,
        };
      }
    }

    // Step 9: Action Verification: If allocateInventory was just executed, re-check fulfillment to verify!
    if (
      (lastStep?.toolName === "allocateInventory" || lastStep?.toolName === "allocate_inventory") &&
      lastStep.status === "SUCCESS"
    ) {
      return {
        type: "CALL_TOOL",
        toolName: "getFulfillment",
        params: { quotationId: state.quotationId! },
        hypothesis: `Verify allocation results and inspect whether any lines remain backordered.`,
      };
    }

    // Step 10: Check Invoicing / Billing Status
    if (state.quotationId && !hasCalled("getInvoice", "inspect_billing_status")) {
      return {
        type: "CALL_TOOL",
        toolName: "getInvoice",
        params: { quotationId: state.quotationId },
        hypothesis: `Inspect invoices and payment schedules for quotation.`,
      };
    }

    // All discovery & safe actions completed -> Finalize
    return {
      type: "COMPLETE",
      summary: `Completed thorough 360° investigation of ${custName}'s deal.\n\n` +
        `• Diagnosed health score and anomalies.\n` +
        `• Verified warehouse inventory and fulfillment allocations.\n` +
        `• Identified pending approval governance gates requiring human review.`,
      verifiedOutcome: "360° deal analysis complete with verified inventory and fulfillment state.",
    };
  }

  // -------------------------------------------------------------------------
  // Scenario B: Fulfillment & Warehouse Allocation
  // Goal: "Check why this fulfillment is delayed" or "Resolve fulfillment"
  // -------------------------------------------------------------------------
  if (
    p.includes("fulfill") ||
    p.includes("warehouse") ||
    p.includes("stock") ||
    p.includes("delayed") ||
    p.includes("backorder")
  ) {
    if (!state.quotationId) {
      return {
        type: "ASK_CLARIFICATION",
        question: "Please specify the quotation or fulfillment number to investigate.",
        missingInformation: ["quotationId"],
      };
    }

    if (!hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Verify quotation lines and confirmed status.",
      };
    }

    if (!hasCalled("getFulfillment", "inspect_inventory_fulfillment")) {
      return {
        type: "CALL_TOOL",
        toolName: "getFulfillment",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect fulfillment order and line allocation status.",
      };
    }

    if (!hasCalled("getInventory")) {
      return {
        type: "CALL_TOOL",
        toolName: "getInventory",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect warehouse inventory to detect shortages causing delay.",
      };
    }

    // If fulfillment is pending allocation and actor is authorized, safely allocate
    if (
      state.fulfillmentId &&
      !hasCalled("allocateInventory", "allocate_inventory") &&
      ["ADMIN", "OPERATIONS"].includes(state.actor.role)
    ) {
      return {
        type: "CALL_TOOL",
        toolName: "allocateInventory",
        params: { fulfillmentId: state.fulfillmentId },
        hypothesis: "Execute multi-warehouse inventory allocation for unallocated lines.",
      };
    }

    // Verify mutation if just allocated
    if (
      (lastStep?.toolName === "allocateInventory" || lastStep?.toolName === "allocate_inventory") &&
      lastStep.status === "SUCCESS"
    ) {
      return {
        type: "CALL_TOOL",
        toolName: "getFulfillment",
        params: { quotationId: state.quotationId },
        hypothesis: "Verify updated fulfillment status and line backorder amounts.",
      };
    }

    return {
      type: "COMPLETE",
      summary: "Fulfillment and inventory investigation complete.",
      verifiedOutcome: "Fulfillment delay causes diagnosed and verified against warehouse stock.",
    };
  }

  // -------------------------------------------------------------------------
  // Scenario C: Prepare Quotation for Approval
  // Goal: "Prepare this quotation for approval" / "Submit quotation"
  // -------------------------------------------------------------------------
  if (
    p.includes("prepare") &&
    (p.includes("approval") || p.includes("submit") || p.includes("quotation"))
  ) {
    if (!state.quotationId) {
      return {
        type: "ASK_CLARIFICATION",
        question: "Please select or provide a quotation to prepare for approval.",
        missingInformation: ["quotationId"],
      };
    }

    if (!hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect current quotation lines and draft status.",
      };
    }

    if (!hasCalled("getDealHealth", "inspect_deal_health")) {
      return {
        type: "CALL_TOOL",
        toolName: "getDealHealth",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect deal health and discount risk before submission.",
      };
    }

    if (!hasCalled("getRecommendations", "inspect_recommendations")) {
      return {
        type: "CALL_TOOL",
        toolName: "getRecommendations",
        params: { quotationId: state.quotationId, limit: 3 },
        hypothesis: "Check catalogue recommendations for margin improvement.",
      };
    }

    // Check if quotation is still in DRAFT
    const quoteData = state.history.find((h) => h.toolName === "getQuotation" || h.toolName === "inspect_quotation")?.toolOutput as
      | { status?: string }
      | undefined;
    const isDraft = !quoteData || quoteData.status === "DRAFT";

    if (isDraft && !hasCalled("submitQuotation", "submit_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "submitQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Submit quotation for deterministic discount verification and approval routing.",
      };
    }

    // Post-submit verification: verify approval routing
    if (!hasCalled("getApprovalStatus", "inspect_approvals")) {
      return {
        type: "CALL_TOOL",
        toolName: "getApprovalStatus",
        params: { quotationId: state.quotationId },
        hypothesis: "Verify approval status and required reviewer stages.",
      };
    }

    return {
      type: "COMPLETE",
      summary: `Quotation ${state.quotationNumber ?? state.quotationId} prepared and submitted for approval. Approval routing verified.`,
      verifiedOutcome: "Quotation submitted and routed through governance engine.",
    };
  }

  // -------------------------------------------------------------------------
  // Scenario D: Discount Risk Analysis
  // Goal: "Find quotations with excessive discount risk" / "Check discount risk"
  // -------------------------------------------------------------------------
  if (p.includes("discount") || p.includes("excessive") || p.includes("risk")) {
    if (state.quotationId) {
      if (!hasCalled("getQuotation", "inspect_quotation")) {
        return {
          type: "CALL_TOOL",
          toolName: "getQuotation",
          params: { quotationId: state.quotationId },
          hypothesis: "Inspect quotation discount levels and total margin.",
        };
      }
      if (!hasCalled("getDealHealth", "inspect_deal_health")) {
        return {
          type: "CALL_TOOL",
          toolName: "getDealHealth",
          params: { quotationId: state.quotationId },
          hypothesis: "Evaluate discount risk score and anomaly threshold.",
        };
      }
      if (!hasCalled("getApprovalStatus", "inspect_approvals")) {
        return {
          type: "CALL_TOOL",
          toolName: "getApprovalStatus",
          params: { quotationId: state.quotationId },
          hypothesis: "Check required manager and finance approval levels.",
        };
      }
      return {
        type: "COMPLETE",
        summary: "Discount risk analysis complete.",
        verifiedOutcome: "Risk score and approval tiers evaluated.",
      };
    }
  }

  // -------------------------------------------------------------------------
  // Scenario E: Negotiation Management
  // Goal: "Check this customer's negotiation"
  // -------------------------------------------------------------------------
  if (p.includes("negotiat") || p.includes("counter")) {
    if (!state.quotationId) {
      return {
        type: "ASK_CLARIFICATION",
        question: "Please specify the quotation under negotiation.",
        missingInformation: ["quotationId"],
      };
    }

    if (!hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect commercial terms of negotiated quotation.",
      };
    }

    if (!hasCalled("getNegotiationHistory", "inspect_negotiations")) {
      return {
        type: "CALL_TOOL",
        toolName: "getNegotiationHistory",
        params: { quotationId: state.quotationId },
        hypothesis: "Review negotiation counter-proposals and messages.",
      };
    }

    if (!hasCalled("getDealHealth", "inspect_deal_health")) {
      return {
        type: "CALL_TOOL",
        toolName: "getDealHealth",
        params: { quotationId: state.quotationId },
        hypothesis: "Assess deal margin impact of proposed counter-offer.",
      };
    }

    return {
      type: "COMPLETE",
      summary: "Negotiation review complete. Assessed customer counter-proposals and deal health impact.",
      verifiedOutcome: "Negotiation history and health evaluated.",
    };
  }

  // -------------------------------------------------------------------------
  // Scenario F: Product Recommendations & Upsell
  // Goal: "Prepare this quotation with the best relevant products"
  // -------------------------------------------------------------------------
  if (p.includes("recommend") || p.includes("upsell") || p.includes("cross-sell") || p.includes("products")) {
    if (!state.quotationId) {
      return {
        type: "ASK_CLARIFICATION",
        question: "Please specify the target quotation for product recommendations.",
        missingInformation: ["quotationId"],
      };
    }

    if (!hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Inspect existing quotation lines to avoid duplicates.",
      };
    }

    if (state.customerId && !hasCalled("getCustomerHistory", "inspect_customer_history")) {
      return {
        type: "CALL_TOOL",
        toolName: "getCustomerHistory",
        params: { customerId: state.customerId },
        hypothesis: "Inspect customer historical purchasing affinity.",
      };
    }

    if (!hasCalled("getRecommendations", "inspect_recommendations")) {
      return {
        type: "CALL_TOOL",
        toolName: "getRecommendations",
        params: { quotationId: state.quotationId, limit: 3 },
        hypothesis: "Retrieve deterministic recommendation candidates.",
      };
    }

    return {
      type: "COMPLETE",
      summary: "Product recommendation analysis complete.",
      verifiedOutcome: "Catalog recommendations evaluated against quotation context.",
    };
  }

  // -------------------------------------------------------------------------
  // Scenario G: Billing & Subscriptions
  // Goal: "Prepare hybrid billing" / "Invoices"
  // -------------------------------------------------------------------------
  if (p.includes("bill") || p.includes("invoice") || p.includes("subscription")) {
    if (!state.quotationId) {
      return {
        type: "ASK_CLARIFICATION",
        question: "Please specify the quotation to bill.",
        missingInformation: ["quotationId"],
      };
    }

    if (!hasCalled("getQuotation", "inspect_quotation")) {
      return {
        type: "CALL_TOOL",
        toolName: "getQuotation",
        params: { quotationId: state.quotationId },
        hypothesis: "Verify quotation acceptance status and line billing types.",
      };
    }

    if (!hasCalled("getInvoice", "inspect_billing_status")) {
      return {
        type: "CALL_TOOL",
        toolName: "getInvoice",
        params: { quotationId: state.quotationId },
        hypothesis: "Check existing invoices and billing schedules.",
      };
    }

    return {
      type: "COMPLETE",
      summary: "Billing and subscription inspection complete.",
      verifiedOutcome: "Quotation billing status reviewed.",
    };
  }

  // Fallback: If quotation is provided, inspect it
  if (state.quotationId && !hasCalled("getQuotation", "inspect_quotation")) {
    return {
      type: "CALL_TOOL",
      toolName: "getQuotation",
      params: { quotationId: state.quotationId },
      hypothesis: "Inspect target quotation context.",
    };
  }

  return {
    type: "COMPLETE",
    summary: "Task execution finished.",
    verifiedOutcome: "No further automated operational actions needed.",
  };
}
