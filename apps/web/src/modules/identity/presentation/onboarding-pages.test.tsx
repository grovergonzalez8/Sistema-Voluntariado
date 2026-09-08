import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import type { OnboardingGateway } from '../application/onboarding-gateway';
import { OnboardingService } from '../application/onboarding-service';
import type { AccountStatus } from '../domain/account-lifecycle';
import { CompleteProfilePage } from './complete-profile-page';
import { IdentityContext, type IdentityContextValue } from './identity-context';
import { InvitationAcceptancePage } from './invitation-acceptance-page';

const createGateway = () => ({
  acceptCurrentInvitation: vi.fn<OnboardingGateway['acceptCurrentInvitation']>(
    () =>
      Promise.resolve(
        success({ accountId: 'account-id', status: 'pending_profile' }),
      ),
  ),
  completeProfileAndActivate: vi.fn<
    OnboardingGateway['completeProfileAndActivate']
  >(() =>
    Promise.resolve(success({ accountId: 'account-id', status: 'active' })),
  ),
  updatePassword: vi.fn<OnboardingGateway['updatePassword']>(() =>
    Promise.resolve(success(undefined)),
  ),
});

function accessKind(status: AccountStatus) {
  return status === 'pending_profile' ? 'pending-profile' : status;
}

async function renderFlow(status: AccountStatus) {
  const i18n = await createI18n();
  const gateway = createGateway();
  const refreshAccountContext = vi.fn(() => Promise.resolve(success(null)));
  const signOut = vi.fn(() => Promise.resolve(success(undefined)));
  const identity: IdentityContextValue = {
    account: {
      accountId: 'account-id',
      authorityVersion: '1',
      permissions: [],
      status,
    },
    access: {
      account: {
        accountId: 'account-id',
        authorityVersion: '1',
        permissions: [],
        status,
      },
      kind: accessKind(status),
    },
    refreshAccountContext,
    signIn: () =>
      Promise.resolve(
        success({ email: 'invited@example.invalid', id: 'actor' }),
      ),
    signOut,
    user: { email: 'invited@example.invalid', id: 'actor' },
  };
  const service = new OnboardingService(gateway);
  const rendered = render(
    <I18nextProvider i18n={i18n}>
      <IdentityContext.Provider value={identity}>
        <MemoryRouter
          initialEntries={[
            {
              pathname: '/invite/accept',
              state: {
                invitationAcceptanceChallenge: 'a'.repeat(43),
              },
            },
          ]}
        >
          <Routes>
            <Route
              element={<InvitationAcceptancePage service={service} />}
              path="/invite/accept"
            />
            <Route
              element={<CompleteProfilePage service={service} />}
              path="/app/complete-profile"
            />
            <Route element={<p>Profile route</p>} path="/app/profile" />
            <Route element={<p>Login route</p>} path="/login" />
            <Route element={<p>Blocked route</p>} path="/account-blocked" />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>
    </I18nextProvider>,
  );
  return { gateway, refreshAccountContext, signOut, ...rendered };
}

describe('onboarding pages', () => {
  it('accepts an invited account and refreshes authority', async () => {
    const user = userEvent.setup();
    const { gateway, refreshAccountContext } = await renderFlow('invited');

    await user.click(
      screen.getByRole('button', { name: 'Aceptar invitación' }),
    );
    expect(gateway.acceptCurrentInvitation).toHaveBeenCalledOnce();
    expect(gateway.acceptCurrentInvitation).toHaveBeenCalledWith(
      'a'.repeat(43),
    );
    expect(refreshAccountContext).toHaveBeenCalledOnce();
  });

  it('blocks acceptance for a suspended account', async () => {
    await renderFlow('suspended');
    expect(await screen.findByText('Blocked route')).not.toBeNull();
  });

  it('signs out after a terminal invitation failure', async () => {
    const user = userEvent.setup();
    const { gateway, signOut } = await renderFlow('invited');
    gateway.acceptCurrentInvitation.mockResolvedValueOnce(
      failure({ code: 'invitation-revoked', message: 'safe failure' }),
    );

    await user.click(
      screen.getByRole('button', { name: 'Aceptar invitación' }),
    );

    expect(signOut).toHaveBeenCalledOnce();
    expect(await screen.findByText('Login route')).not.toBeNull();
  });

  it('completes the minimum pending profile and activates', async () => {
    const user = userEvent.setup();
    const { gateway, refreshAccountContext, unmount } =
      await renderFlow('pending_profile');
    unmount();

    const i18n = await createI18n();
    const identity: IdentityContextValue = {
      account: {
        accountId: 'account-id',
        authorityVersion: '2',
        permissions: [],
        status: 'pending_profile',
      },
      access: {
        account: {
          accountId: 'account-id',
          authorityVersion: '2',
          permissions: [],
          status: 'pending_profile',
        },
        kind: 'pending-profile',
      },
      refreshAccountContext,
      signIn: () =>
        Promise.resolve(
          success({ email: 'invited@example.invalid', id: 'actor' }),
        ),
      signOut: () => Promise.resolve(success(undefined)),
      user: { email: 'invited@example.invalid', id: 'actor' },
    };
    render(
      <I18nextProvider i18n={i18n}>
        <IdentityContext.Provider value={identity}>
          <MemoryRouter initialEntries={['/app/complete-profile']}>
            <Routes>
              <Route
                element={
                  <CompleteProfilePage
                    service={new OnboardingService(gateway)}
                  />
                }
                path="/app/complete-profile"
              />
              <Route element={<p>Profile route</p>} path="/app/profile" />
            </Routes>
          </MemoryRouter>
        </IdentityContext.Provider>
      </I18nextProvider>,
    );

    await user.type(screen.getByLabelText('Nombre visible'), 'Persona local');
    await user.type(
      screen.getByLabelText('Contraseña'),
      'local-test-only-not-a-secret',
    );
    await user.selectOptions(screen.getByLabelText('Idioma preferido'), 'en');
    await user.click(screen.getByRole('button', { name: 'Activar cuenta' }));

    expect(gateway.updatePassword).toHaveBeenCalledOnce();
    expect(gateway.completeProfileAndActivate).toHaveBeenCalledWith({
      displayName: 'Persona local',
      preferredLocale: 'en',
    });
    expect(await screen.findByText('Profile route')).not.toBeNull();
  });
});
