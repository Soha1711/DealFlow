import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AgentPolicyError,
  AgentConfirmationRequiredError,
} from "./agent-errors";

export type CanonicalToolName =
  | "getQuotation"
  | "getCustomer"
  | "getCustomerHistory"
  | "getDealHealth"
  | "getDealHealthDetails"
  | "getApprovalStatus"
  | "getInventory"
  | "getFulfillment"
  | "getInvoice"
  | "getSubscription"
  | "getNegotiationHistory"
  | "getProductDetails"
  | "getRecommendations"
  | "prepareQuotation"
  | "addQuotationLine"
  | "submitQuotation"
  | "prepareApproval"
  | "approveDeal"
  | "rejectDeal"
  | "allocateInventory"
  | "createBackorder"
  | "releaseBackorder"
  | "prepareInvoice"
  | "createBillingSchedule"
  | "respondToNegotiation"
  | "startFulfillment";

export type LegacyToolName =
  | "inspect_quotation"
  | "inspect_deal_health"
  | "inspect_customer_history"
  | "inspect_recommendations"
  | "inspect_inventory_fulfillment"
  | "inspect_billing_status"
  | "inspect_approvals"
  | "inspect_negotiations"
  | "create_quotation"
  | "add_quotation_line"
  | "submit_quotation"
  | "approve_deal"
  | "reject_deal"
  | "start_fulfillment"
  | "allocate_inventory"
  | "generate_billing"
  | "issue_invoice"
  | "respond_negotiation";

export type ToolName = CanonicalToolName | LegacyToolName;

export type ToolImpactLevel = "READ_ONLY" | "SAFE_MUTATION" | "HIGH_IMPACT";
export type ToolClassification = "READ" | "ACTION";

export type AgentActor = {
  userId: string;
  role: Role;
  customerId?: string | null;
  name?: string;
  email?: string;
};

export type ToolPolicy = {
  name: ToolName;
  description: string;
  classification: ToolClassification;
  allowedRoles: Role[];
  impactLevel: ToolImpactLevel;
  requiresConfirmation: boolean;
  domainService: string;
};

export const TOOL_POLICIES: Record<ToolName, ToolPolicy> = {
  // ---------------------------------------------------------------------------
  // Canonical READ tools (Section 6)
  // ---------------------------------------------------------------------------
  getQuotation: {
    name: "getQuotation",
    description: "Read quotation details, commercial lines, and status",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "quotation-service.getQuotation",
  },
  getCustomer: {
    name: "getCustomer",
    description: "Find and inspect customer profile, tier, and active quotations by name, email, or id",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "db.customer",
  },
  getCustomerHistory: {
    name: "getCustomerHistory",
    description: "Inspect customer historical orders, tier, and purchasing patterns",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "recommendation-tools.getCustomerHistory",
  },
  getDealHealth: {
    name: "getDealHealth",
    description: "Inspect deal health score (0-100), risk anomalies, and category metrics",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "deal-health-service.getDealHealth",
  },
  getDealHealthDetails: {
    name: "getDealHealthDetails",
    description: "Inspect root-cause metrics for detected deal health anomalies (discount risk, inventory shortfall, margin dilution)",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "deal-health-engine.evaluateDealHealth",
  },
  getApprovalStatus: {
    name: "getApprovalStatus",
    description: "Inspect approval tiers, routing status, and manager/finance review history",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "approval-service.listApprovalsForQuotation",
  },
  getInventory: {
    name: "getInventory",
    description: "Inspect warehouse stock levels and available vs reserved inventory for quotation lines",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "db.inventory",
  },
  getFulfillment: {
    name: "getFulfillment",
    description: "Inspect fulfillment order status, line allocations, and backorders",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "fulfillment-service.getFulfillmentForQuotation",
  },
  getInvoice: {
    name: "getInvoice",
    description: "Inspect quotation invoices, payment transactions, and recurring subscriptions",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "billing-service",
  },
  getSubscription: {
    name: "getSubscription",
    description: "Inspect customer recurring subscriptions, terms, and renewal cycles",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "subscription-service.getSubscription",
  },
  getNegotiationHistory: {
    name: "getNegotiationHistory",
    description: "Inspect customer portal negotiation thread, counter-proposals, and messages",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "db.quotationNegotiation",
  },
  getProductDetails: {
    name: "getProductDetails",
    description: "Inspect product catalog specifications, pricing, cost, and max allowed discount",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "OPERATIONS", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "db.product",
  },
  getRecommendations: {
    name: "getRecommendations",
    description: "Retrieve intelligent product upsell, cross-sell, and alternative recommendations",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "recommendation-service.getRecommendations",
  },

  // ---------------------------------------------------------------------------
  // Canonical ACTION tools (Section 6)
  // ---------------------------------------------------------------------------
  prepareQuotation: {
    name: "prepareQuotation",
    description: "Create a new draft quotation for a customer",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.createQuotation",
  },
  addQuotationLine: {
    name: "addQuotationLine",
    description: "Add a product line to a draft quotation with priced lines and margins",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.addQuotationLineToDraft",
  },
  submitQuotation: {
    name: "submitQuotation",
    description: "Submit a draft quotation for automated discount check and approval routing",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.submitQuotation",
  },
  prepareApproval: {
    name: "prepareApproval",
    description: "Process approval for a quotation stage (requires high-impact human sign-off)",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "approval-service.approveApproval",
  },
  approveDeal: {
    name: "approveDeal",
    description: "Approve a pending deal stage as authorized manager or finance reviewer",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "approval-service.approveApproval",
  },
  rejectDeal: {
    name: "rejectDeal",
    description: "Reject a pending quotation approval stage with commercial reason",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "approval-service.rejectApproval",
  },
  allocateInventory: {
    name: "allocateInventory",
    description: "Run deterministic multi-warehouse inventory allocation across active warehouses",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.allocateFulfillment",
  },
  createBackorder: {
    name: "createBackorder",
    description: "Explicitly mark unallocated fulfillment lines as backordered to prevent warehouse stalls",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.backorderFulfillment",
  },
  releaseBackorder: {
    name: "releaseBackorder",
    description: "Release pending backorders for a fulfillment order when warehouse inventory arrives",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.releaseBackorder",
  },
  prepareInvoice: {
    name: "prepareInvoice",
    description: "Prepare and generate commercial invoices for an accepted quotation",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "FINANCE"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "billing-service.createBillingFromQuotation",
  },
  createBillingSchedule: {
    name: "createBillingSchedule",
    description: "Create recurring billing schedules and one-time invoices for a quotation",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "FINANCE"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "billing-service.createBillingFromQuotation",
  },
  respondToNegotiation: {
    name: "respondToNegotiation",
    description: "Respond to customer negotiation counter-offer (accept, counter, or reject)",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "CUSTOMER"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "negotiation-service",
  },
  startFulfillment: {
    name: "startFulfillment",
    description: "Initialize warehouse fulfillment order for an approved/confirmed quotation",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.createFulfillment",
  },

  // ---------------------------------------------------------------------------
  // Legacy Aliases (Preserve full backwards compatibility)
  // ---------------------------------------------------------------------------
  inspect_quotation: {
    name: "inspect_quotation",
    description: "Read quotation details, commercial lines, and status",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "quotation-service.getQuotation",
  },
  inspect_deal_health: {
    name: "inspect_deal_health",
    description: "Inspect deal health score (0-100), risk anomalies, and category metrics",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "deal-health-service.getDealHealth",
  },
  inspect_customer_history: {
    name: "inspect_customer_history",
    description: "Inspect customer historical orders, tier, and purchasing patterns",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "recommendation-tools.getCustomerHistory",
  },
  inspect_recommendations: {
    name: "inspect_recommendations",
    description: "Retrieve intelligent product upsell, cross-sell, and alternative recommendations",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "recommendation-service.getRecommendations",
  },
  inspect_inventory_fulfillment: {
    name: "inspect_inventory_fulfillment",
    description: "Inspect warehouse stock levels, active reservations, and fulfillment progress",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "fulfillment-service.getFulfillmentForQuotation",
  },
  inspect_billing_status: {
    name: "inspect_billing_status",
    description: "Inspect quotation invoices, payment transactions, and recurring subscriptions",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "billing-service",
  },
  inspect_approvals: {
    name: "inspect_approvals",
    description: "Inspect approval tiers, routing status, and manager/finance review history",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "approval-service.listApprovalsForQuotation",
  },
  inspect_negotiations: {
    name: "inspect_negotiations",
    description: "Inspect customer portal negotiation thread, counter-proposals, and messages",
    classification: "READ",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
    domainService: "db.quotationNegotiation",
  },
  create_quotation: {
    name: "create_quotation",
    description: "Create a new draft quotation for a customer",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.createQuotation",
  },
  add_quotation_line: {
    name: "add_quotation_line",
    description: "Add a product line to a draft quotation with priced lines and margins",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.addQuotationLineToDraft",
  },
  submit_quotation: {
    name: "submit_quotation",
    description: "Submit a draft quotation for automated discount check and approval routing",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "quotation-service.submitQuotation",
  },
  approve_deal: {
    name: "approve_deal",
    description: "Approve a pending deal stage as authorized manager or finance reviewer",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "approval-service.approveApproval",
  },
  reject_deal: {
    name: "reject_deal",
    description: "Reject a pending quotation approval stage with commercial reason",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "approval-service.rejectApproval",
  },
  start_fulfillment: {
    name: "start_fulfillment",
    description: "Initialize warehouse fulfillment order for an approved/confirmed quotation",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.createFulfillment",
  },
  allocate_inventory: {
    name: "allocate_inventory",
    description: "Run deterministic multi-warehouse inventory allocation across active warehouses",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "fulfillment-service.allocateFulfillment",
  },
  generate_billing: {
    name: "generate_billing",
    description: "Generate atomic hybrid invoices and subscriptions for an approved quotation",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "FINANCE", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
    domainService: "billing-service.createBillingFromQuotation",
  },
  issue_invoice: {
    name: "issue_invoice",
    description: "Transition a draft invoice to ISSUED and set payment due date",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "billing-service.issueInvoice",
  },
  respond_negotiation: {
    name: "respond_negotiation",
    description: "Respond to customer negotiation (accept, counter, or reject counter-offer)",
    classification: "ACTION",
    allowedRoles: ["ADMIN", "SALES_REP"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
    domainService: "negotiation-service",
  },
};

/**
 * Validates RBAC permissions, IDOR resource-level access, and safety confirmation gates.
 */
export async function assertCanExecuteTool(options: {
  actor: AgentActor;
  toolName: ToolName;
  quotationId?: string;
  toolParams?: Record<string, unknown>;
  confirmed?: boolean;
}): Promise<void> {
  const policy = TOOL_POLICIES[options.toolName];
  if (!policy) {
    throw new AgentPolicyError(`Unknown tool: ${options.toolName}`);
  }

  // 1. Role-Based Access Control (RBAC)
  if (!policy.allowedRoles.includes(options.actor.role)) {
    throw new AgentPolicyError(
      `Role ${options.actor.role} is not authorized to execute tool '${options.toolName}'.`,
      "TOOL_ROLE_UNAUTHORIZED",
      { requiredRoles: policy.allowedRoles, currentRole: options.actor.role }
    );
  }

  // 2. Resource-level access & IDOR verification
  if (options.quotationId) {
    const quotation = await db.quotation.findUnique({
      where: { id: options.quotationId },
      select: { id: true, salesRepId: true, customerId: true, status: true, discountTotal: true, total: true },
    });

    if (!quotation) {
      throw new AgentPolicyError(`Quotation with id '${options.quotationId}' was not found.`, "NOT_FOUND");
    }

    // Customer can ONLY access quotations for their linked customer ID
    if (options.actor.role === "CUSTOMER") {
      if (!options.actor.customerId || quotation.customerId !== options.actor.customerId) {
        throw new AgentPolicyError(
          "Customer access denied: you can only access quotations belonging to your organization.",
          "CUSTOMER_IDOR_VIOLATION"
        );
      }
    }

    // Sales rep can ONLY access/mutate their own quotations (unless Admin or Manager)
    if (options.actor.role === "SALES_REP") {
      if (quotation.salesRepId !== options.actor.userId) {
        throw new AgentPolicyError(
          "Sales Rep access denied: you can only access and automate your own assigned quotations.",
          "SALES_REP_IDOR_VIOLATION"
        );
      }
    }
  }

  // 3. High-Impact Action Safety Confirmation Gate
  if (policy.requiresConfirmation && !options.confirmed) {
    throw new AgentConfirmationRequiredError(
      `Tool '${options.toolName}' is classified as HIGH_IMPACT and requires user confirmation before execution.`,
      options.toolName,
      options.toolParams ?? {},
      `High-impact action: ${policy.description}`
    );
  }
}
