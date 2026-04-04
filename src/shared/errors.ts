/**
 * Base application error with HTTP status code support.
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;
  public readonly details?: unknown;

  constructor(
    message: string,
    statusCode = 500,
    isOperational = true,
    details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }
}

/** 404 — Resource not found */
export class NotFoundError extends AppError {
  constructor(resource: string, id?: string) {
    const msg = id
      ? `${resource} with id '${id}' not found`
      : `${resource} not found`;
    super(msg, 404);
  }
}

/** 400 — Bad request / validation error */
export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, 400, true, details);
  }
}

/** 409 — Conflict (duplicate, state mismatch) */
export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
  }
}

/** 401 — Unauthorized */
export class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401);
  }
}

/** 403 — Forbidden */
export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
  }
}

/** 503 — Service unavailable (database down, LLM provider down) */
export class ServiceUnavailableError extends AppError {
  constructor(service: string) {
    super(`${service} is currently unavailable`, 503);
  }
}

/** 429 — Rate limit exceeded */
export class RateLimitError extends AppError {
  constructor(provider?: string) {
    const msg = provider
      ? `Rate limit exceeded for ${provider}`
      : 'Rate limit exceeded';
    super(msg, 429);
  }
}

/**
 * Determines whether an error is an operational error that can be
 * handled gracefully (vs a programmer error / unexpected crash).
 */
export function isOperationalError(error: unknown): error is AppError {
  return error instanceof AppError && error.isOperational;
}
