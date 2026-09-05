/**
 * Domain error carrying an HTTP status code for the fulfillment workflow.
 * Thrown by the fulfillment service and translated into a structured JSON
 * error response by the fulfillment API routes.
 */
export class FulfillmentError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "FulfillmentError";
  }
}

export function badRequest(message: string, code?: string): FulfillmentError {
  return new FulfillmentError(400, message, code ?? "BAD_REQUEST");
}

export function forbidden(message: string, code?: string): FulfillmentError {
  return new FulfillmentError(403, message, code ?? "FORBIDDEN");
}

export function notFound(message: string, code?: string): FulfillmentError {
  return new FulfillmentError(404, message, code ?? "NOT_FOUND");
}

export function conflict(message: string, code?: string): FulfillmentError {
  return new FulfillmentError(409, message, code ?? "CONFLICT");
}