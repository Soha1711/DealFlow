import type { Role } from "@prisma/client";
import type { ToolName, ToolImpactLevel } from "./tool-policy";

export type AgentActor = {
  userId: string;
  role: Role;
  customerId?: string | null;
  name?: string;
  email?: string;
};

export type ToolVerificationResult = {
  verified: boolean;
  message: string;
  details?: Record<string, unknown>;
};

export type StepObservation = {
  stepIndex: number;
  toolName: ToolName;
  toolInput: Record<string, unknown>;
  toolOutput?: unknown;
  status: "SUCCESS" | "FAILED" | "SKIPPED" | "AWAITING_CONFIRMATION";
  summary: string;
  verification?: ToolVerificationResult;
  error?: string;
  durationMs: number;
  timestamp: string;
};

export type PendingHumanApproval = {
  action: ToolName | string;
  toolParams?: Record<string, unknown>;
  requiredRole: Role | string;
  reason: string;
  stageId?: string;
  impactLevel: ToolImpactLevel;
};

export type AgentTaskState = {
  runId: string;
  goal: string;
  prompt: string;
  actor: AgentActor;
  currentStep: number;
  maxSteps: number;
  status: "RUNNING" | "COMPLETED" | "AWAITING_CONFIRMATION" | "FAILED" | "BLOCKED";
  
  // Dynamic business context discovered during execution
  quotationId?: string | null;
  quotationNumber?: string | null;
  customerId?: string | null;
  customerName?: string | null;
  fulfillmentId?: string | null;
  invoiceId?: string | null;
  
  // Traceable operational memory
  observations: string[];
  completedActions: string[];
  blockers: string[];
  pendingHumanApprovals: PendingHumanApproval[];
  
  // Execution history
  history: StepObservation[];
  
  // Final business summary
  finalSummary?: string;
};

export type ReasonerDecision =
  | {
      type: "CALL_TOOL";
      toolName: ToolName;
      params: Record<string, unknown>;
      hypothesis: string;
    }
  | {
      type: "REQUEST_CONFIRMATION";
      toolName: ToolName;
      params: Record<string, unknown>;
      requiredRole: Role;
      reason: string;
      stageId?: string;
    }
  | {
      type: "ASK_CLARIFICATION";
      question: string;
      missingInformation: string[];
    }
  | {
      type: "COMPLETE";
      summary: string;
      verifiedOutcome?: string;
    }
  | {
      type: "HALT_BLOCKED";
      reason: string;
      blockerType: "AUTHORIZATION" | "BUSINESS_RULE" | "NOT_FOUND" | "TOOL_FAILURE";
    };
