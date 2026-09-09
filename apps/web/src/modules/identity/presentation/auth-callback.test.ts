import { describe, expect, it } from 'vitest';

import { parseAuthCallback } from './auth-callback';

describe('parseAuthCallback', () => {
  it('accepts only a base64url challenge from the query', () => {
    expect(
      parseAuthCallback(`?invitation_challenge=${'a'.repeat(43)}`, ''),
    ).toEqual({ challenge: 'a'.repeat(43), failure: null });
    expect(parseAuthCallback('?invitation_challenge=short', '')).toEqual({
      challenge: null,
      failure: 'invalid_challenge',
    });
  });

  it('reads Auth errors without returning their description', () => {
    expect(
      parseAuthCallback(
        '?error_code=otp_expired&error_description=contains-a-token',
        '',
      ),
    ).toEqual({ challenge: null, failure: 'auth_error' });
  });

  it('does not accept a challenge hidden in the fragment', () => {
    expect(
      parseAuthCallback('', '#invitation_challenge=not-forwarded'),
    ).toEqual({ challenge: null, failure: null });
  });

  it('rejects an invitation callback that lost its challenge', () => {
    expect(parseAuthCallback('?type=invite', '')).toEqual({
      challenge: null,
      failure: 'invalid_challenge',
    });
  });
});
