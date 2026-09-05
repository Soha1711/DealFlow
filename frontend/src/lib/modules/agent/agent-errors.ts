export class AgentError extends Error {
  constructor(
    message: string,
    public readonly code: string = "AGENT_ERROR",
    public readonly status: number = 400,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "AgentError";
  }
}

export class AgentPolicyError extends AgentError {
  constructor(message: string, code: string = "FORBIDDEN", details?: unknown) {
    super(message, code, 403, details);
    this.name = "AgentPolicyError";
  }
}

export class AgentConfirmationRequiredError extends AgentError {
  constructor(
    message: string,
    public readonly toolName: string,
    public readonly toolParams: Record<string, unknown>,
    public readonly reason: string
  ) {
    super(message, "CONFIRMATION_REQUIRED", 422, { toolName, toolParams, reason });
    this.name = "AgentConfirmationRequiredError";
  }
}

export class AgentExecutionError extends AgentError {
  constructor(message: string, code: string = "EXECUTION_FAILED", details?: unknown) {
    super(message, code, 500, details);
    this.name = "AgentExecutionError";
  }
}
