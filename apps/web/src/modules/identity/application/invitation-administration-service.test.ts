import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { InvitationAdministrationGateway } from './invitation-administration-gateway';
import { InvitationAdministrationService } from './invitation-administration-service';

const operationResult = {
  accountId: '00000000-0000-4000-8000-000000000101',
  invitationId: '00000000-0000-4000-8000-000000000102',
  status: 'pending' as const,
};

const createGateway = () => ({
  createInvitation: vi.fn<InvitationAdministrationGateway['createInvitation']>(
    () => Promise.resolve(success(operationResult)),
  ),
  listInvitations: vi.fn<InvitationAdministrationGateway['listInvitations']>(
    () => Promise.resolve(success([])),
  ),
  replaceInvitation: vi.fn<
    InvitationAdministrationGateway['replaceInvitation']
  >(() => Promise.resolve(success(operationResult))),
  resendInvitation: vi.fn<InvitationAdministrationGateway['resendInvitation']>(
    () => Promise.resolve(success(operationResult)),
  ),
  revokeInvitation: vi.fn<InvitationAdministrationGateway['revokeInvitation']>(
    () => Promise.resolve(success(operationResult)),
  ),
});

describe('InvitationAdministrationService', () => {
  it('normalizes a create command before calling the gateway', async () => {
    const gateway = createGateway();
    const service = new InvitationAdministrationService(gateway);

    const result = await service.createInvitation({
      displayName: '  Invitada   local ',
      email: 'INVITED@EXAMPLE.invalid',
      idempotencyKey: '00000000-0000-4000-8000-000000000103',
      preferredLocale: 'es',
      requestedInitialRoleCode: 'volunteer',
    });

    expect(result).toMatchObject({ ok: true });
    expect(gateway.createInvitation).toHaveBeenCalledWith({
      displayName: 'Invitada local',
      idempotencyKey: '00000000-0000-4000-8000-000000000103',
      normalizedEmail: 'invited@example.invalid',
      preferredLocale: 'es',
      requestedInitialRoleCode: 'volunteer',
    });
  });

  it('rejects invalid identifiers and reasons before infrastructure', async () => {
    const gateway = createGateway();
    const service = new InvitationAdministrationService(gateway);

    expect(
      await service.resendInvitation({
        idempotencyKey: 'invalid',
        invitationId: operationResult.invitationId,
      }),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(
      await service.revokeInvitation({
        invitationId: operationResult.invitationId,
        reason: 'x',
      }),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(gateway.resendInvitation).not.toHaveBeenCalled();
    expect(gateway.revokeInvitation).not.toHaveBeenCalled();
  });
});
