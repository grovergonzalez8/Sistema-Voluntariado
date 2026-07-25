import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { InvitationAdministrationGateway } from '../application/invitation-administration-gateway';
import { InvitationAdministrationService } from '../application/invitation-administration-service';
import type { AccountContext } from '../domain/account-administration';
import { IdentityContext, type IdentityContextValue } from './identity-context';
import { InvitationsPage } from './invitations-page';

const invitationId = '00000000-0000-4000-8000-000000000020';
const commandResult = {
  accountId: '00000000-0000-4000-8000-000000000021',
  invitationId,
  status: 'sent' as const,
};

const createIdentity = (
  account: AccountContext,
  signOut: IdentityContextValue['signOut'] = () =>
    Promise.resolve(success(undefined)),
  actorId = 'actor-id',
): IdentityContextValue => ({
  access: { account, kind: 'active' },
  account,
  refreshAccountContext: () => Promise.resolve(success(account)),
  signIn: () =>
    Promise.resolve(
      success({ email: 'administrator@example.invalid', id: actorId }),
    ),
  signOut,
  user: { email: 'administrator@example.invalid', id: actorId },
});

const createGateway = () => {
  const createInvitation = vi.fn<
    InvitationAdministrationGateway['createInvitation']
  >(() => Promise.resolve(success(commandResult)));
  const revokeInvitation = vi.fn<
    InvitationAdministrationGateway['revokeInvitation']
  >(() => Promise.resolve(success(commandResult)));
  const replaceInvitation = vi.fn<
    InvitationAdministrationGateway['replaceInvitation']
  >(() => Promise.resolve(success(commandResult)));
  const resendInvitation = vi.fn<
    InvitationAdministrationGateway['resendInvitation']
  >(() => Promise.resolve(success(commandResult)));
  const gateway: InvitationAdministrationGateway = {
    createInvitation,
    getInvitationDetail: () =>
      Promise.resolve(
        failure({ code: 'not-found', message: 'No encontrada.' }),
      ),
    listInvitations: () =>
      Promise.resolve(
        success([
          {
            accountId: commandResult.accountId,
            createdAt: '2026-07-24T00:00:00.000Z',
            createdBy: 'actor-id',
            displayName: 'Invitada local',
            expiresAt: '2026-07-24T01:00:00.000Z',
            id: invitationId,
            normalizedEmail: 'invited-ui@example.invalid',
            preferredLocale: 'es',
            requestedInitialRoleCode: 'volunteer',
            sentAt: '2026-07-24T00:00:01.000Z',
            status: 'sent',
            supersededBy: null,
          },
        ]),
      ),
    replaceInvitation,
    resendInvitation,
    revokeInvitation,
  };
  return {
    createInvitation,
    gateway,
    replaceInvitation,
    resendInvitation,
    revokeInvitation,
  };
};

const renderPage = async (
  gateway: InvitationAdministrationGateway,
  permissions: readonly string[],
) => {
  const i18n = await createI18n();
  const signOut = vi.fn(() => Promise.resolve(success(undefined)));
  const account: AccountContext = {
    accountId: '00000000-0000-4000-8000-000000000001',
    authorityVersion: 'v1',
    permissions,
    status: 'active',
  };
  const service = new InvitationAdministrationService(gateway);
  const renderTree = (
    currentAccount: AccountContext,
    currentSignOut: IdentityContextValue['signOut'],
    actorId: string,
  ) => (
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <IdentityContext.Provider
          value={createIdentity(currentAccount, currentSignOut, actorId)}
        >
          <InvitationsPage service={service} />
        </IdentityContext.Provider>
      </MemoryRouter>
    </I18nextProvider>
  );
  const rendered = render(renderTree(account, signOut, 'actor-id'));
  return {
    ...rendered,
    rerenderIdentity: (
      actorId: string,
      currentSignOut: IdentityContextValue['signOut'],
    ) => {
      rendered.rerender(
        renderTree(
          { ...account, accountId: `account-${actorId}` },
          currentSignOut,
          actorId,
        ),
      );
    },
    signOut,
  };
};

describe('InvitationsPage', () => {
  it('creates a normalized invitation with an authorized role and locale', async () => {
    const user = userEvent.setup();
    const { createInvitation, gateway } = createGateway();
    await renderPage(gateway, [
      'invitation.create',
      'invitation.resend',
      'invitation.revoke',
    ]);

    await screen.findByText('invited-ui@example.invalid');
    expect(
      screen.getByLabelText('Rol inicial').querySelectorAll('option'),
    ).toHaveLength(6);
    await user.type(
      screen.getByLabelText('Correo electrónico'),
      '  NEW-USER@EXAMPLE.INVALID ',
    );
    await user.selectOptions(screen.getByLabelText('Idioma preferido'), 'en');
    await user.selectOptions(
      screen.getByLabelText('Rol inicial'),
      'coordinator',
    );
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }));

    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({
        normalizedEmail: 'new-user@example.invalid',
        preferredLocale: 'en',
        requestedInitialRoleCode: 'coordinator',
      }),
    );
    expect(await screen.findByText('Invitación creada.')).not.toBeNull();
  });

  it('limits a coordinator to volunteer and hides privileged actions', async () => {
    const { gateway } = createGateway();
    await renderPage(gateway, ['invitation.create']);

    await screen.findByText('invited-ui@example.invalid');
    expect(
      screen.getByLabelText('Rol inicial').querySelectorAll('option'),
    ).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Revocar' })).toBeNull();
  });

  it('requires confirmation before revoking an invitation', async () => {
    const user = userEvent.setup();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway, revokeInvitation } = createGateway();
    await renderPage(gateway, [
      'invitation.create',
      'invitation.resend',
      'invitation.revoke',
    ]);

    await user.click(await screen.findByRole('button', { name: 'Revocar' }));

    expect(confirm).toHaveBeenCalledOnce();
    expect(revokeInvitation).toHaveBeenCalledWith({
      invitationId,
      reason: 'Solicitud administrativa',
    });
    expect(await screen.findByText('Invitación actualizada.')).not.toBeNull();
  });

  it('reuses the creation idempotency key after an ambiguous failure', async () => {
    const user = userEvent.setup();
    const { createInvitation, gateway } = createGateway();
    createInvitation
      .mockResolvedValueOnce(
        failure({ code: 'unexpected', message: 'Respuesta no confirmada.' }),
      )
      .mockResolvedValueOnce(success(commandResult));
    await renderPage(gateway, ['invitation.create']);

    await user.type(
      screen.getByLabelText('Correo electrónico'),
      'retry@example.invalid',
    );
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }));
    expect(await screen.findByText('Respuesta no confirmada.')).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Crear invitación' }));

    const firstInput = createInvitation.mock.calls[0]?.[0];
    const secondInput = createInvitation.mock.calls[1]?.[0];
    expect(firstInput?.idempotencyKey).toBe(secondInput?.idempotencyKey);
    expect(await screen.findByText('Invitación creada.')).not.toBeNull();
  });

  it('keeps the administrator session and panel after origin_denied', async () => {
    const user = userEvent.setup();
    const { createInvitation, gateway } = createGateway();
    createInvitation.mockResolvedValue(
      failure({
        code: 'origin-denied',
        message: 'Origen no autorizado.',
      }),
    );
    const { signOut } = await renderPage(gateway, ['invitation.create']);

    await user.type(
      screen.getByLabelText(/Correo electr/i),
      'origin-denied@example.invalid',
    );
    await user.click(screen.getByRole('button', { name: /Crear invitaci/ }));

    expect(
      await screen.findByText(/El origen local de la aplicaci/),
    ).not.toBeNull();
    expect(
      screen.getByRole('heading', { name: 'Invitaciones' }),
    ).not.toBeNull();
    expect(screen.queryByText('Acceso no disponible')).toBeNull();
    expect(signOut).not.toHaveBeenCalled();
  });

  it('discards a late create 401 after the authenticated actor changes', async () => {
    const user = userEvent.setup();
    const { createInvitation, gateway } = createGateway();
    let resolveCreate: (
      value: Awaited<ReturnType<typeof createInvitation>>,
    ) => void = () => undefined;
    createInvitation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
    );
    const view = await renderPage(gateway, ['invitation.create']);
    const nextActorSignOut = vi.fn(() => Promise.resolve(success(undefined)));

    await screen.findByText('invited-ui@example.invalid');
    await user.type(
      screen.getByLabelText(/Correo electr/i),
      'late-create@example.invalid',
    );
    await user.click(screen.getByRole('button', { name: /Crear invitaci/ }));
    expect(createInvitation).toHaveBeenCalledOnce();

    view.rerenderIdentity('actor-b', nextActorSignOut);
    act(() => {
      resolveCreate(
        failure({ code: 'unauthenticated', message: 'Session expired.' }),
      );
    });

    await waitFor(() => {
      expect(view.signOut).not.toHaveBeenCalled();
      expect(nextActorSignOut).not.toHaveBeenCalled();
    });
    expect(
      screen.getByRole('heading', { name: 'Invitaciones' }),
    ).not.toBeNull();
  });

  it('discards a late administrative action 401 after the actor changes', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway, revokeInvitation } = createGateway();
    let resolveRevoke: (
      value: Awaited<ReturnType<typeof revokeInvitation>>,
    ) => void = () => undefined;
    revokeInvitation.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveRevoke = resolve;
        }),
    );
    const view = await renderPage(gateway, [
      'invitation.create',
      'invitation.revoke',
    ]);
    const nextActorSignOut = vi.fn(() => Promise.resolve(success(undefined)));

    await user.click(await screen.findByRole('button', { name: 'Revocar' }));
    expect(revokeInvitation).toHaveBeenCalledOnce();

    view.rerenderIdentity('actor-b', nextActorSignOut);
    act(() => {
      resolveRevoke(
        failure({ code: 'unauthenticated', message: 'Session expired.' }),
      );
    });

    await waitFor(() => {
      expect(view.signOut).not.toHaveBeenCalled();
      expect(nextActorSignOut).not.toHaveBeenCalled();
    });
    expect(
      screen.getByRole('heading', { name: 'Invitaciones' }),
    ).not.toBeNull();
  });

  it('renders loading, empty, and safe error list states', async () => {
    let resolveList: (
      value: Awaited<
        ReturnType<InvitationAdministrationGateway['listInvitations']>
      >,
    ) => void = () => undefined;
    const pending = new Promise<
      Awaited<ReturnType<InvitationAdministrationGateway['listInvitations']>>
    >((resolve) => {
      resolveList = resolve;
    });
    const { gateway } = createGateway();
    gateway.listInvitations = () => pending;
    const rendered = await renderPage(gateway, ['invitation.create']);
    expect(screen.getByRole('status')).not.toBeNull();
    resolveList(success([]));
    expect(
      await screen.findByText('No hay invitaciones en tu alcance autorizado.'),
    ).not.toBeNull();
    rendered.unmount();

    const failed = createGateway().gateway;
    failed.listInvitations = () =>
      Promise.resolve(
        failure({ code: 'forbidden', message: 'Lectura denegada.' }),
      );
    await renderPage(failed, ['invitation.create']);
    expect(
      await screen.findByText(/No tienes permiso para esta invitaci/),
    ).not.toBeNull();
  });

  it('resends and replaces an open invitation through distinct commands', async () => {
    const user = userEvent.setup();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const { gateway, replaceInvitation, resendInvitation } = createGateway();
    await renderPage(gateway, [
      'invitation.create',
      'invitation.resend',
      'invitation.revoke',
    ]);

    await user.click(await screen.findByRole('button', { name: 'Reenviar' }));
    const resendInput = resendInvitation.mock.calls[0]?.[0];
    expect(resendInput?.invitationId).toBe(invitationId);
    expect(typeof resendInput?.idempotencyKey).toBe('string');
    await user.click(screen.getByRole('button', { name: 'Sustituir' }));
    const replaceInput = replaceInvitation.mock.calls[0]?.[0];
    expect(replaceInput?.invitationId).toBe(invitationId);
    expect(typeof replaceInput?.idempotencyKey).toBe('string');
  });
});
