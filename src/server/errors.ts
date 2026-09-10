import 'server-only';
import { isProduction } from './env';

/**
 * Errors that are safe to show a user.
 *
 * Anything that is NOT an AppError is treated as an internal fault: it gets
 * logged server-side with its stack and replaced with a generic message. Stack
 * traces, SQL text and Prisma internals never cross the wire.
 */
export type AppErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'LIMIT_REACHED';

export class AppError extends Error {
  readonly code: AppErrorCode;
  readonly fieldErrors?: Record<string, string>;

  constructor(code: AppErrorCode, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export const unauthenticated = (message = 'Please sign in to continue.') =>
  new AppError('UNAUTHENTICATED', message);

export const forbidden = (message = 'You do not have access to this.') =>
  new AppError('FORBIDDEN', message);

export const notFound = (message = 'We could not find that.') => new AppError('NOT_FOUND', message);

export const invalid = (message: string, fieldErrors?: Record<string, string>) =>
  new AppError('VALIDATION', message, fieldErrors);

export const conflict = (message: string) => new AppError('CONFLICT', message);

/** Shape returned by every Server Action. */
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string; code: AppErrorCode; fieldErrors?: Record<string, string> };

export function actionFailure(error: unknown): Extract<ActionResult<never>, { ok: false }> {
  if (error instanceof AppError) {
    return { ok: false, error: error.message, code: error.code, fieldErrors: error.fieldErrors };
  }

  // Unexpected: log the detail, return nothing useful to an attacker.
  const reference = Math.random().toString(36).slice(2, 8).toUpperCase();
  console.error(`[expensex] unhandled action error (ref ${reference})`, error);

  return {
    ok: false,
    code: 'VALIDATION',
    error: isProduction
      ? `Something went wrong on our side. Reference ${reference}.`
      : `Unexpected error (ref ${reference}): ${
          error instanceof Error ? error.message : String(error)
        }`,
  };
}

/** Convenience for actions that return no payload. */
export const actionSuccess = (): ActionResult => ({ ok: true });
