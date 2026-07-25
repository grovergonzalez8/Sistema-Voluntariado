import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';
import {
  OperationalAccountRoute,
  PermissionRoute,
} from './account-access-route';
import { IdentityContext, type IdentityContextValue } from './identity-context';

function identity(account: AccountContext): IdentityContextValue {
  return {
    account,
    error: null,
    refreshAccountContext: () => Promise.resolve(success(account)),
    signIn: () =>
      Promise.resolve(success({ email: 'actor@example.invalid', id: 'actor' })),
    signOut: () => Promise.resolve(success(undefined)),
    status: 'ready',
    user: { email: 'actor@example.invalid', id: 'actor' },
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
  const value = identity({
    accountId: 'account-id',
    authorityVersion: version,
    permissions: ['account.read'],
    status: 'active',
  });
  return (
    <IdentityContext.Provider value={value}>
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

  it('redirects a suspended account away from operational routes', async () => {
    render(
      <IdentityContext.Provider
        value={identity({
          accountId: 'account-id',
          authorityVersion: '2',
          permissions: [],
          status: 'suspended',
        })}
      >
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

    expect(await screen.findByText('Blocked')).not.toBeNull();
    expect(screen.queryByText('Profile')).toBeNull();
  });
});
