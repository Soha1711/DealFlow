/**
 * Domain error carrying an HTTP status code. Thrown by the quotation service
 * and translated into a structured JSON error response by the API routes.
 */
export class QuotationError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string
  ) {
    super(message);
    this.name = "QuotationError";
  }
}

export function badRequest(message: string, code?: string): QuotationError {
  return new QuotationError(400, message, code ?? "BAD_REQUEST");
}

export function forbidden(message: string, code?: string): QuotationError {
  return new QuotationError(403, message, code ?? "FORBIDDEN");
}

export function notFound(message: string, code?: string): QuotationError {
  return new QuotationError(404, message, code ?? "NOT_FOUND");
}

export function conflict(message: string, code?: string): QuotationError {
  return new QuotationError(409, message, code ?? "CONFLICT");
}