import 'server-only';

export type AppErrorCode =
  'validation_error' | 'unauthorized' | 'forbidden' | 'not_found' | 'conflict' | 'rate_limited';

type AppErrorOptions = Readonly<{
  cause?: unknown;
}>;

export abstract class AppError extends Error {
  public abstract readonly code: AppErrorCode;
  public abstract readonly statusCode: number;

  public constructor(message: string, options?: AppErrorOptions) {
    super(message, options);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  public readonly code = 'validation_error';
  public readonly statusCode = 400;
}

export class UnauthorizedError extends AppError {
  public readonly code = 'unauthorized';
  public readonly statusCode = 401;
}

export class ForbiddenError extends AppError {
  public readonly code = 'forbidden';
  public readonly statusCode = 403;
}

export class NotFoundError extends AppError {
  public readonly code = 'not_found';
  public readonly statusCode = 404;
}

export class ConflictError extends AppError {
  public readonly code = 'conflict';
  public readonly statusCode = 409;
}

export class RateLimitError extends AppError {
  public readonly code = 'rate_limited';
  public readonly statusCode = 429;
}
