import { describe, expect, it } from 'vitest';

import { authorizeRoleMutation } from './role-grant-policy';

const allowedDecision = {
  actorHasPermission: true,
  actorId: 'actor-id',
  actorIsActive: true,
  operation: 'grant' as const,
  policyAllowsOperation: true,
  roleIsActive: true,
  targetAccountIsActive: true,
  targetUserId: 'target-id',
};

describe('authorizeRoleMutation', () => {
  it('requires active actor, concrete permission and policy', () => {
    expect(authorizeRoleMutation(allowedDecision)).toEqual({
      ok: true,
      value: undefined,
    });

    expect(
      authorizeRoleMutation({ ...allowedDecision, actorHasPermission: false }),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
    expect(
      authorizeRoleMutation({
        ...allowedDecision,
        policyAllowsOperation: false,
      }),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
  });

  it('rejects self assignment and self removal', () => {
    expect(
      authorizeRoleMutation({
        ...allowedDecision,
        targetUserId: allowedDecision.actorId,
      }),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
  });

  it('freezes roles for blocked targets', () => {
    expect(
      authorizeRoleMutation({
        ...allowedDecision,
        targetAccountIsActive: false,
      }),
    ).toMatchObject({ error: { code: 'forbidden' }, ok: false });
  });
});
