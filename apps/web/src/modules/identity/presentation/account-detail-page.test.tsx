import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { AccountAdministrationGateway } from '../application/account-administration-gateway';
import { AccountAdministrationService } from '../application/account-administration-service';
import type { AccountDetail } from '../domain/account-administration';
import { AccountDetailPage } from './account-detail-page';
import { IdentityContext, type IdentityContextValue } from './identity-context';

const accountId = '00000000-0000-4000-8000-000000000030';
const detail: AccountDetail = {
  accountId,
  audit: [
    {
      action: 'account.activated',
      entityId: accountId,
      entityType: 'account',
      occurredAt: '2026-07-24T00:00:00.000Z',
    },
  ],
  displayName: 'Cuenta E2E',
  email: 'account-ui@example.invalid',
  grantableRoles: [{ code: 'administrator', description: 'Administración' }],
  history: [
    {
      changedAt: '2026-07-24T00:00:00.000Z',
      changedBy: null,
      fromStatus: 'pending_profile',
      reason: 'Perfil completado',
      toStatus: 'active',
    },
  ],
  roles: ['volunteer'],
  status: 'active',
  updatedAt: '2026-07-24T00:00:00.000Z',
  userId: '00000000-0000-4000-8000-000000000031',
};

const createGateway = () => {
  const changeAccountStatus = vi.fn<
    AccountAdministrationGateway['changeAccountStatus']
  >((command) =>
    Promise.resolve(success({ ...detail, status: command.status })),
  );
  const manageAccountRole = vi.fn<
    AccountAdministrationGateway['manageAccountRole']
  >(() =>
    Promise.resolve(
      success({ ...detail, roles: ['volunteer', 'administrator'] }),
    ),
  );
  const gateway: AccountAdministrationGateway = {
    changeAccountStatus,
    getAccountDetail: () => Promise.resolve(success(detail)),
    listAccounts: () => Promise.resolve(success([])),
    manageAccountRole,
  };
  return { changeAccountStatus, gateway, manageAccountRole };
};

const renderPage = async (
  gateway: AccountAdministrationGateway,
  permissions: readonly string[] = [
    'account.activate',
    'account.archive',
    'account.reactivate',
    'account.suspend',
    'role_assignment.manage',
  ],
  userId = 'actor-id',
  refreshAccountContext: IdentityContextValue['refreshAccountContext'] = () =>
    Promise.resolve(success(null)),
) => {
  const i18n = await createI18n();
  const identity: IdentityContextValue = {
    account: {
      accountId: 'actor-account-id',
      authorityVersion: '1',
      permissions,
      status: 'active',
    },
    error: null,
    refreshAccountContext,
    signIn: () =>
      Promise.resolve(
        success({ email: 'actor@example.invalid', id: 'actor-id' }),
      ),
    signOut: () => Promise.resolve(success(undefined)),
    status: 'ready',
    user: { email: 'actor@example.invalid', id: userId },
  };
  return render(
    <I18nextProvider i18n={i18n}>
      <IdentityContext.Provider value={identity}>
        <MemoryRouter initialEntries={[`/app/admin/accounts/${accountId}`]}>
          <Routes>
            <Route
              element={
                <AccountDetailPage
                  service={new AccountAdministrationService(gateway)}
                />
              }
              path="/app/admin/accounts/:id"
            />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>
    </I18nextProvider>,
  );
};

describe('AccountDetailPage', () => {
  it('renders authorized history and confirms role assignment', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway, manageAccountRole } = createGateway();
    await renderPage(gateway);

    expect(await screen.findByText('account.activated')).not.toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Agregar Administración' }),
    );

    expect(confirm).toHaveBeenCalledOnce();
    expect(manageAccountRole).toHaveBeenCalledWith({
      accountId,
      operation: 'grant',
      roleCode: 'administrator',
    });
    expect(await screen.findByText('Cuenta actualizada.')).not.toBeNull();
  });

  it('confirms suspension and passes the normalized administrative reason', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { changeAccountStatus, gateway } = createGateway();
    await renderPage(gateway);

    await user.clear(await screen.findByLabelText('Motivo administrativo'));
    await user.type(
      screen.getByLabelText('Motivo administrativo'),
      '  Riesgo temporal  ',
    );
    await user.click(screen.getByRole('button', { name: 'Suspender' }));

    expect(changeAccountStatus).toHaveBeenCalledWith({
      accountId,
      reason: 'Riesgo temporal',
      status: 'suspended',
    });
    expect(await screen.findByText('Suspendida')).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Reactivar' })).not.toBeNull();
  });

  it('does not render mutations for a read-only coordinator', async () => {
    const { gateway } = createGateway();
    await renderPage(gateway, ['account.read', 'role_assignment.read']);

    await screen.findByText('account.activated');
    expect(screen.queryByRole('button', { name: 'Suspender' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archivar' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Retirar' })).toBeNull();
    expect(
      screen.queryByRole('button', { name: 'Agregar Administración' }),
    ).toBeNull();
  });

  it('refreshes authority immediately after self-suspension', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const refreshAccountContext = vi.fn(() => Promise.resolve(success(null)));
    const { gateway } = createGateway();
    await renderPage(
      gateway,
      ['account.suspend'],
      detail.userId ?? undefined,
      refreshAccountContext,
    );

    await user.click(await screen.findByRole('button', { name: 'Suspender' }));
    expect(refreshAccountContext).toHaveBeenCalledOnce();
  });
});
