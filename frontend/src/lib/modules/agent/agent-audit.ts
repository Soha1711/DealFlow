import type { Role } from "@prisma/client";
import type { ToolName } from "./tool-policy";

export type AgentStepStatus = "SUCCESS" | "FAILED" | "SKIPPED" | "AWAITING_CONFIRMATION";

export type AgentStepRecord = {
  stepIndex: number;
  thought: string;
  toolName: ToolName;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  error?: string;
  status: AgentStepStatus;
  durationMs: number;
  timestamp: string;
};

export type AgentRunStatus = "RUNNING" | "COMPLETED" | "AWAITING_CONFIRMATION" | "FAILED";

export type AgentRunRecord = {
  id: string;
  prompt: string;
  quotationId?: string | null;
  actor: {
    userId: string;
    role: Role;
    name?: string;
    customerId?: string | null;
  };
  status: AgentRunStatus;
  plan: string[];
  steps: AgentStepRecord[];
  finalMessage?: string;
  confirmationDetails?: {
    toolName: ToolName;
    toolParams: Record<string, unknown>;
    reason: string;
  };
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
};

// Thread-safe in-memory bounded ring buffer
const MAX_AUDIT_RUNS = 200;
const auditRuns = new Map<string, AgentRunRecord>();

function generateId(): string {
  return `run-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

export function createAgentRun(options: {
  prompt: string;
  quotationId?: string | null;
  actor: AgentRunRecord["actor"];
  plan: string[];
}): AgentRunRecord {
  const id = generateId();
  const run: AgentRunRecord = {
    id,
    prompt: options.prompt,
    quotationId: options.quotationId ?? null,
    actor: options.actor,
    status: "RUNNING",
    plan: options.plan,
    steps: [],
    startedAt: new Date().toISOString(),
  };

  auditRuns.set(id, run);

  // Evict oldest if exceeding capacity
  if (auditRuns.size > MAX_AUDIT_RUNS) {
    const oldestKey = auditRuns.keys().next().value;
    if (oldestKey) auditRuns.delete(oldestKey);
  }

  return run;
}

export function recordAgentStep(
  runId: string,
  step: Omit<AgentStepRecord, "timestamp">
): AgentStepRecord | null {
  const run = auditRuns.get(runId);
  if (!run) return null;

  const fullStep: AgentStepRecord = {
    ...step,
    timestamp: new Date().toISOString(),
  };
  run.steps.push(fullStep);
  return fullStep;
}

export function completeAgentRun(runId: string, finalMessage: string): AgentRunRecord | null {
  const run = auditRuns.get(runId);
  if (!run) return null;

  const completedAt = new Date().toISOString();
  run.status = "COMPLETED";
  run.finalMessage = finalMessage;
  run.completedAt = completedAt;
  run.durationMs = new Date(completedAt).getTime() - new Date(run.startedAt).getTime();
  return run;
}

export function awaitConfirmationAgentRun(
  runId: string,
  details: NonNullable<AgentRunRecord["confirmationDetails"]>,
  message: string
): AgentRunRecord | null {
  const run = auditRuns.get(runId);
  if (!run) return null;

  run.status = "AWAITING_CONFIRMATION";
  run.confirmationDetails = details;
  run.finalMessage = message;
  return run;
}

export function failAgentRun(runId: string, error: string): AgentRunRecord | null {
  const run = auditRuns.get(runId);
  if (!run) return null;

  const completedAt = new Date().toISOString();
  run.status = "FAILED";
  run.finalMessage = `Agent execution failed: ${error}`;
  run.completedAt = completedAt;
  run.durationMs = new Date(completedAt).getTime() - new Date(run.startedAt).getTime();
  return run;
}

export function getAgentRun(id: string): AgentRunRecord | null {
  return auditRuns.get(id) ?? null;
}

export function listAgentRuns(
  actor: { userId: string; role: Role; customerId?: string | null },
  quotationId?: string
): AgentRunRecord[] {
  const all = Array.from(auditRuns.values()).sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
  );

  return all.filter((run) => {
    // If quotationId specified, filter by it
    if (quotationId && run.quotationId !== quotationId) return false;

    // RBAC visibility
    if (actor.role === "ADMIN" || actor.role === "SALES_MANAGER") {
      return true;
    }
    if (actor.role === "CUSTOMER") {
      return run.actor.customerId === actor.customerId || run.actor.userId === actor.userId;
    }
    if (actor.role === "SALES_REP") {
      return run.actor.userId === actor.userId;
    }
    // Finance / Operations can see runs relevant to internal business
    return true;
  });
}
