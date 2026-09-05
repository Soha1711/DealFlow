/**
 * Domain error carrying an HTTP status code for the approval workflow.
 * Thrown by the approval service and translated into a structured JSON
 * error response by the approval API routes.
 */
export class ApprovalError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}

export function badRequest(message: string, code?: string): ApprovalError {
  return new ApprovalError(400, message, code ?? "BAD_REQUEST");
}

export function forbidden(message: string, code?: string): ApprovalError {
  return new ApprovalError(403, message, code ?? "FORBIDDEN");
}

export function notFound(message: string, code?: string): ApprovalError {
  return new ApprovalError(404, message, code ?? "NOT_FOUND");
}

export function conflict(message: string, code?: string): ApprovalError {
  return new ApprovalError(409, message, code ?? "CONFLICT");
}