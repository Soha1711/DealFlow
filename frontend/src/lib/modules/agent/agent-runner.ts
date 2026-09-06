import { db } from "@/lib/db";
import {
  AgentConfirmationRequiredError,
  AgentPolicyError,
} from "./agent-errors";
import {
  createAgentRun,
  recordAgentStep,
  completeAgentRun,
  failAgentRun,
  awaitConfirmationAgentRun,
  type AgentRunRecord,
} from "./agent-audit";
import { planAgentTask, resolveQuotationFromPrompt } from "./agent-planner";
import { assertCanExecuteTool, type AgentActor, type ToolName, TOOL_POLICIES } from "./tool-policy";
import { AGENT_TOOL_REGISTRY } from "./tool-registry";
import { decideNextStep } from "./agent-reasoner";
import { verifyActionMutation } from "./agent-verification";
import type { AgentTaskState, PendingHumanApproval } from "./agent-types";

export type RunAgentOptions = {
  prompt: string;
  quotationId?: string | null;
  actor: AgentActor;
  confirmation?: {
    toolName: string;
    params?: Record<string, unknown>;
  };
};

export type RunAgentResult = {
  runId: string;
  status: "COMPLETED" | "AWAITING_CONFIRMATION" | "FAILED" | "BLOCKED";
  prompt: string;
  quotationId?: string | null;
  plan: string[];
  steps: AgentRunRecord["steps"];
  summary: string;
  requiresConfirmation?: boolean;
  confirmationDetails?: AgentRunRecord["confirmationDetails"];
  completedActions?: string[];
  pendingHumanApprovals?: Array<{
    action: string;
    requiredRole: string;
    reason: string;
    stageId?: string;
  }>;
};

/**
 * Updates dynamic business IDs in task state when observing tool outputs.
 */
function updateStateFromToolOutput(state: AgentTaskState, toolName: ToolName, output: unknown) {
  if (!output || typeof output !== "object") return;
  const data = output as {
    id?: string;
    quotationNumber?: string;
    customerId?: string;
    customer?: { id?: string; name?: string };
    activeQuotations?: Array<{ id: string; quotationNumber?: string }>;
    quotations?: Array<{ id: string; quotationNumber?: string }>;
    fulfillment?: { id?: string };
  };

  // Customer resolution
  if (toolName === "getCustomer") {
    if (data.customer?.id) state.customerId = data.customer.id;
    if (data.customer?.name) state.customerName = data.customer.name;
    const quotes = data.activeQuotations ?? data.quotations ?? [];
    if (quotes.length > 0 && !state.quotationId) {
      state.quotationId = quotes[0].id;
      state.quotationNumber = quotes[0].quotationNumber;
    }
  }

  // Quotation resolution
  if (toolName === "getQuotation" || toolName === "inspect_quotation") {
    if (data.id) state.quotationId = data.id;
    if (data.quotationNumber) state.quotationNumber = data.quotationNumber;
    if (data.customerId) state.customerId = data.customerId;
    if (data.customer?.name) state.customerName = data.customer.name;
  }

  // Fulfillment resolution
  if (toolName === "getFulfillment" || toolName === "inspect_inventory_fulfillment" || toolName === "startFulfillment" || toolName === "start_fulfillment") {
    if (data.fulfillment?.id) state.fulfillmentId = data.fulfillment.id;
    else if (data.id) state.fulfillmentId = data.id;
  }

  // Quotation creation
  if (toolName === "prepareQuotation" || toolName === "create_quotation") {
    if (data.id) state.quotationId = data.id;
    if (data.quotationNumber) state.quotationNumber = data.quotationNumber;
  }
}

/**
 * Executes a goal-driven, multi-step agentic workflow:
 * UNDERSTAND GOAL -> PLAN -> SELECT TOOL -> EXECUTE -> OBSERVE RESULT -> REASON -> VERIFY -> COMPLETE
 */
export async function runAgentTask(options: RunAgentOptions): Promise<RunAgentResult> {
  // 1. Initial Plan formulation (sets hypothesis, visible plan, and resolves target quotation)
  const initialPlan = await planAgentTask({
    prompt: options.prompt,
    quotationId: options.quotationId,
    actor: options.actor,
  });

  const resolvedTarget = await resolveQuotationFromPrompt(options.prompt, options.quotationId, options.actor);
  const initialQuotationId = resolvedTarget?.id ?? initialPlan.quotationId ?? options.quotationId ?? null;
  const initialQuotationNumber = resolvedTarget?.quotationNumber ?? initialPlan.quotationNumber ?? null;

  const run = createAgentRun({
    prompt: options.prompt,
    quotationId: initialQuotationId,
    actor: options.actor,
    plan: initialPlan.steps.length > 0
      ? initialPlan.steps.map((s) => `${s.toolName}: ${s.description}`)
      : ["Inspect business context and evaluate next safe operational steps"],
  });

  // 2. Initialize Agent Task State
  const state: AgentTaskState = {
    runId: run.id,
    goal: options.prompt,
    prompt: options.prompt,
    actor: options.actor,
    currentStep: 0,
    maxSteps: 15,
    status: "RUNNING",
    quotationId: initialQuotationId,
    quotationNumber: initialQuotationNumber,
    customerId: null,
    customerName: null,
    fulfillmentId: null,
    observations: [],
    completedActions: [],
    blockers: [],
    pendingHumanApprovals: [],
    history: [],
  };

  const MAX_STEPS = 15;
  let finalSummary = "";

  // 3. Multi-step Autonomous Reason-Act-Observe-Verify Loop
  while (state.status === "RUNNING" && state.currentStep < MAX_STEPS) {
    state.currentStep++;

    // Step A: Reason about next action based on goal, history, and observed results
    const decision = await decideNextStep(state);

    // Step B: Dispatch Reasoner Decision
    if (decision.type === "COMPLETE") {
      state.status = "COMPLETED";
      finalSummary = decision.summary;
      break;
    }

    if (decision.type === "ASK_CLARIFICATION") {
      state.status = "BLOCKED";
      state.blockers.push(`Clarification needed: ${decision.question}`);
      finalSummary = decision.question;
      break;
    }

    if (decision.type === "HALT_BLOCKED") {
      state.status = "FAILED";
      state.blockers.push(decision.reason);
      finalSummary = `Execution blocked: ${decision.reason}`;
      break;
    }

    if (decision.type === "REQUEST_CONFIRMATION") {
      state.status = "AWAITING_CONFIRMATION";
      const pending: PendingHumanApproval = {
        action: decision.toolName,
        toolParams: decision.params,
        requiredRole: decision.requiredRole,
        reason: decision.reason,
        stageId: decision.stageId,
        impactLevel: "HIGH_IMPACT",
      };
      state.pendingHumanApprovals.push(pending);

      awaitConfirmationAgentRun(
        run.id,
        {
          toolName: decision.toolName,
          toolParams: decision.params,
          reason: decision.reason,
        },
        decision.reason
      );

      finalSummary = `Action paused awaiting explicit confirmation: ${decision.reason}`;
      break;
    }

    if (decision.type === "CALL_TOOL") {
      const { toolName, params, hypothesis } = decision;
      const startTime = Date.now();

      // Resolve dynamic parameter placeholders
      const resolvedParams: Record<string, unknown> = { ...params };
      if (!resolvedParams.quotationId && state.quotationId) {
        resolvedParams.quotationId = state.quotationId;
      }
      if (!resolvedParams.fulfillmentId && state.fulfillmentId) {
        resolvedParams.fulfillmentId = state.fulfillmentId;
      }
      if (!resolvedParams.customerId && state.customerId) {
        resolvedParams.customerId = state.customerId;
      }

      // Check tool existence
      const tool = AGENT_TOOL_REGISTRY[toolName];
      if (!tool) {
        const errorMsg = `Tool '${toolName}' is not registered.`;
        recordAgentStep(run.id, {
          stepIndex: state.currentStep,
          thought: errorMsg,
          toolName,
          toolInput: resolvedParams,
          error: errorMsg,
          status: "FAILED",
          durationMs: Date.now() - startTime,
        });
        state.blockers.push(errorMsg);
        continue;
      }

      // Check confirmation override
      const isConfirmed = options.confirmation?.toolName === toolName;

      // Handle already transitioned quotation submission gracefully
      if ((toolName === "submitQuotation" || toolName === "submit_quotation") && state.quotationId) {
        const q = await db.quotation.findUnique({
          where: { id: state.quotationId },
          select: { status: true, quotationNumber: true },
        });
        if (q && q.status !== "DRAFT") {
          const skipMsg = `Quotation ${q.quotationNumber} is already in status '${q.status}'; submission not required.`;
          recordAgentStep(run.id, {
            stepIndex: state.currentStep,
            thought: skipMsg,
            toolName,
            toolInput: resolvedParams,
            toolOutput: { status: q.status, skipped: true },
            status: "SUCCESS",
            durationMs: Date.now() - startTime,
          });
          state.completedActions.push(skipMsg);
          continue;
        }
      }

      // Policy & RBAC verification
      try {
        await assertCanExecuteTool({
          actor: options.actor,
          toolName,
          quotationId: (resolvedParams.quotationId as string) || state.quotationId || undefined,
          toolParams: resolvedParams,
          confirmed: isConfirmed,
        });
      } catch (err: unknown) {
        if (err instanceof AgentConfirmationRequiredError) {
          state.status = "AWAITING_CONFIRMATION";
          const pending: PendingHumanApproval = {
            action: toolName,
            toolParams: resolvedParams,
            requiredRole: TOOL_POLICIES[toolName]?.allowedRoles[0] ?? "SALES_MANAGER",
            reason: err.reason,
            impactLevel: "HIGH_IMPACT",
          };
          state.pendingHumanApprovals.push(pending);

          awaitConfirmationAgentRun(
            run.id,
            {
              toolName: err.toolName as ToolName,
              toolParams: err.toolParams,
              reason: err.reason,
            },
            `Action paused: ${err.message}`
          );

          recordAgentStep(run.id, {
            stepIndex: state.currentStep,
            thought: `High impact action '${toolName}' paused awaiting explicit human confirmation.`,
            toolName,
            toolInput: resolvedParams,
            status: "AWAITING_CONFIRMATION",
            durationMs: Date.now() - startTime,
          });

          return {
            runId: run.id,
            status: "AWAITING_CONFIRMATION",
            prompt: options.prompt,
            quotationId: state.quotationId,
            plan: run.plan,
            steps: run.steps,
            summary: `Paused before high-impact action '${toolName}'. User confirmation required.`,
            requiresConfirmation: true,
            confirmationDetails: {
              toolName: err.toolName as ToolName,
              toolParams: err.toolParams,
              reason: err.reason,
            },
            completedActions: state.completedActions,
            pendingHumanApprovals: state.pendingHumanApprovals.map((p) => ({
              action: p.action,
              requiredRole: String(p.requiredRole),
              reason: p.reason,
              stageId: p.stageId,
            })),
          };
        }

        if (err instanceof AgentPolicyError) {
          recordAgentStep(run.id, {
            stepIndex: state.currentStep,
            thought: `Tool execution blocked by policy: ${err.message}`,
            toolName,
            toolInput: resolvedParams,
            error: err.message,
            status: "FAILED",
            durationMs: Date.now() - startTime,
          });
          failAgentRun(run.id, err.message);
          return {
            runId: run.id,
            status: "FAILED",
            prompt: options.prompt,
            quotationId: state.quotationId,
            plan: run.plan,
            steps: run.steps,
            summary: `Execution stopped by security policy: ${err.message}`,
            completedActions: state.completedActions,
          };
        }

        throw err;
      }

      // Step C: Execute tool through domain service
      try {
        const result = await tool.execute(resolvedParams, options.actor, isConfirmed);
        const durationMs = Date.now() - startTime;

        // Step D: Mutation Verification (Never assume mutations succeeded)
        const verification = tool.classification === "ACTION"
          ? await verifyActionMutation(toolName, resolvedParams, result.data)
          : undefined;

        if (tool.classification === "ACTION") {
          state.completedActions.push(
            `${toolName}: ${result.summary}${verification ? ` [Verified: ${verification.message}]` : ""}`
          );
        }

        // Record step in state memory & audit log
        state.observations.push(`[${toolName}] ${result.summary}`);
        state.history.push({
          stepIndex: state.currentStep,
          toolName,
          toolInput: resolvedParams,
          toolOutput: result.data,
          status: "SUCCESS",
          summary: result.summary,
          verification,
          durationMs,
          timestamp: new Date().toISOString(),
        });

        recordAgentStep(run.id, {
          stepIndex: state.currentStep,
          thought: hypothesis ? `${hypothesis} -> ${result.summary}` : result.summary,
          toolName,
          toolInput: resolvedParams,
          toolOutput: result.data,
          status: "SUCCESS",
          durationMs,
        });

        // Step E: Observe and dynamically update state IDs
        updateStateFromToolOutput(state, toolName, result.data);

        // Track pending reviewer stages from approval checks as informational governance flags
        if (
          (toolName === "getApprovalStatus" || toolName === "inspect_approvals") &&
          result.data &&
          typeof result.data === "object"
        ) {
          const ap = result.data as { pendingApprovals?: Array<{ id: string; level: string }> };
          if (ap.pendingApprovals && ap.pendingApprovals.length > 0) {
            for (const stage of ap.pendingApprovals) {
              if (!state.pendingHumanApprovals.some((p) => p.stageId === stage.id)) {
                state.pendingHumanApprovals.push({
                  action: "approveDeal",
                  stageId: stage.id,
                  requiredRole: stage.level === "MANAGER" ? "SALES_MANAGER" : "FINANCE",
                  reason: `Quotation requires formal ${stage.level} human sign-off under governance policy.`,
                  impactLevel: "HIGH_IMPACT",
                });
              }
            }
          }
        }
      } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const durationMs = Date.now() - startTime;

        recordAgentStep(run.id, {
          stepIndex: state.currentStep,
          thought: `Tool execution failed: ${errorMsg}`,
          toolName,
          toolInput: resolvedParams,
          error: errorMsg,
          status: "FAILED",
          durationMs,
        });

        state.history.push({
          stepIndex: state.currentStep,
          toolName,
          toolInput: resolvedParams,
          status: "FAILED",
          summary: `Failed: ${errorMsg}`,
          error: errorMsg,
          durationMs,
          timestamp: new Date().toISOString(),
        });

        state.blockers.push(`Tool ${toolName} failed: ${errorMsg}`);
        // Let the reasoner loop continue so it can observe the failure on next turn!
      }
    }
  }

  // 4. Formulate Concise Structured Report
  const isAwaitingConfirmation = state.status === "AWAITING_CONFIRMATION";
  const quoteRef = state.quotationNumber ?? state.quotationId ?? "Deal";

  if (!finalSummary) {
    let report = `### DealFlow360 Operational Report: ${quoteRef}\n\n`;

    report += `#### 1. Verified Completed Actions:\n`;
    if (state.completedActions.length > 0) {
      state.completedActions.forEach((act, idx) => {
        report += `${idx + 1}. ${act}.\n`;
      });
    } else {
      state.observations.forEach((obs) => {
        report += `• ${obs}\n`;
      });
    }

    report += `\n#### 2. Governance & Human Approval Gates:\n`;
    if (state.pendingHumanApprovals.length > 0) {
      state.pendingHumanApprovals.forEach((item, idx) => {
        report += `${idx + 1}. **Action**: \`${item.action}\` (Stage: \`${item.stageId ?? "PENDING"}\`)\n`;
        report += `   - **Required Role**: **${item.requiredRole}**\n`;
        report += `   - **Governance Reason**: ${item.reason}\n`;
      });
      if (isAwaitingConfirmation) {
        report += `\n> 🛑 **Execution Paused**: Human confirmation is required before proceeding with this high-impact action.`;
      }
    } else {
      report += `• None. All executed steps completed within standard operational boundaries.\n`;
    }

    finalSummary = report;
  }

  if (state.status === "COMPLETED") {
    completeAgentRun(run.id, finalSummary);
  } else if (state.status === "FAILED") {
    failAgentRun(run.id, state.blockers.join("; ") || finalSummary);
  }

  const resolvedStatus: RunAgentResult["status"] =
    state.status === "AWAITING_CONFIRMATION"
      ? "AWAITING_CONFIRMATION"
      : state.status === "FAILED"
      ? "FAILED"
      : "COMPLETED";

  return {
    runId: run.id,
    status: resolvedStatus,
    prompt: options.prompt,
    quotationId: state.quotationId,
    plan: run.plan,
    steps: run.steps,
    summary: finalSummary,
    completedActions: state.completedActions,
    pendingHumanApprovals: state.pendingHumanApprovals.map((p) => ({
      action: p.action,
      requiredRole: String(p.requiredRole),
      reason: p.reason,
      stageId: p.stageId,
    })),
    requiresConfirmation: isAwaitingConfirmation,
  };
}
