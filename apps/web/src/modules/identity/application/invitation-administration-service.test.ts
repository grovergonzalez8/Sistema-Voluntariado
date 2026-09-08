import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { InvitationAdministrationGateway } from './invitation-administration-gateway';
import { InvitationAdministrationService } from './invitation-administration-service';

const operationResult = {
  accountId: '00000000-0000-4000-8000-000000000101',
  invitationId: '00000000-0000-4000-8000-000000000102',
  outcome: 'completed' as const,
  status: 'pending' as const,
};

const invitation = {
  accountId: operationResult.accountId,
  createdAt: '2026-07-24T00:00:00.000Z',
  createdBy: 'actor-id',
  displayName: null,
  expiresAt: '2026-07-24T01:00:00.000Z',
  id: operationResult.invitationId,
  normalizedEmail: 'invited@example.invalid',
  preferredLocale: 'es' as const,
  requestedInitialRoleCode: 'volunteer',
  sentAt: null,
  status: 'pending' as const,
  supersededBy: null,
};

const createGateway = () => ({
  createInvitation: vi.fn<InvitationAdministrationGateway['createInvitation']>(
    () => Promise.resolve(success(operationResult)),
  ),
  getInvitationDetail: vi.fn<
    InvitationAdministrationGateway['getInvitationDetail']
  >(() => Promise.resolve(success(invitation))),
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
  recoverAccountInvitation: vi.fn<
    InvitationAdministrationGateway['recoverAccountInvitation']
  >(() => Promise.resolve(success(operationResult))),
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
        idempotencyKey: 'invalid',
        invitationId: operationResult.invitationId,
        reason: 'x',
      }),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(gateway.resendInvitation).not.toHaveBeenCalled();
    expect(gateway.revokeInvitation).not.toHaveBeenCalled();
  });

  it('dispatches list, resend, replace, and revoke through their ports', async () => {
    const gateway = createGateway();
    const service = new InvitationAdministrationService(gateway);
    const command = {
      idempotencyKey: '00000000-0000-4000-8000-000000000104',
      invitationId: operationResult.invitationId,
    };

    expect(await service.listInvitations()).toMatchObject({ ok: true });
    expect(
      await service.getInvitationDetail(operationResult.invitationId),
    ).toMatchObject({ ok: true });
    expect(await service.resendInvitation(command)).toMatchObject({ ok: true });
    expect(await service.replaceInvitation(command)).toMatchObject({
      ok: true,
    });
    expect(
      await service.revokeInvitation({
        idempotencyKey: command.idempotencyKey,
        invitationId: operationResult.invitationId,
        reason: '  Revocación autorizada  ',
      }),
    ).toMatchObject({ ok: true });

    expect(gateway.listInvitations).toHaveBeenCalledOnce();
    expect(gateway.getInvitationDetail).toHaveBeenCalledWith(
      operationResult.invitationId,
    );
    expect(gateway.resendInvitation).toHaveBeenCalledWith(command);
    expect(gateway.replaceInvitation).toHaveBeenCalledWith(command);
    expect(gateway.revokeInvitation).toHaveBeenCalledWith({
      idempotencyKey: command.idempotencyKey,
      invitationId: operationResult.invitationId,
      reason: 'Revocación autorizada',
    });
  });

  it('validates and dispatches a recovery with a fresh idempotency key', async () => {
    const gateway = createGateway();
    const service = new InvitationAdministrationService(gateway);

    await expect(
      service.recoverAccountInvitation({
        accountId: operationResult.accountId,
        idempotencyKey: '00000000-0000-4000-8000-000000000105',
        reason: '  Auth ownership comprobado  ',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(gateway.recoverAccountInvitation).toHaveBeenCalledWith({
      accountId: operationResult.accountId,
      idempotencyKey: '00000000-0000-4000-8000-000000000105',
      reason: 'Auth ownership comprobado',
    });
  });
});
