export type AppErrorCode =
  | 'account-blocked'
  | 'configuration'
  | 'conflict'
  | 'forbidden'
  | 'invitation-expired'
  | 'invitation-revoked'
  | 'invitation-superseded'
  | 'invitation-used'
  | 'network'
  | 'not-found'
  | 'origin-denied'
  | 'role-not-grantable'
  | 'server'
  | 'unexpected'
  | 'unauthenticated'
  | 'validation';

export interface AppError {
  readonly code: AppErrorCode;
  readonly message: string;
}

export class AppResultError extends Error {
  public readonly appError: AppError;

  public constructor(appError: AppError) {
    super(appError.message);
    this.name = 'AppResultError';
    this.appError = appError;
  }
}

export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly error: AppError; readonly ok: false };

export const success = <T>(value: T): Result<T> => ({ ok: true, value });

export const failure = <T = never>(error: AppError): Result<T> => ({
  error,
  ok: false,
});

export async function unwrapResult<T>(result: Promise<Result<T>>): Promise<T> {
  const settled = await result;

  if (!settled.ok) {
    throw new AppResultError(settled.error);
  }

  return settled.value;
}
