import { render, screen, waitFor } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import { createI18n } from '../../../app/providers/i18n';
import { AuthCallbackPage } from './auth-callback-page';
import { IdentityContext, type IdentityContextValue } from './identity-context';

function invitationChallenge(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || Array.isArray(state)) {
    return null;
  }
  const challenge = (state as Record<string, unknown>)[
    'invitationAcceptanceChallenge'
  ];
  return typeof challenge === 'string' ? challenge : null;
}

function CallbackTarget() {
  const location = useLocation();
  const challenge = invitationChallenge(location.state);
  return (
    <p>
      {location.search === '' && challenge === 'a'.repeat(43)
        ? 'challenge-preserved'
        : 'challenge-missing'}
    </p>
  );
}

describe('AuthCallbackPage', () => {
  it('moves the delivery challenge to ephemeral router state and cleans the query', async () => {
    const i18n = await createI18n();
    const identity: IdentityContextValue = {
      account: {
        accountId: 'account-id',
        authorityVersion: '1',
        permissions: [],
        status: 'invited',
      },
      access: {
        account: {
          accountId: 'account-id',
          authorityVersion: '1',
          permissions: [],
          status: 'invited',
        },
        kind: 'invited',
      },
      refreshAccountContext: () => Promise.resolve(success(null)),
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
          <MemoryRouter
            initialEntries={[
              `/auth/callback?invitation_challenge=${'a'.repeat(43)}`,
            ]}
          >
            <Routes>
              <Route element={<AuthCallbackPage />} path="/auth/callback" />
              <Route element={<CallbackTarget />} path="/invite/accept" />
              <Route element={<p>login</p>} path="/login" />
            </Routes>
          </MemoryRouter>
        </IdentityContext.Provider>
      </I18nextProvider>,
    );

    expect(await screen.findByText('challenge-preserved')).not.toBeNull();
  });

  it('does not treat a prior active session as invitation success', async () => {
    const i18n = await createI18n();
    const signOut = vi.fn(() => Promise.resolve(success(undefined)));
    const identity: IdentityContextValue = {
      account: {
        accountId: 'account-id',
        authorityVersion: '1',
        permissions: [],
        status: 'active',
      },
      access: {
        account: {
          accountId: 'account-id',
          authorityVersion: '1',
          permissions: [],
          status: 'active',
        },
        kind: 'active',
      },
      refreshAccountContext: () => Promise.resolve(success(null)),
      signIn: () =>
        Promise.resolve(success({ email: 'x@example.invalid', id: 'x' })),
      signOut,
      user: { email: 'x@example.invalid', id: 'x' },
    };

    render(
      <I18nextProvider i18n={i18n}>
        <IdentityContext.Provider value={identity}>
          <MemoryRouter
            initialEntries={[
              `/auth/callback?invitation_challenge=${'a'.repeat(43)}`,
            ]}
          >
            <Routes>
              <Route element={<AuthCallbackPage />} path="/auth/callback" />
              <Route element={<p>login</p>} path="/login" />
            </Routes>
          </MemoryRouter>
        </IdentityContext.Provider>
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('login')).not.toBeNull();
  });

  it('clears a session when Auth reports an invalid or expired link', async () => {
    const i18n = await createI18n();
    const signOut = vi.fn(() => Promise.resolve(success(undefined)));
    const identity: IdentityContextValue = {
      account: null,
      access: { kind: 'unauthenticated' },
      refreshAccountContext: () => Promise.resolve(success(null)),
      signIn: () =>
        Promise.resolve(success({ email: 'x@example.invalid', id: 'x' })),
      signOut,
      user: { email: 'x@example.invalid', id: 'x' },
    };

    render(
      <I18nextProvider i18n={i18n}>
        <IdentityContext.Provider value={identity}>
          <MemoryRouter
            initialEntries={[
              '/auth/callback?error_code=otp_expired&error_description=redacted',
            ]}
          >
            <Routes>
              <Route element={<AuthCallbackPage />} path="/auth/callback" />
              <Route element={<p>login</p>} path="/login" />
            </Routes>
          </MemoryRouter>
        </IdentityContext.Provider>
      </I18nextProvider>,
    );

    await waitFor(() => {
      expect(signOut).toHaveBeenCalledOnce();
    });
    expect(await screen.findByText('login')).not.toBeNull();
  });
});
