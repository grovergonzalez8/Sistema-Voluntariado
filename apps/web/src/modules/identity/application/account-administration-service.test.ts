import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { AccountAdministrationGateway } from './account-administration-gateway';
import { AccountAdministrationService } from './account-administration-service';

const accountId = '00000000-0000-4000-8000-000000000201';
const accountDetail = {
  accountId,
  audit: [],
  displayName: 'Cuenta local',
  email: 'account@example.invalid',
  grantableRoles: [],
  history: [],
  roles: ['volunteer'],
  status: 'active' as const,
  updatedAt: '2026-07-24T00:00:00.000Z',
  userId: '00000000-0000-4000-8000-000000000202',
};

const createGateway = () => ({
  changeAccountStatus: vi.fn<
    AccountAdministrationGateway['changeAccountStatus']
  >(() => Promise.resolve(success(accountDetail))),
  getAccountDetail: vi.fn<AccountAdministrationGateway['getAccountDetail']>(
    () => Promise.resolve(success(accountDetail)),
  ),
  listAccounts: vi.fn<AccountAdministrationGateway['listAccounts']>(() =>
    Promise.resolve(success([accountDetail])),
  ),
  manageAccountRole: vi.fn<AccountAdministrationGateway['manageAccountRole']>(
    () => Promise.resolve(success(accountDetail)),
  ),
});

describe('AccountAdministrationService', () => {
  it('normalizes pagination/search and administrative reason', async () => {
    const gateway = createGateway();
    const service = new AccountAdministrationService(gateway);

    await service.listAccounts({ search: '  local  ' });
    await service.changeAccountStatus({
      accountId,
      reason: '  Motivo   válido ',
      status: 'suspended',
    });

    expect(gateway.listAccounts).toHaveBeenCalledWith({
      limit: 25,
      offset: 0,
      search: 'local',
    });
    expect(gateway.changeAccountStatus).toHaveBeenCalledWith({
      accountId,
      reason: 'Motivo válido',
      status: 'suspended',
    });
  });

  it('rejects invalid account, pagination and role input', async () => {
    const gateway = createGateway();
    const service = new AccountAdministrationService(gateway);

    expect(await service.getAccountDetail('invalid')).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
    expect(await service.listAccounts({ limit: 101 })).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
    expect(
      await service.manageAccountRole({
        accountId,
        operation: 'grant',
        roleCode: 'Administrator!',
      }),
    ).toMatchObject({ error: { code: 'validation' }, ok: false });
    expect(gateway.getAccountDetail).not.toHaveBeenCalled();
    expect(gateway.manageAccountRole).not.toHaveBeenCalled();
  });

  it('dispatches detail, lifecycle, and role commands through the gateway', async () => {
    const gateway = createGateway();
    const service = new AccountAdministrationService(gateway);

    expect(await service.getAccountDetail(accountId)).toMatchObject({
      ok: true,
    });
    for (const status of ['suspended', 'archived', 'active'] as const) {
      expect(
        await service.changeAccountStatus({
          accountId,
          reason: 'Cambio administrativo',
          status,
        }),
      ).toMatchObject({ ok: true });
    }
    for (const operation of ['grant', 'revoke'] as const) {
      expect(
        await service.manageAccountRole({
          accountId,
          operation,
          roleCode: 'coordinator',
        }),
      ).toMatchObject({ ok: true });
    }

    expect(gateway.getAccountDetail).toHaveBeenCalledWith(accountId);
    expect(gateway.changeAccountStatus).toHaveBeenCalledTimes(3);
    expect(gateway.manageAccountRole).toHaveBeenCalledTimes(2);
  });
});
