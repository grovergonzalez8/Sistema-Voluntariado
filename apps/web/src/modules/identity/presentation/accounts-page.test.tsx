import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { AccountAdministrationGateway } from '../application/account-administration-gateway';
import { AccountAdministrationService } from '../application/account-administration-service';
import { AccountsPage } from './accounts-page';

const account = {
  accountId: '00000000-0000-4000-8000-000000000070',
  displayName: 'Cuenta buscada',
  email: 'searched@example.invalid',
  roles: ['volunteer'],
  status: 'active' as const,
  updatedAt: '2026-07-24T00:00:00.000Z',
  userId: '00000000-0000-4000-8000-000000000071',
};

const createGateway = (
  listAccounts: AccountAdministrationGateway['listAccounts'],
): AccountAdministrationGateway => ({
  changeAccountStatus: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denegado.' })),
  getAccountDetail: () =>
    Promise.resolve(failure({ code: 'not-found', message: 'No encontrada.' })),
  listAccounts,
  manageAccountRole: () =>
    Promise.resolve(failure({ code: 'forbidden', message: 'Denegado.' })),
});

async function renderPage(
  listAccounts: AccountAdministrationGateway['listAccounts'],
) {
  const i18n = await createI18n();
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <AccountsPage
          service={
            new AccountAdministrationService(createGateway(listAccounts))
          }
        />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

describe('AccountsPage', () => {
  it('shows loading and then the authorized empty state', async () => {
    let resolveList: (
      value: Awaited<ReturnType<AccountAdministrationGateway['listAccounts']>>,
    ) => void = () => undefined;
    const pending = new Promise<
      Awaited<ReturnType<AccountAdministrationGateway['listAccounts']>>
    >((resolve) => {
      resolveList = resolve;
    });
    await renderPage(() => pending);

    expect(screen.getByRole('status')).not.toBeNull();
    resolveList(success([]));
    expect(
      await screen.findByText('No hay cuentas autorizadas en esta vista.'),
    ).not.toBeNull();
  });

  it('renders a safe list error', async () => {
    await renderPage(() =>
      Promise.resolve(
        failure({ code: 'forbidden', message: 'Acceso denegado.' }),
      ),
    );

    expect(await screen.findByText('Acceso denegado.')).not.toBeNull();
  });

  it('searches through the service and renders the result', async () => {
    const user = userEvent.setup();
    const listAccounts = vi
      .fn<AccountAdministrationGateway['listAccounts']>()
      .mockResolvedValueOnce(success([]))
      .mockResolvedValueOnce(success([account]));
    await renderPage(listAccounts);
    await screen.findByText('No hay cuentas autorizadas en esta vista.');

    await user.type(
      screen.getByLabelText('Buscar por nombre o correo autorizado'),
      'searched',
    );
    await user.click(screen.getByRole('button', { name: 'Buscar' }));

    expect(await screen.findByText('searched@example.invalid')).not.toBeNull();
    expect(listAccounts).toHaveBeenLastCalledWith({
      limit: 25,
      offset: 0,
      search: 'searched',
    });
  });
});
