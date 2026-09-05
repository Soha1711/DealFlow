import type { Role } from "@prisma/client";
import { db } from "@/lib/db";
import {
  AgentPolicyError,
  AgentConfirmationRequiredError,
} from "./agent-errors";

export type ToolName =
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

export type ToolImpactLevel = "READ_ONLY" | "SAFE_MUTATION" | "HIGH_IMPACT";

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
  allowedRoles: Role[];
  impactLevel: ToolImpactLevel;
  requiresConfirmation: boolean;
};

export const TOOL_POLICIES: Record<ToolName, ToolPolicy> = {
  inspect_quotation: {
    name: "inspect_quotation",
    description: "Read quotation details, commercial lines, and status",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_deal_health: {
    name: "inspect_deal_health",
    description: "Inspect deal health score (0-100), risk anomalies, and category metrics",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_customer_history: {
    name: "inspect_customer_history",
    description: "Inspect customer historical orders, tier, and purchasing patterns",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_recommendations: {
    name: "inspect_recommendations",
    description: "Retrieve intelligent product upsell, cross-sell, and alternative recommendations",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_inventory_fulfillment: {
    name: "inspect_inventory_fulfillment",
    description: "Inspect warehouse stock levels, active reservations, and fulfillment progress",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "OPERATIONS"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_billing_status: {
    name: "inspect_billing_status",
    description: "Inspect quotation invoices, payment transactions, and recurring subscriptions",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_approvals: {
    name: "inspect_approvals",
    description: "Inspect approval tiers, routing status, and manager/finance review history",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "FINANCE"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  inspect_negotiations: {
    name: "inspect_negotiations",
    description: "Inspect customer portal negotiation thread, counter-proposals, and messages",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER", "CUSTOMER"],
    impactLevel: "READ_ONLY",
    requiresConfirmation: false,
  },
  create_quotation: {
    name: "create_quotation",
    description: "Create a new draft quotation for a customer",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  add_quotation_line: {
    name: "add_quotation_line",
    description: "Add a product line to a draft quotation with priced lines and margins",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  submit_quotation: {
    name: "submit_quotation",
    description: "Submit a draft quotation for automated discount check and approval routing",
    allowedRoles: ["ADMIN", "SALES_REP", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  approve_deal: {
    name: "approve_deal",
    description: "Approve a pending deal stage as authorized manager or finance reviewer",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
  },
  reject_deal: {
    name: "reject_deal",
    description: "Reject a pending quotation approval stage with commercial reason",
    allowedRoles: ["ADMIN", "SALES_MANAGER", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
  },
  start_fulfillment: {
    name: "start_fulfillment",
    description: "Initialize warehouse fulfillment order for an approved/confirmed quotation",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  allocate_inventory: {
    name: "allocate_inventory",
    description: "Run deterministic multi-warehouse inventory allocation across active warehouses",
    allowedRoles: ["ADMIN", "OPERATIONS"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  generate_billing: {
    name: "generate_billing",
    description: "Generate atomic hybrid invoices and subscriptions for an approved quotation",
    allowedRoles: ["ADMIN", "FINANCE", "SALES_MANAGER"],
    impactLevel: "SAFE_MUTATION",
    requiresConfirmation: false,
  },
  issue_invoice: {
    name: "issue_invoice",
    description: "Transition a draft invoice to ISSUED and set payment due date",
    allowedRoles: ["ADMIN", "FINANCE"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
  },
  respond_negotiation: {
    name: "respond_negotiation",
    description: "Respond to customer negotiation (accept, counter, or reject counter-offer)",
    allowedRoles: ["ADMIN", "SALES_REP"],
    impactLevel: "HIGH_IMPACT",
    requiresConfirmation: true,
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
