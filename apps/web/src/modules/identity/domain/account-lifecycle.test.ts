import { describe, expect, it } from 'vitest';

import {
  accountStatuses,
  createAccountTransition,
  hasOperationalAccess,
  isBlockedAccountStatus,
  normalizeAdministrativeReason,
  requiresOnboarding,
} from './account-lifecycle';

const validTransitions = [
  ['invited', 'pending_profile'],
  ['pending_profile', 'active'],
  ['active', 'suspended'],
  ['suspended', 'active'],
  ['active', 'archived'],
  ['suspended', 'archived'],
  ['archived', 'active'],
] as const;

describe('account lifecycle', () => {
  it.each(validTransitions)('allows %s → %s', (from, to) => {
    expect(createAccountTransition(from, to)).toEqual({
      ok: true,
      value: { from, to },
    });
  });

  it('rejects every transition not in the approved matrix', () => {
    for (const from of accountStatuses) {
      for (const to of accountStatuses) {
        const approved = validTransitions.some(
          ([allowedFrom, allowedTo]) =>
            allowedFrom === from && allowedTo === to,
        );

        if (!approved) {
          expect(createAccountTransition(from, to)).toMatchObject({
            error: { code: 'conflict' },
            ok: false,
          });
        }
      }
    }
  });

  it('classifies operational, onboarding and blocked states', () => {
    expect(hasOperationalAccess('active')).toBe(true);
    expect(hasOperationalAccess('suspended')).toBe(false);
    expect(requiresOnboarding('invited')).toBe(true);
    expect(requiresOnboarding('pending_profile')).toBe(true);
    expect(isBlockedAccountStatus('suspended')).toBe(true);
    expect(isBlockedAccountStatus('archived')).toBe(true);
  });

  it('normalizes valid administrative reasons and rejects invalid ones', () => {
    expect(normalizeAdministrativeReason('  Motivo   válido  ')).toEqual({
      ok: true,
      value: 'Motivo válido',
    });
    expect(normalizeAdministrativeReason('x')).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
    expect(normalizeAdministrativeReason('x'.repeat(501))).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
  });
});
