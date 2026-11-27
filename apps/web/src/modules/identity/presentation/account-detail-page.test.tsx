import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { StrictMode } from 'react';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { AccountAdministrationGateway } from '../application/account-administration-gateway';
import { AccountAdministrationService } from '../application/account-administration-service';
import type { InvitationAdministrationGateway } from '../application/invitation-administration-gateway';
import { InvitationAdministrationService } from '../application/invitation-administration-service';
import type {
  AccountDetail,
  InvitationCommandResult,
} from '../domain/account-administration';
import { AccountDetailPage } from './account-detail-page';
import { IdentityContext, type IdentityContextValue } from './identity-context';

const accountId = '00000000-0000-4000-8000-000000000030';
const otherAccountId = '00000000-0000-4000-8000-000000000040';

function AccountNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <nav aria-label="Navegación de prueba">
      <Link to={`/app/admin/accounts/${accountId}`}>Recurso A</Link>
      <Link to={`/app/admin/accounts/${otherAccountId}`}>Recurso B</Link>
      <button
        onClick={() => {
          void navigate(-1);
        }}
      >
        Atrás de prueba
      </button>
      <button
        onClick={() => {
          void navigate(1);
        }}
      >
        Adelante de prueba
      </button>
      <output aria-label="Ruta actual">{location.pathname}</output>
    </nav>
  );
}

function pendingAccount<T>() {
  let resolveResult: ((value: Result<T>) => void) | undefined;
  let rejectResult: ((error: Error) => void) | undefined;
  const promise = new Promise<Result<T>>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  return {
    promise,
    resolve(value: Result<T>) {
      if (!resolveResult) throw new Error('Missing resolver');
      resolveResult(value);
    },
    reject(error: Error) {
      if (!rejectResult) throw new Error('Missing rejecter');
      rejectResult(error);
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});
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
  invitationGateway?: InvitationAdministrationGateway,
  strictMode = false,
) => {
  const i18n = await createI18n();
  const identity: IdentityContextValue = {
    account: {
      accountId: 'actor-account-id',
      authorityVersion: '1',
      permissions,
      status: 'active',
    },
    access: {
      account: {
        accountId: 'actor-account-id',
        authorityVersion: '1',
        permissions,
        status: 'active',
      },
      kind: 'active',
    },
    refreshAccountContext,
    signIn: () =>
      Promise.resolve(
        success({ email: 'actor@example.invalid', id: 'actor-id' }),
      ),
    signOut: () => Promise.resolve(success(undefined)),
    user: { email: 'actor@example.invalid', id: userId },
  };
  const service = new AccountAdministrationService(gateway);
  const invitationService = invitationGateway
    ? new InvitationAdministrationService(invitationGateway)
    : undefined;
  const page = (value: IdentityContextValue) => (
    <I18nextProvider i18n={i18n}>
      <IdentityContext.Provider value={value}>
        <MemoryRouter initialEntries={[`/app/admin/accounts/${accountId}`]}>
          <AccountNavigation />
          <Routes>
            <Route
              element={
                <AccountDetailPage
                  service={service}
                  {...(invitationService
                    ? {
                        invitationService,
                      }
                    : {})}
                />
              }
              path="/app/admin/accounts/:id"
            />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>
    </I18nextProvider>
  );
  const content = (value: IdentityContextValue) =>
    strictMode ? <StrictMode>{page(value)}</StrictMode> : page(value);
  const view = render(content(identity));
  return {
    ...view,
    changeActor: (actorId: string) => {
      view.rerender(
        content({
          ...identity,
          user: { email: 'actor@example.invalid', id: actorId },
        }),
      );
    },
  };
};

const otherDetail: AccountDetail = {
  ...detail,
  accountId: otherAccountId,
  displayName: 'Cuenta B',
  email: 'b@example.invalid',
  userId: '00000000-0000-4000-8000-000000000041',
  audit: [],
  history: [],
  roles: ['coordinator'],
};
const navigationPermissions = [
  'account.read',
  'account.suspend',
  'account.archive',
  'role_assignment.manage',
  'invitation.recover',
];

describe('account resource navigation', () => {
  it('allows correction of an invalid recovery reason before reserving an intent', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway } = createGateway();
    const recoverAccountInvitation = vi
      .fn<InvitationAdministrationGateway['recoverAccountInvitation']>()
      .mockResolvedValue(
        success({
          accountId,
          invitationId: accountId,
          status: 'pending',
          outcome: 'in_progress',
        }),
      );
    await renderPage(
      {
        ...gateway,
        getAccountDetail: () =>
          Promise.resolve(success({ ...detail, status: 'invited' })),
      },
      ['invitation.recover'],
      undefined,
      undefined,
      {
        createInvitation: vi.fn(),
        getInvitationDetail: vi.fn(),
        listInvitations: vi.fn(),
        recoverAccountInvitation,
        replaceInvitation: vi.fn(),
        resendInvitation: vi.fn(),
        revokeInvitation: vi.fn(),
      },
    );
    const field = await screen.findByLabelText<HTMLInputElement>(
      'Motivo administrativo',
    );
    fireEvent.change(field, { target: { value: '' } });
    await user.click(
      screen.getByRole('button', { name: 'Recuperar invitación' }),
    );
    await screen.findByRole('alert');
    expect(field.disabled).toBe(false);
    expect(recoverAccountInvitation).not.toHaveBeenCalled();
    fireEvent.change(field, { target: { value: ' Motivo correcto ' } });
    await user.click(
      screen.getByRole('button', { name: 'Recuperar invitación' }),
    );
    await screen.findByText('La operación de invitación sigue en curso.');
    expect(recoverAccountInvitation).toHaveBeenCalledOnce();
    expect(recoverAccountInvitation.mock.calls[0]?.[0].reason).toBe(
      'Motivo correcto',
    );
  });

  it.each(['success', 'rejection'] as const)(
    'keeps A2 busy and unchanged after an A1 %s across A-B-A',
    async (outcome) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const previous = pendingAccount<AccountDetail>();
      const current = pendingAccount<AccountDetail>();
      const { gateway } = createGateway();
      const changeAccountStatus = vi
        .fn<AccountAdministrationGateway['changeAccountStatus']>()
        .mockReturnValueOnce(previous.promise)
        .mockReturnValueOnce(current.promise);
      await renderPage({
        ...gateway,
        changeAccountStatus,
        getAccountDetail: (id) =>
          Promise.resolve(success(id === accountId ? detail : otherDetail)),
      });
      await user.click(
        await screen.findByRole('button', { name: 'Suspender' }),
      );
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      fireEvent.change(await screen.findByLabelText('Motivo administrativo'), {
        target: { value: 'Edición A2' },
      });
      await user.click(screen.getByRole('button', { name: 'Suspender' }));
      await waitFor(() => {
        expect(changeAccountStatus).toHaveBeenCalledTimes(2);
      });
      await act(async () => {
        if (outcome === 'rejection') {
          previous.reject(new Error('Error A1'));
          await previous.promise.catch(() => undefined);
        } else {
          previous.resolve(success({ ...detail, status: 'suspended' }));
          await previous.promise;
        }
      });
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Suspender' })
          .disabled,
      ).toBe(true);
      expect(
        screen.getByLabelText<HTMLInputElement>('Motivo administrativo').value,
      ).toBe('Edición A2');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cuenta actualizada.')).toBeNull();
      expect(changeAccountStatus.mock.calls[1]?.[0]).toEqual({
        accountId,
        status: 'suspended',
        reason: 'Edición A2',
      });
      await act(async () => {
        current.resolve(success({ ...detail, status: 'suspended' }));
        await current.promise;
      });
      await screen.findByText('Suspendida');
    },
  );

  it('ends a current rejected mutation and retries without retaining submitting', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway } = createGateway();
    const changeAccountStatus = vi
      .fn<AccountAdministrationGateway['changeAccountStatus']>()
      .mockRejectedValueOnce(new Error('Detalle privado'))
      .mockResolvedValue(success({ ...detail, status: 'suspended' }));
    await renderPage({ ...gateway, changeAccountStatus });
    await user.click(await screen.findByRole('button', { name: 'Suspender' }));
    await screen.findByRole('alert');
    expect(screen.queryByText('Detalle privado')).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Suspender' })
        .disabled,
    ).toBe(false);
    await user.click(screen.getByRole('button', { name: 'Suspender' }));
    await screen.findByText('Suspendida');
    expect(changeAccountStatus).toHaveBeenCalledTimes(2);
  });

  it('removes account actions after a current recovery reload rejects and permits retry', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway } = createGateway();
    const invited = { ...detail, status: 'invited' as const };
    const read = vi
      .fn<AccountAdministrationGateway['getAccountDetail']>()
      .mockResolvedValueOnce(success(invited))
      .mockRejectedValueOnce(new Error('Reload privado'))
      .mockResolvedValue(success(invited));
    await renderPage(
      { ...gateway, getAccountDetail: read },
      ['invitation.recover'],
      undefined,
      undefined,
      {
        createInvitation: vi.fn(),
        getInvitationDetail: vi.fn(),
        listInvitations: vi.fn(),
        recoverAccountInvitation: () =>
          Promise.resolve(
            success({
              accountId,
              invitationId: accountId,
              status: 'sent',
              outcome: 'completed',
            }),
          ),
        replaceInvitation: vi.fn(),
        resendInvitation: vi.fn(),
        revokeInvitation: vi.fn(),
      },
    );
    await user.click(
      await screen.findByRole('button', { name: 'Recuperar invitación' }),
    );
    await screen.findByRole('alert');
    expect(
      screen.queryByRole('button', { name: 'Recuperar invitación' }),
    ).toBeNull();
    expect(screen.queryByText('Cuenta E2E')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reintentar' }));
    await screen.findByRole('button', { name: 'Recuperar invitación' });
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('supports A-B-A and back/forward in StrictMode without carrying the reason', async () => {
    const user = userEvent.setup();
    const { gateway } = createGateway();
    await renderPage(
      {
        ...gateway,
        getAccountDetail: (id) =>
          Promise.resolve(success(id === accountId ? detail : otherDetail)),
      },
      undefined,
      undefined,
      undefined,
      undefined,
      true,
    );
    await screen.findByText('Cuenta E2E');
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), {
      target: { value: 'Motivo A' },
    });
    await user.click(screen.getByRole('link', { name: 'Recurso B' }));
    await screen.findByText('Cuenta B');
    expect(screen.queryByDisplayValue('Motivo A')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
    await screen.findByText('Cuenta E2E');
    expect(screen.queryByDisplayValue('Motivo A')).toBeNull();
    await user.click(
      screen.getByRole('button', { name: 'Adelante de prueba' }),
    );
    await screen.findByText('Cuenta B');
  });

  it.each(['failure', 'rejection', 'mismatch'] as const)(
    'fails closed on B load %s and supports recovery',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingAccount<AccountDetail>();
      let failed = false;
      const { gateway } = createGateway();
      await renderPage({
        ...gateway,
        getAccountDetail: (id) => {
          if (id === otherAccountId && !failed) {
            failed = true;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === accountId ? detail : otherDetail),
          );
        },
      });
      await screen.findByText('Cuenta E2E');
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Detalle interno de carga'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            outcome === 'mismatch'
              ? success(detail)
              : failure({ code: 'forbidden', message: 'No autorizado' }),
          );
          await pending.promise;
        }
      });
      await screen.findByRole('alert');
      expect(screen.queryByText('Cuenta E2E')).toBeNull();
      expect(screen.queryByRole('button', { name: 'Suspender' })).toBeNull();
      expect(screen.queryByText('Detalle interno de carga')).toBeNull();
      expect(screen.queryByText('Cargando…')).toBeNull();
      await user.click(screen.getByRole('button', { name: 'Reintentar' }));
      await screen.findByText('Cuenta B');
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each(['success', 'failure', 'rejection'] as const)(
    'ignores a late A read %s after B and a new A',
    async (outcome) => {
      const user = userEvent.setup();
      const pending = pendingAccount<AccountDetail>();
      let first = true;
      const { gateway } = createGateway();
      const read = vi
        .fn<AccountAdministrationGateway['getAccountDetail']>()
        .mockImplementation((id) => {
          if (id === accountId && first) {
            first = false;
            return pending.promise;
          }
          return Promise.resolve(
            success(id === accountId ? detail : otherDetail),
          );
        });
      await renderPage({ ...gateway, getAccountDetail: read });
      await waitFor(() => {
        expect(read).toHaveBeenCalledOnce();
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      await screen.findByText('Cuenta E2E');
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Rechazo viejo'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            outcome === 'success'
              ? success({ ...detail, displayName: 'Cuenta antigua' })
              : failure({ code: 'network', message: 'Error viejo' }),
          );
          await pending.promise;
        }
      });
      expect(screen.getByText('Cuenta E2E')).not.toBeNull();
      expect(screen.queryByText('Cuenta antigua')).toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
    },
  );

  it.each([
    ['status', 'success'],
    ['status', 'failure'],
    ['status', 'rejection'],
    ['role', 'success'],
    ['role', 'failure'],
    ['role', 'rejection'],
    ['recover', 'success'],
    ['recover', 'failure'],
    ['recover', 'rejection'],
  ] as const)(
    'isolates old %s %s and writes only the current account payload',
    async (operation, outcome) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pending = pendingAccount<AccountDetail>();
      const recovery = pendingAccount<InvitationCommandResult>();
      const { gateway } = createGateway();
      const read = vi
        .fn<AccountAdministrationGateway['getAccountDetail']>()
        .mockImplementation((id) =>
          Promise.resolve(
            success(
              id === accountId
                ? {
                    ...detail,
                    status: operation === 'recover' ? 'invited' : 'active',
                  }
                : otherDetail,
            ),
          ),
        );
      const changeAccountStatus = vi
        .fn<AccountAdministrationGateway['changeAccountStatus']>()
        .mockImplementation((command) =>
          command.accountId === accountId && operation === 'status'
            ? pending.promise
            : Promise.resolve(
                success({ ...otherDetail, status: command.status }),
              ),
        );
      const manageAccountRole = vi
        .fn<AccountAdministrationGateway['manageAccountRole']>()
        .mockReturnValue(pending.promise);
      const recoverAccountInvitation = vi
        .fn<InvitationAdministrationGateway['recoverAccountInvitation']>()
        .mockReturnValue(recovery.promise);
      await renderPage(
        {
          ...gateway,
          getAccountDetail: read,
          changeAccountStatus,
          manageAccountRole,
        },
        navigationPermissions,
        undefined,
        undefined,
        {
          createInvitation: vi.fn(),
          getInvitationDetail: vi.fn(),
          listInvitations: vi.fn(),
          recoverAccountInvitation,
          replaceInvitation: vi.fn(),
          resendInvitation: vi.fn(),
          revokeInvitation: vi.fn(),
        },
      );
      await screen.findByText('Cuenta E2E');
      fireEvent.change(screen.getByLabelText('Motivo administrativo'), {
        target: { value: ' Motivo original A ' },
      });
      const label =
        operation === 'status'
          ? 'Suspender'
          : operation === 'role'
            ? 'Agregar Administración'
            : 'Recuperar invitación';
      const button = screen.getByRole('button', { name: label });
      act(() => {
        fireEvent.click(button);
        fireEvent.click(button);
      });
      await waitFor(() => {
        if (operation === 'status')
          expect(changeAccountStatus).toHaveBeenCalledOnce();
        else if (operation === 'role')
          expect(manageAccountRole).toHaveBeenCalledOnce();
        else expect(recoverAccountInvitation).toHaveBeenCalledOnce();
      });
      if (operation === 'status')
        expect(changeAccountStatus).toHaveBeenCalledWith({
          accountId,
          reason: 'Motivo original A',
          status: 'suspended',
        });
      else if (operation === 'role')
        expect(manageAccountRole).toHaveBeenCalledWith({
          accountId,
          operation: 'grant',
          roleCode: 'administrator',
        });
      else
        expect(recoverAccountInvitation).toHaveBeenCalledWith(
          expect.objectContaining({ accountId, reason: 'Motivo original A' }),
        );
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      fireEvent.change(screen.getByLabelText('Motivo administrativo'), {
        target: { value: ' Motivo vigente B ' },
      });
      const readsBefore = read.mock.calls.length;
      await act(async () => {
        if (operation === 'recover') {
          if (outcome === 'rejection') {
            recovery.reject(new Error('Rechazo antiguo'));
            await recovery.promise.catch(() => undefined);
          } else {
            recovery.resolve(
              outcome === 'success'
                ? success({
                    accountId,
                    invitationId: accountId,
                    outcome: 'completed',
                    status: 'sent',
                  })
                : failure({ code: 'network', message: 'Error antiguo' }),
            );
            await recovery.promise;
          }
        } else if (outcome === 'rejection') {
          pending.reject(new Error('Rechazo antiguo'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            outcome === 'success'
              ? success({ ...detail, status: 'suspended' })
              : failure({ code: 'network', message: 'Error antiguo' }),
          );
          await pending.promise;
        }
      });
      expect(screen.getByText('Cuenta B')).not.toBeNull();
      expect(
        screen.getByLabelText<HTMLInputElement>('Motivo administrativo').value,
      ).toBe(' Motivo vigente B ');
      expect(screen.queryByRole('alert')).toBeNull();
      expect(screen.queryByText('Cuenta actualizada.')).toBeNull();
      expect(read).toHaveBeenCalledTimes(readsBefore);
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Suspender' })
          .disabled,
      ).toBe(false);
      await user.click(screen.getByRole('button', { name: 'Suspender' }));
      await waitFor(() => {
        expect(changeAccountStatus).toHaveBeenLastCalledWith({
          accountId: otherAccountId,
          reason: 'Motivo vigente B',
          status: 'suspended',
        });
      });
      await screen.findByText('Suspendida');
    },
  );

  it.each(['same-actor', 'different-actor'] as const)(
    'refreshes authority after old self-suspension only for %s',
    async (scenario) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pending = pendingAccount<AccountDetail>();
      const refresh = vi
        .fn<IdentityContextValue['refreshAccountContext']>()
        .mockResolvedValue(success(null));
      const { gateway } = createGateway();
      const view = await renderPage(
        {
          ...gateway,
          getAccountDetail: (id) =>
            Promise.resolve(success(id === accountId ? detail : otherDetail)),
          changeAccountStatus: () => pending.promise,
        },
        ['account.suspend'],
        detail.userId ?? undefined,
        refresh,
      );
      await user.click(
        await screen.findByRole('button', { name: 'Suspender' }),
      );
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      if (scenario === 'different-actor') {
        view.changeActor('new-actor');
        await screen.findByText('Cuenta B');
      }
      await act(async () => {
        pending.resolve(success({ ...detail, status: 'suspended' }));
        await pending.promise;
      });
      expect(refresh).toHaveBeenCalledTimes(scenario === 'same-actor' ? 1 : 0);
      expect(screen.getByText('Cuenta B')).not.toBeNull();
      expect(screen.queryByText('Suspendida')).toBeNull();
    },
  );

  it.each(['success', 'failure', 'rejection'] as const)(
    'ignores a recovery detail reload %s after navigating to B',
    async (outcome) => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pending = pendingAccount<AccountDetail>();
      let aReads = 0;
      const { gateway } = createGateway();
      const read = vi
        .fn<AccountAdministrationGateway['getAccountDetail']>()
        .mockImplementation((id) => {
          if (id === otherAccountId)
            return Promise.resolve(success(otherDetail));
          aReads += 1;
          return aReads === 1
            ? Promise.resolve(success({ ...detail, status: 'invited' }))
            : pending.promise;
        });
      await renderPage(
        { ...gateway, getAccountDetail: read },
        navigationPermissions,
        undefined,
        undefined,
        {
          createInvitation: vi.fn(),
          getInvitationDetail: vi.fn(),
          listInvitations: vi.fn(),
          recoverAccountInvitation: () =>
            Promise.resolve(
              success({
                accountId,
                invitationId: accountId,
                status: 'sent',
                outcome: 'completed',
              }),
            ),
          replaceInvitation: vi.fn(),
          resendInvitation: vi.fn(),
          revokeInvitation: vi.fn(),
        },
      );
      await user.click(
        await screen.findByRole('button', { name: 'Recuperar invitación' }),
      );
      await waitFor(() => {
        expect(aReads).toBe(2);
      });
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      await act(async () => {
        if (outcome === 'rejection') {
          pending.reject(new Error('Rechazo reload antiguo'));
          await pending.promise.catch(() => undefined);
        } else {
          pending.resolve(
            outcome === 'success'
              ? success(detail)
              : failure({ code: 'network', message: 'Error reload antiguo' }),
          );
          await pending.promise;
        }
      });
      expect(screen.getByText('Cuenta B')).not.toBeNull();
      expect(screen.queryByRole('alert')).toBeNull();
      expect(
        screen.queryByText('Se envió una recuperación verificada.'),
      ).toBeNull();
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Suspender' })
          .disabled,
      ).toBe(false);
    },
  );
});

describe('AccountDetailPage', () => {
  describe('account recovery and authority navigation invariants', () => {
    it('retires a pending recovery reason when A becomes active while viewing B', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { gateway, changeAccountStatus } = createGateway();
      let activated = false;
      await renderPage(
        {
          ...gateway,
          getAccountDetail: (id) =>
            Promise.resolve(
              success(
                id === accountId
                  ? { ...detail, status: activated ? 'active' : 'invited' }
                  : otherDetail,
              ),
            ),
        },
        navigationPermissions,
        undefined,
        undefined,
        {
          createInvitation: vi.fn(),
          getInvitationDetail: vi.fn(),
          listInvitations: vi.fn(),
          recoverAccountInvitation: () =>
            Promise.resolve(
              success({
                accountId,
                invitationId: accountId,
                status: 'pending',
                outcome: 'in_progress',
              }),
            ),
          replaceInvitation: vi.fn(),
          resendInvitation: vi.fn(),
          revokeInvitation: vi.fn(),
        },
      );
      fireEvent.change(await screen.findByLabelText('Motivo administrativo'), {
        target: { value: 'Recuperación anterior' },
      });
      await user.click(
        screen.getByRole('button', { name: 'Recuperar invitación' }),
      );
      await screen.findByText('La operación de invitación sigue en curso.');
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      activated = true;
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      const reason = await screen.findByLabelText<HTMLInputElement>(
        'Motivo administrativo',
      );
      expect(reason.disabled).toBe(false);
      expect(reason.value).toBe('Cambio administrativo autorizado');
      await user.clear(reason);
      await user.type(reason, 'Suspensión posterior');
      await user.click(screen.getByRole('button', { name: 'Suspender' }));
      await waitFor(() => {
        expect(changeAccountStatus).toHaveBeenCalledWith({
          accountId,
          reason: 'Suspensión posterior',
          status: 'suspended',
        });
      });
    });

    it('preserves a pending recovery key and reason across A-B-A without sharing them with another actor', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const { gateway } = createGateway();
      const recoverAccountInvitation = vi
        .fn<InvitationAdministrationGateway['recoverAccountInvitation']>()
        .mockResolvedValue(
          success({
            accountId,
            invitationId: accountId,
            status: 'pending',
            outcome: 'in_progress',
          }),
        );
      const view = await renderPage(
        {
          ...gateway,
          getAccountDetail: (id) =>
            Promise.resolve(
              success(
                id === accountId
                  ? { ...detail, status: 'invited' }
                  : otherDetail,
              ),
            ),
        },
        navigationPermissions,
        undefined,
        undefined,
        {
          createInvitation: vi.fn(),
          getInvitationDetail: vi.fn(),
          listInvitations: vi.fn(),
          recoverAccountInvitation,
          replaceInvitation: vi.fn(),
          resendInvitation: vi.fn(),
          revokeInvitation: vi.fn(),
        },
      );
      fireEvent.change(await screen.findByLabelText('Motivo administrativo'), {
        target: { value: '  Recuperación  original A  ' },
      });
      await user.click(
        await screen.findByRole('button', { name: 'Recuperar invitación' }),
      );
      await screen.findByText('La operación de invitación sigue en curso.');
      await user.click(screen.getByRole('link', { name: 'Recurso B' }));
      await screen.findByText('Cuenta B');
      await user.click(screen.getByRole('button', { name: 'Atrás de prueba' }));
      expect(
        (
          await screen.findByLabelText<HTMLInputElement>(
            'Motivo administrativo',
          )
        ).value,
      ).toBe('Recuperación original A');
      expect(
        screen.getByLabelText<HTMLInputElement>('Motivo administrativo')
          .disabled,
      ).toBe(true);
      await user.click(
        await screen.findByRole('button', { name: 'Recuperar invitación' }),
      );
      await screen.findByText('La operación de invitación sigue en curso.');
      expect(recoverAccountInvitation).toHaveBeenCalledTimes(2);
      expect(recoverAccountInvitation.mock.calls[1]?.[0].idempotencyKey).toBe(
        recoverAccountInvitation.mock.calls[0]?.[0].idempotencyKey,
      );
      expect(recoverAccountInvitation.mock.calls[1]?.[0].reason).toBe(
        'Recuperación original A',
      );
      expect(recoverAccountInvitation.mock.calls[1]?.[0]).toEqual(
        recoverAccountInvitation.mock.calls[0]?.[0],
      );
      view.changeActor('other-actor');
      await user.click(
        await screen.findByRole('button', { name: 'Recuperar invitación' }),
      );
      await screen.findByText('La operación de invitación sigue en curso.');
      expect(
        recoverAccountInvitation.mock.calls[2]?.[0].idempotencyKey,
      ).not.toBe(recoverAccountInvitation.mock.calls[0]?.[0].idempotencyKey);
      expect(recoverAccountInvitation.mock.calls[2]?.[0].reason).toBe(
        'Cambio administrativo autorizado',
      );
    });

    it('keeps self-suspension authority refresh after leaving AccountDetail entirely', async () => {
      const user = userEvent.setup();
      vi.spyOn(window, 'confirm').mockReturnValue(true);
      const pending = pendingAccount<AccountDetail>();
      const refresh = vi
        .fn<IdentityContextValue['refreshAccountContext']>()
        .mockResolvedValue(success(null));
      const { gateway } = createGateway();
      const view = await renderPage(
        { ...gateway, changeAccountStatus: () => pending.promise },
        ['account.suspend'],
        detail.userId ?? undefined,
        refresh,
      );
      await user.click(
        await screen.findByRole('button', { name: 'Suspender' }),
      );
      view.unmount();
      await act(async () => {
        pending.resolve(success({ ...detail, status: 'suspended' }));
        await pending.promise;
      });
      expect(refresh).toHaveBeenCalledOnce();
    });
  });

  it('removes account A and its actions while account B is loading', async () => {
    const user = userEvent.setup();
    const pending = pendingAccount<AccountDetail>();
    const { gateway } = createGateway();
    await renderPage({
      ...gateway,
      getAccountDetail: (id) =>
        id === otherAccountId
          ? pending.promise
          : Promise.resolve(success(detail)),
    });
    await screen.findByText('Cuenta E2E');
    fireEvent.change(screen.getByLabelText('Motivo administrativo'), {
      target: { value: 'Motivo exclusivo A' },
    });
    await user.click(screen.getByRole('link', { name: 'Recurso B' }));
    expect(screen.queryByText('Cuenta E2E')).toBeNull();
    expect(screen.queryByDisplayValue('Motivo exclusivo A')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Suspender' })).toBeNull();
    expect(screen.getByText('Cargando…')).not.toBeNull();
    await act(async () => {
      pending.resolve(
        success({
          ...detail,
          accountId: otherAccountId,
          displayName: 'Cuenta B',
          email: 'b@example.invalid',
        }),
      );
      await pending.promise;
    });
    expect(await screen.findByText('Cuenta B')).not.toBeNull();
  });
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

  it('reuses the recovery idempotency key while delivery is in progress', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway } = createGateway();
    const invitedGateway: AccountAdministrationGateway = {
      ...gateway,
      getAccountDetail: () =>
        Promise.resolve(success({ ...detail, status: 'invited' })),
    };
    const recoverAccountInvitation = vi.fn<
      InvitationAdministrationGateway['recoverAccountInvitation']
    >(() =>
      Promise.resolve(
        success({
          accountId,
          invitationId: '00000000-0000-4000-8000-000000000032',
          outcome: 'in_progress',
          status: 'pending',
        }),
      ),
    );
    const invitationGateway: InvitationAdministrationGateway = {
      createInvitation: vi.fn(),
      getInvitationDetail: vi.fn(),
      listInvitations: vi.fn(),
      recoverAccountInvitation,
      replaceInvitation: vi.fn(),
      resendInvitation: vi.fn(),
      revokeInvitation: vi.fn(),
    };
    await renderPage(
      invitedGateway,
      ['invitation.recover'],
      'actor-id',
      undefined,
      invitationGateway,
    );

    const button = await screen.findByRole('button', {
      name: 'Recuperar invitación',
    });
    await user.click(button);
    await screen.findByText('La operación de invitación sigue en curso.');
    await user.click(button);

    expect(recoverAccountInvitation).toHaveBeenCalledTimes(2);
    const first = recoverAccountInvitation.mock.calls[0]?.[0];
    const second = recoverAccountInvitation.mock.calls[1]?.[0];
    expect(first?.idempotencyKey).toBe(second?.idempotencyKey);
  });
});
