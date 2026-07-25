import { describe, expect, it } from 'vitest';

import {
  createCanonicalInvitationRequest,
  createInvitationFingerprintSource,
  createInvitationTransition,
  getEffectiveInvitationStatus,
  getInvitationAcceptanceError,
  normalizeEmail,
} from './invitation';

describe('invitation domain', () => {
  it('normalizes email without changing dots or plus aliases', () => {
    expect(normalizeEmail('  Volunteer.One+local@EXAMPLE.invalid ')).toEqual({
      ok: true,
      value: 'volunteer.one+local@example.invalid',
    });
  });

  it.each([
    'missing-at.invalid',
    '@example.invalid',
    'a@invalid',
    'a b@example.invalid',
  ])('rejects invalid email %s', (email) => {
    expect(normalizeEmail(email)).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
  });

  it('creates a stable canonical fingerprint source', () => {
    const first = createCanonicalInvitationRequest({
      displayName: '  Invitada   local ',
      email: 'INVITED@example.invalid',
      preferredLocale: 'es',
      requestedInitialRoleCode: 'volunteer',
    });
    const second = createCanonicalInvitationRequest({
      displayName: 'Invitada local',
      email: 'invited@example.invalid',
      preferredLocale: 'es',
      requestedInitialRoleCode: 'volunteer',
    });

    expect(first.ok).toBe(true);
    expect(second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(createInvitationFingerprintSource('create', first.value)).toBe(
        createInvitationFingerprintSource('create', second.value),
      );
    }
  });

  it('derives expiration only for an open invitation', () => {
    const now = new Date('2026-07-24T02:00:00.000Z');
    expect(
      getEffectiveInvitationStatus(
        { expiresAt: '2026-07-24T01:00:00.000Z', status: 'sent' },
        now,
      ),
    ).toBe('expired');
    expect(
      getEffectiveInvitationStatus(
        { expiresAt: '2026-07-24T01:00:00.000Z', status: 'accepted' },
        now,
      ),
    ).toBe('accepted');
  });

  it('allows approved delivery, resend, acceptance and terminal transitions', () => {
    expect(createInvitationTransition('pending', 'sent')).toMatchObject({
      ok: true,
    });
    expect(createInvitationTransition('sent', 'sent')).toMatchObject({
      ok: true,
    });
    expect(createInvitationTransition('sent', 'accepted')).toMatchObject({
      ok: true,
    });
    expect(createInvitationTransition('delivery_failed', 'sent')).toMatchObject(
      { ok: true },
    );
    expect(createInvitationTransition('revoked', 'sent')).toMatchObject({
      error: { code: 'conflict' },
      ok: false,
    });
  });

  it.each([
    ['expired', 'invitation-expired'],
    ['revoked', 'invitation-revoked'],
    ['superseded', 'invitation-superseded'],
    ['accepted', 'invitation-used'],
  ] as const)('maps %s to a typed acceptance error', (status, code) => {
    expect(getInvitationAcceptanceError(status)).toMatchObject({
      error: { code },
      ok: false,
    });
  });
});
