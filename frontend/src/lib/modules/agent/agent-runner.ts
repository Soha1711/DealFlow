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
import { planAgentTask } from "./agent-planner";
import { assertCanExecuteTool, type AgentActor, type ToolName } from "./tool-policy";
import { AGENT_TOOL_REGISTRY } from "./tool-registry";

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
  status: "COMPLETED" | "AWAITING_CONFIRMATION" | "FAILED";
  prompt: string;
  quotationId?: string | null;
  plan: string[];
  steps: AgentRunRecord["steps"];
  summary: string;
  requiresConfirmation?: boolean;
  confirmationDetails?: AgentRunRecord["confirmationDetails"];
};

export async function runAgentTask(options: RunAgentOptions): Promise<RunAgentResult> {
  const plan = await planAgentTask({
    prompt: options.prompt,
    quotationId: options.quotationId,
    actor: options.actor,
  });

  if (!plan.steps || plan.steps.length === 0) {
    const run = createAgentRun({
      prompt: options.prompt,
      quotationId: options.quotationId,
      actor: options.actor,
      plan: ["Inspect general query context"],
    });

    const summary = options.quotationId
      ? `Task planned, but no automated operational actions were required for quotation ${options.quotationId}.`
      : "Please specify a target quotation (e.g. 'Prepare quotation Q-1001 for approval' or select a deal) to execute automated workflows.";

    completeAgentRun(run.id, summary);

    return {
      runId: run.id,
      status: "COMPLETED",
      prompt: options.prompt,
      quotationId: options.quotationId,
      plan: run.plan,
      steps: run.steps,
      summary,
    };
  }

  const run = createAgentRun({
    prompt: options.prompt,
    quotationId: plan.quotationId,
    actor: options.actor,
    plan: plan.steps.map((s) => `${s.toolName}: ${s.description}`),
  });

  let currentFulfillmentId: string | null = null;
  const executionContext: Record<string, unknown> = {};

  const MAX_STEPS = 10;
  let stepCount = 0;

  for (let i = 0; i < plan.steps.length; i++) {
    if (++stepCount > MAX_STEPS) break;

    const step = plan.steps[i];
    const startTime = Date.now();

    // Dynamically resolve parameters based on prior step context
    const resolvedParams: Record<string, unknown> = { ...step.params };
    if (resolvedParams.fulfillmentId === "DYNAMIC_FROM_PREVIOUS_STEP") {
      if (!currentFulfillmentId && plan.quotationId) {
        const existing = await db.fulfillment.findFirst({
          where: { quotationId: plan.quotationId, status: { not: "CANCELLED" } },
          select: { id: true },
        });
        currentFulfillmentId = existing?.id ?? null;
      }
      resolvedParams.fulfillmentId = currentFulfillmentId ?? "";
    }

    // Check if this step was confirmed by user input
    const isConfirmed =
      options.confirmation?.toolName === step.toolName;

    // Graceful handling for already transitioned states
    if (step.toolName === "submit_quotation" && plan.quotationId) {
      const q = await db.quotation.findUnique({
        where: { id: plan.quotationId },
        select: { status: true, quotationNumber: true },
      });
      if (q && q.status !== "DRAFT") {
        recordAgentStep(run.id, {
          stepIndex: i + 1,
          thought: `Quotation ${q.quotationNumber} is already in status '${q.status}'; submission not required.`,
          toolName: step.toolName,
          toolInput: resolvedParams,
          toolOutput: { status: q.status, skipped: true },
          status: "SUCCESS",
          durationMs: Date.now() - startTime,
        });
        continue;
      }
    }

    if (step.toolName === "start_fulfillment" && plan.quotationId) {
      const existing = await db.fulfillment.findFirst({
        where: { quotationId: plan.quotationId, status: { not: "CANCELLED" } },
        select: { id: true, status: true },
      });
      if (existing) {
        currentFulfillmentId = existing.id;
        recordAgentStep(run.id, {
          stepIndex: i + 1,
          thought: `Quotation already has an active fulfillment record (${existing.id}, Status: ${existing.status}).`,
          toolName: step.toolName,
          toolInput: resolvedParams,
          toolOutput: existing,
          status: "SUCCESS",
          durationMs: Date.now() - startTime,
        });
        continue;
      }
    }

    // Tool execution & safety policy check
    try {
      await assertCanExecuteTool({
        actor: options.actor,
        toolName: step.toolName,
        quotationId: plan.quotationId ?? undefined,
        toolParams: resolvedParams,
        confirmed: isConfirmed,
      });
    } catch (err: unknown) {
      if (err instanceof AgentConfirmationRequiredError) {
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
          stepIndex: i + 1,
          thought: `High impact action '${step.toolName}' paused awaiting explicit user confirmation.`,
          toolName: step.toolName,
          toolInput: resolvedParams,
          status: "AWAITING_CONFIRMATION",
          durationMs: Date.now() - startTime,
        });

        return {
          runId: run.id,
          status: "AWAITING_CONFIRMATION",
          prompt: options.prompt,
          quotationId: plan.quotationId,
          plan: run.plan,
          steps: run.steps,
          summary: `The agent completed preliminary inspection steps and requires confirmation to execute high-impact action: ${step.toolName}.`,
          requiresConfirmation: true,
          confirmationDetails: {
            toolName: err.toolName as ToolName,
            toolParams: err.toolParams,
            reason: err.reason,
          },
        };
      }

      if (err instanceof AgentPolicyError) {
        const errorMsg = err.message;
        recordAgentStep(run.id, {
          stepIndex: i + 1,
          thought: `Tool execution blocked by security policy: ${errorMsg}`,
          toolName: step.toolName,
          toolInput: resolvedParams,
          error: errorMsg,
          status: "FAILED",
          durationMs: Date.now() - startTime,
        });

        failAgentRun(run.id, errorMsg);

        return {
          runId: run.id,
          status: "FAILED",
          prompt: options.prompt,
          quotationId: plan.quotationId,
          plan: run.plan,
          steps: run.steps,
          summary: `Agent execution stopped: ${errorMsg}`,
        };
      }

      throw err;
    }

    // Execute through the registered tool
    const tool = AGENT_TOOL_REGISTRY[step.toolName];
    if (!tool) {
      const err = `Tool ${step.toolName} is not registered.`;
      recordAgentStep(run.id, {
        stepIndex: i + 1,
        thought: err,
        toolName: step.toolName,
        toolInput: resolvedParams,
        error: err,
        status: "FAILED",
        durationMs: Date.now() - startTime,
      });
      failAgentRun(run.id, err);
      return {
        runId: run.id,
        status: "FAILED",
        prompt: options.prompt,
        quotationId: plan.quotationId,
        plan: run.plan,
        steps: run.steps,
        summary: err,
      };
    }

    try {
      const result = await tool.execute(resolvedParams, options.actor, isConfirmed);

      // Track active fulfillment ID if created
      if (step.toolName === "start_fulfillment" && result.data && typeof result.data === "object" && "id" in result.data) {
        currentFulfillmentId = String((result.data as { id: string }).id);
      }

      executionContext[step.toolName] = result.data;

      recordAgentStep(run.id, {
        stepIndex: i + 1,
        thought: result.summary,
        toolName: step.toolName,
        toolInput: resolvedParams,
        toolOutput: result.data,
        status: "SUCCESS",
        durationMs: Date.now() - startTime,
      });
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      recordAgentStep(run.id, {
        stepIndex: i + 1,
        thought: `Tool execution failed: ${errorMsg}`,
        toolName: step.toolName,
        toolInput: resolvedParams,
        error: errorMsg,
        status: "FAILED",
        durationMs: Date.now() - startTime,
      });

      failAgentRun(run.id, errorMsg);

      return {
        runId: run.id,
        status: "FAILED",
        prompt: options.prompt,
        quotationId: plan.quotationId,
        plan: run.plan,
        steps: run.steps,
        summary: `Execution halted at step ${i + 1} (${step.toolName}): ${errorMsg}`,
      };
    }
  }

  // Compose comprehensive completion summary
  let finalSummary = `Successfully executed multi-step sales operations plan for ${plan.quotationNumber ?? "quotation"}.\n`;
  finalSummary += `Steps completed: ${run.steps.length}/${plan.steps.length}.\n`;

  for (const step of run.steps) {
    finalSummary += `• [${step.toolName}] ${step.thought}\n`;
  }

  completeAgentRun(run.id, finalSummary);

  return {
    runId: run.id,
    status: "COMPLETED",
    prompt: options.prompt,
    quotationId: plan.quotationId,
    plan: run.plan,
    steps: run.steps,
    summary: finalSummary,
  };
}
