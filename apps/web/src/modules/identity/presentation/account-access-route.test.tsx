import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';
import {
  AccountBlockedPage,
  OperationalAccountRoute,
  PermissionRoute,
} from './account-access-route';
import {
  IdentityContext,
  type IdentityAccessState,
  type IdentityContextValue,
} from './identity-context';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

function accessFor(account: AccountContext): IdentityAccessState {
  switch (account.status) {
    case 'active':
      return { account, kind: 'active' };
    case 'archived':
      return { account, kind: 'archived' };
    case 'invited':
      return { account, kind: 'invited' };
    case 'pending_profile':
      return { account, kind: 'pending-profile' };
    case 'suspended':
      return { account, kind: 'suspended' };
  }
}

function identity(
  account: AccountContext | null,
  access: IdentityAccessState = account
    ? accessFor(account)
    : { kind: 'forbidden' },
): IdentityContextValue {
  return {
    access,
    account,
    refreshAccountContext: () => Promise.resolve(success(account)),
    signIn: () =>
      Promise.resolve(success({ email: 'actor@example.invalid', id: 'actor' })),
    signOut: () => Promise.resolve(success(undefined)),
    user: { email: 'actor@example.invalid', id: 'actor' },
  };
}

function activeAccount(
  permissions: readonly string[] = ['account.read'],
  authorityVersion = '1',
): AccountContext {
  return {
    accountId: 'account-id',
    authorityVersion,
    permissions,
    status: 'active',
  };
}

function StatefulProbe() {
  const [count, setCount] = useState(0);
  return (
    <button
      onClick={() => {
        setCount((value) => value + 1);
      }}
    >
      {count}
    </button>
  );
}

function Harness() {
  const [version, setVersion] = useState('1');
  const account = activeAccount(['account.read'], version);
  return (
    <IdentityContext.Provider value={identity(account)}>
      <button
        onClick={() => {
          setVersion('2');
        }}
      >
        Refresh authority
      </button>
      <Outlet />
    </IdentityContext.Provider>
  );
}

describe('account access routes', () => {
  it('remounts protected presentation state when authority changes', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter initialEntries={['/admin']}>
        <Routes>
          <Route element={<Harness />}>
            <Route element={<PermissionRoute permission="account.read" />}>
              <Route element={<StatefulProbe />} path="/admin" />
            </Route>
          </Route>
        </Routes>
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: '0' }));
    expect(screen.getByRole('button', { name: '1' })).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Refresh authority' }));
    expect(screen.getByRole('button', { name: '0' })).not.toBeNull();
  });

  it('keeps an active account in the panel while authority is refetching', () => {
    const account = activeAccount(['account.read']);
    render(
      <IdentityContext.Provider
        value={identity(account, { account, kind: 'loading-authority' })}
      >
        <MemoryRouter initialEntries={['/app/admin']}>
          <Routes>
            <Route element={<OperationalAccountRoute />} path="/app">
              <Route element={<p>Administrative panel</p>} path="admin" />
            </Route>
            <Route element={<p>Blocked</p>} path="/account-blocked" />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>,
    );

    expect(screen.getByText('Administrative panel')).not.toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('shows feature-level access denied without blocking an active account', () => {
    const account = activeAccount([]);
    render(
      <IdentityContext.Provider value={identity(account)}>
        <MemoryRouter initialEntries={['/app/admin/invitations']}>
          <Routes>
            <Route
              element={<PermissionRoute permission="invitation.create" />}
              path="/app/admin"
            >
              <Route element={<p>Invitations</p>} path="invitations" />
            </Route>
            <Route element={<p>Blocked</p>} path="/account-blocked" />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>,
    );

    expect(
      screen.getByRole('heading', { name: 'access.forbiddenTitle' }),
    ).not.toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it.each(['suspended', 'archived'] as const)(
    'renders the correct blocked page for a %s account',
    (status) => {
      const account: AccountContext = {
        ...activeAccount([]),
        status,
      };
      render(
        <IdentityContext.Provider value={identity(account)}>
          <MemoryRouter initialEntries={['/account-blocked']}>
            <Routes>
              <Route element={<AccountBlockedPage />} path="/account-blocked" />
            </Routes>
          </MemoryRouter>
        </IdentityContext.Provider>,
      );

      expect(
        screen.getByRole('heading', { name: 'access.blockedTitle' }),
      ).not.toBeNull();
      expect(screen.getByText(`access.${status}`)).not.toBeNull();
      expect(screen.queryByText('access.active')).toBeNull();
    },
  );

  it('redirects pending profile only to profile completion', async () => {
    const account: AccountContext = {
      ...activeAccount([]),
      status: 'pending_profile',
    };
    render(
      <IdentityContext.Provider value={identity(account)}>
        <MemoryRouter initialEntries={['/app/profile']}>
          <Routes>
            <Route element={<OperationalAccountRoute />} path="/app">
              <Route element={<p>Profile</p>} path="profile" />
            </Route>
            <Route
              element={<p>Complete profile</p>}
              path="/app/complete-profile"
            />
            <Route element={<p>Blocked</p>} path="/account-blocked" />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>,
    );

    expect(await screen.findByText('Complete profile')).not.toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
  });

  it('redirects an active account away from a directly opened blocked route', async () => {
    const account = activeAccount(['invitation.read']);
    render(
      <IdentityContext.Provider value={identity(account)}>
        <MemoryRouter initialEntries={['/account-blocked']}>
          <Routes>
            <Route element={<AccountBlockedPage />} path="/account-blocked" />
            <Route
              element={<p>Invitations panel</p>}
              path="/app/admin/invitations"
            />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>,
    );

    expect(await screen.findByText('Invitations panel')).not.toBeNull();
    expect(screen.queryByText('access.blockedTitle')).toBeNull();
    expect(screen.queryByText('access.active')).toBeNull();
  });

  it('shows a retryable authority failure without navigating to blocked', () => {
    const retry = vi.fn(() => Promise.resolve(success(null)));
    const value: IdentityContextValue = {
      ...identity(null),
      access: {
        account: null,
        kind: 'recoverable-error',
        message: 'Temporary failure',
      },
      refreshAccountContext: retry,
    };
    render(
      <IdentityContext.Provider value={value}>
        <MemoryRouter initialEntries={['/app/profile']}>
          <Routes>
            <Route element={<OperationalAccountRoute />} path="/app">
              <Route element={<p>Profile</p>} path="profile" />
            </Route>
            <Route element={<p>Blocked</p>} path="/account-blocked" />
          </Routes>
        </MemoryRouter>
      </IdentityContext.Provider>,
    );

    expect(
      screen.getByRole('heading', {
        name: 'access.recoveryTitle',
      }),
    ).not.toBeNull();
    expect(screen.getByRole('button', { name: 'common.retry' })).not.toBeNull();
    expect(screen.queryByText('Blocked')).toBeNull();
  });
});
