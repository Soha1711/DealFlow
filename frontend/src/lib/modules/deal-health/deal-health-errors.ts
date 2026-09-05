export class DealHealthError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400
  ) {
    super(message);
    this.name = "DealHealthError";
  }
}

export function notFound(message = "Deal health resource not found."): DealHealthError {
  return new DealHealthError(message, 404);
}

export function forbidden(message = "You do not have permission to view deal health."): DealHealthError {
  return new DealHealthError(message, 403);
}

export function badRequest(message: string): DealHealthError {
  return new DealHealthError(message, 400);
}
