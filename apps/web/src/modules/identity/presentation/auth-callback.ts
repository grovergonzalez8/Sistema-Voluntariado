const challengePattern = /^[A-Za-z0-9_-]{43}$/u;

export type AuthCallbackFailure =
  'auth_error' | 'actor_mismatch' | 'invalid_challenge';

export interface AuthCallbackInput {
  readonly challenge: string | null;
  readonly failure: AuthCallbackFailure | null;
}

const authErrorCodes = new Set([
  'access_denied',
  'invalid_request',
  'invalid_token',
  'otp_expired',
  'server_error',
  'unauthorized_client',
]);

function callbackParams(search: string, hash: string): URLSearchParams {
  const params = new URLSearchParams(search);
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash;
  const fragmentParams = new URLSearchParams(fragment);
  for (const key of ['error', 'error_code', 'type']) {
    if (!params.has(key) && fragmentParams.has(key)) {
      const value = fragmentParams.get(key);
      if (value !== null) params.set(key, value);
    }
  }
  return params;
}

export function parseAuthCallback(
  search: string,
  hash: string,
): AuthCallbackInput {
  const params = callbackParams(search, hash);
  const errorCode = params.get('error_code') ?? params.get('error');
  if (errorCode && authErrorCodes.has(errorCode)) {
    return { challenge: null, failure: 'auth_error' };
  }
  if (errorCode) return { challenge: null, failure: 'auth_error' };

  const rawChallenge = params.get('invitation_challenge');
  if (rawChallenge === null) {
    return params.get('type') === 'invite'
      ? { challenge: null, failure: 'invalid_challenge' }
      : { challenge: null, failure: null };
  }
  if (!challengePattern.test(rawChallenge)) {
    return { challenge: null, failure: 'invalid_challenge' };
  }
  return { challenge: rawChallenge, failure: null };
}

export function callbackFailureMessage(failure: AuthCallbackFailure): string {
  switch (failure) {
    case 'actor_mismatch':
      return 'actorMismatch';
    case 'invalid_challenge':
      return 'invalidChallenge';
    case 'auth_error':
      return 'authError';
  }
}
