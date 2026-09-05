/**
 * Domain error carrying an HTTP status code for the billing domain.
 * Thrown by billing services and translated into a structured JSON error
 * response by the billing API routes.
 */
export class BillingError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "BillingError";
  }
}

export function badRequest(message: string, code?: string): BillingError {
  return new BillingError(400, message, code ?? "BAD_REQUEST");
}

export function forbidden(message: string, code?: string): BillingError {
  return new BillingError(403, message, code ?? "FORBIDDEN");
}

export function notFound(message: string, code?: string): BillingError {
  return new BillingError(404, message, code ?? "NOT_FOUND");
}

export function conflict(message: string, code?: string): BillingError {
  return new BillingError(409, message, code ?? "CONFLICT");
} 