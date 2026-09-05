export class NegotiationError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
    public readonly code: string = "NEGOTIATION_ERROR"
  ) {
    super(message);
    this.name = "NegotiationError";
  }
}

export function badRequest(
  message: string,
  code: string = "BAD_REQUEST"
): NegotiationError {
  return new NegotiationError(message, 400, code);
}

export function forbidden(
  message: string,
  code: string = "FORBIDDEN"
): NegotiationError {
  return new NegotiationError(message, 403, code);
}

export function notFound(
  message: string,
  code: string = "NOT_FOUND"
): NegotiationError {
  return new NegotiationError(message, 404, code);
}

export function conflict(
  message: string,
  code: string = "CONFLICT"
): NegotiationError {
  return new NegotiationError(message, 409, code);
}
