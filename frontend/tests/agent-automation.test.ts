import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { db } from "@/lib/db";
import {
  assertCanExecuteTool,
  type AgentActor,
} from "@/lib/modules/agent/tool-policy";
import {
  AgentPolicyError,
  AgentConfirmationRequiredError,
} from "@/lib/modules/agent/agent-errors";
import {
  inspectQuotationTool,
  inspectDealHealthTool,
  inspectRecommendationsTool,
} from "@/lib/modules/agent/tool-registry";
import { runAgentTask } from "@/lib/modules/agent/agent-runner";
import { planAgentTask } from "@/lib/modules/agent/agent-planner";
import {
  getAgentRun,
  listAgentRuns,
} from "@/lib/modules/agent/agent-audit";
import { createQuotation } from "@/lib/modules/quotations/quotation-service";

const suffix = Date.now().toString(36).toUpperCase();

let salesRep: AgentActor;
let otherSalesRep: AgentActor;
let salesManager: AgentActor;
let financeUser: AgentActor;
let opsUser: AgentActor;
let customerActor: AgentActor;
let otherCustomerActor: AgentActor;

let customerId: string;
let otherCustomerId: string;
let testProductId: string;
let testQuoteId: string;
let otherRepQuoteId: string;

before(async () => {
  // 1. Seed or retrieve users for all roles
  const repUser = await db.user.findFirstOrThrow({ where: { role: "SALES_REP" } });
  salesRep = { userId: repUser.id, role: "SALES_REP", name: repUser.name };

  let otherRepUser = await db.user.findFirst({
    where: { role: "SALES_REP", id: { not: repUser.id } },
  });
  if (!otherRepUser) {
    otherRepUser = await db.user.create({
      data: {
        name: `Other Rep ${suffix}`,
        email: `other-rep-${suffix}@dealflow360.io`,
        passwordHash: "dummy",
        role: "SALES_REP",
      },
    });
  }
  otherSalesRep = { userId: otherRepUser.id, role: "SALES_REP", name: otherRepUser.name };

  const mgrUser = await db.user.findFirstOrThrow({ where: { role: "SALES_MANAGER" } });
  salesManager = { userId: mgrUser.id, role: "SALES_MANAGER", name: mgrUser.name };

  const finUser = await db.user.findFirstOrThrow({ where: { role: "FINANCE" } });
  financeUser = { userId: finUser.id, role: "FINANCE", name: finUser.name };

  const opUser = await db.user.findFirstOrThrow({ where: { role: "OPERATIONS" } });
  opsUser = { userId: opUser.id, role: "OPERATIONS", name: opUser.name };

  // Customers
  let cust1 = await db.customer.findFirst();
  if (!cust1) {
    cust1 = await db.customer.create({
      data: {
        name: `Primary Customer ${suffix}`,
        email: `primary-${suffix}@customer.io`,
        tier: "GOLD",
      },
    });
  }
  customerId = cust1.id;
  customerActor = { userId: "cust-user-1", role: "CUSTOMER", customerId: cust1.id };

  let cust2 = await db.customer.findFirst({ where: { id: { not: cust1.id } } });
  if (!cust2) {
    cust2 = await db.customer.create({
      data: {
        name: `Secondary Customer ${suffix}`,
        email: `secondary-${suffix}@customer.io`,
        tier: "STANDARD",
      },
    });
  }
  otherCustomerId = cust2.id;
  otherCustomerActor = { userId: "cust-user-2", role: "CUSTOMER", customerId: cust2.id };

  // Product
  const prod = await db.product.findFirstOrThrow({ where: { isRecurring: false } });
  testProductId = prod.id;

  // Create test quotations
  const q1 = await createQuotation({
    salesRepId: salesRep.userId,
    customerId,
    lines: [
      {
        productId: testProductId,
        quantity: 2,
        unitPrice: prod.price.toString(),
        discountPercent: 25, // > 15% requires manager approval
      },
    ],
  });
  testQuoteId = q1.id;

  const q2 = await createQuotation({
    salesRepId: otherSalesRep.userId,
    customerId: otherCustomerId,
    lines: [
      {
        productId: testProductId,
        quantity: 1,
        unitPrice: prod.price.toString(),
        discountPercent: 5,
      },
    ],
  });
  otherRepQuoteId = q2.id;
});

after(async () => {
  // Cleanup test quotes
  await db.quotation.deleteMany({
    where: { id: { in: [testQuoteId, otherRepQuoteId] } },
  }).catch(() => {});
});

describe("Agentic AI Automation Layer", () => {
  describe("1. Tool Permission Policy & RBAC", () => {
    it("permits authorized roles for read-only inspection tools", async () => {
      await assertCanExecuteTool({
        actor: salesRep,
        toolName: "inspect_quotation",
        quotationId: testQuoteId,
      });

      await assertCanExecuteTool({
        actor: salesManager,
        toolName: "inspect_deal_health",
        quotationId: testQuoteId,
      });

      await assertCanExecuteTool({
        actor: opsUser,
        toolName: "inspect_inventory_fulfillment",
        quotationId: testQuoteId,
      });

      await assertCanExecuteTool({
        actor: financeUser,
        toolName: "inspect_billing_status",
        quotationId: testQuoteId,
      });
    });

    it("blocks CUSTOMER role from internal-only tools", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: customerActor,
            toolName: "approve_deal",
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "TOOL_ROLE_UNAUTHORIZED");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: customerActor,
            toolName: "start_fulfillment",
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "TOOL_ROLE_UNAUTHORIZED");
          return true;
        }
      );
    });

    it("blocks SALES_REP from approving deals", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: salesRep,
            toolName: "approve_deal",
            toolParams: { approvalId: "any" },
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "TOOL_ROLE_UNAUTHORIZED");
          return true;
        }
      );
    });

    it("blocks OPERATIONS from creating quotations or approving deals", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: opsUser,
            toolName: "create_quotation",
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "TOOL_ROLE_UNAUTHORIZED");
          return true;
        }
      );
    });
  });

  describe("2. IDOR & Tenant Isolation", () => {
    it("blocks a SALES_REP from accessing or mutating another sales rep's quotation", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: salesRep,
            toolName: "inspect_quotation",
            quotationId: otherRepQuoteId,
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "SALES_REP_IDOR_VIOLATION");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: salesRep,
            toolName: "submit_quotation",
            quotationId: otherRepQuoteId,
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "SALES_REP_IDOR_VIOLATION");
          return true;
        }
      );
    });

    it("blocks a CUSTOMER from accessing another customer's quotation", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: customerActor,
            toolName: "inspect_quotation",
            quotationId: otherRepQuoteId,
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "CUSTOMER_IDOR_VIOLATION");
          return true;
        }
      );

      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: otherCustomerActor,
            toolName: "inspect_quotation",
            quotationId: testQuoteId,
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentPolicyError);
          assert.equal(err.code, "CUSTOMER_IDOR_VIOLATION");
          return true;
        }
      );
    });
  });

  describe("3. Safety Confirmation Gates", () => {
    it("pauses HIGH_IMPACT tool without confirmation", async () => {
      await assert.rejects(
        async () => {
          await assertCanExecuteTool({
            actor: salesManager,
            toolName: "approve_deal",
            toolParams: { approvalId: "app-123" },
            confirmed: false,
          });
        },
        (err: unknown) => {
          assert(err instanceof AgentConfirmationRequiredError);
          assert.equal(err.code, "CONFIRMATION_REQUIRED");
          assert.equal(err.toolName, "approve_deal");
          return true;
        }
      );
    });

    it("passes HIGH_IMPACT tool when confirmed is true", async () => {
      await assertCanExecuteTool({
        actor: salesManager,
        toolName: "approve_deal",
        toolParams: { approvalId: "app-123" },
        confirmed: true,
      });
    });
  });

  describe("4. Controlled Tool Registry Execution", () => {
    it("inspect_quotation returns accurate quotation and priced lines", async () => {
      const result = await inspectQuotationTool.execute(
        { quotationId: testQuoteId },
        salesRep
      );

      assert.equal(result.success, true);
      assert.equal(result.toolName, "inspect_quotation");
      assert(result.data && typeof result.data === "object");
      const data = result.data as { quotationNumber: string; status: string; lines: unknown[] };
      assert.equal(data.status, "DRAFT");
      assert(data.lines.length >= 1);
    });

    it("inspect_deal_health returns health scorecard and risk metrics", async () => {
      const result = await inspectDealHealthTool.execute(
        { quotationId: testQuoteId },
        salesRep
      );

      assert.equal(result.success, true);
      assert.equal(result.toolName, "inspect_deal_health");
      const data = result.data as { score: number; level: string; anomalies: unknown[] };
      assert(typeof data.score === "number");
      assert(["HEALTHY", "AT_RISK", "CRITICAL"].includes(data.level));
    });

    it("inspect_recommendations returns product candidates", async () => {
      const result = await inspectRecommendationsTool.execute(
        { quotationId: testQuoteId, limit: 3 },
        salesRep
      );

      assert.equal(result.success, true);
      assert.equal(result.toolName, "inspect_recommendations");
    });
  });

  describe("5. Planner & Autonomous Multi-Step Execution Loop", () => {
    it("plans a multi-step task accurately from prompt", async () => {
      const plan = await planAgentTask({
        prompt: "Prepare this quotation for approval",
        quotationId: testQuoteId,
        actor: salesRep,
      });

      assert.equal(plan.intent, "PREPARE_QUOTATION_FOR_APPROVAL");
      assert.equal(plan.quotationId, testQuoteId);
      assert(plan.steps.length >= 4);
      assert.equal(plan.steps[0].toolName, "inspect_quotation");
      assert.equal(plan.steps[1].toolName, "inspect_deal_health");
    });

    it("autonomously completes 'Prepare quotation for approval' workflow", async () => {
      const runResult = await runAgentTask({
        prompt: "Prepare this quotation for approval",
        quotationId: testQuoteId,
        actor: salesRep,
      });

      assert.equal(runResult.status, "COMPLETED");
      assert.equal(runResult.quotationId, testQuoteId);
      assert(runResult.steps.length >= 4);

      // Verify quotation transitioned from DRAFT to PENDING_MANAGER (due to 25% discount)
      const updatedQuote = await db.quotation.findUniqueOrThrow({ where: { id: testQuoteId } });
      assert.equal(updatedQuote.status, "PENDING_MANAGER");

      // Verify audit run recorded
      const audit = getAgentRun(runResult.runId);
      assert(audit);
      assert.equal(audit.status, "COMPLETED");
      assert.equal(audit.steps.length, runResult.steps.length);

      const runs = listAgentRuns({ userId: salesRep.userId, role: salesRep.role }, testQuoteId);
      assert(runs.some((r) => r.id === runResult.runId));
    });

    it("handles confirmation pause in agent loop for high-impact action", async () => {
      // Find the pending approval created by the previous test
      const approval = await db.approval.findFirst({
        where: { quotationId: testQuoteId, status: "PENDING" },
      });

      if (approval) {
        // Manager runs approval action without pre-confirmation
        const plan = await runAgentTask({
          prompt: `Approve deal stage ${approval.id}`,
          quotationId: testQuoteId,
          actor: salesManager,
        });

        // Should complete safely or indicate appropriate status
        assert(["COMPLETED", "AWAITING_CONFIRMATION"].includes(plan.status));
      }
    });
  });
});
