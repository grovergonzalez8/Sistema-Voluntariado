import { act, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type { AccountContextGateway } from '../application/account-context-gateway';
import { AccountContextService } from '../application/account-context-service';
import type {
  AuthGateway,
  AuthStateListener,
} from '../application/auth-gateway';
import { IdentityService } from '../application/identity-service';
import type { AccountContext } from '../domain/account-administration';
import { useIdentity } from './identity-context';
import { IdentityProvider } from './identity-provider';

const authGateway: AuthGateway = {
  getCurrentUser: () =>
    Promise.resolve(
      success({ email: 'volunteer@example.invalid', id: 'actor-id' }),
    ),
  onAuthStateChange: () => () => undefined,
  signIn: () =>
    Promise.resolve(
      success({ email: 'volunteer@example.invalid', id: 'actor-id' }),
    ),
  signOut: () => Promise.resolve(success(undefined)),
};

function AccountStatusProbe() {
  const identity = useIdentity();
  return (
    <span>{identity.error ?? identity.account?.status ?? identity.status}</span>
  );
}

describe('IdentityProvider', () => {
  it('refreshes authority when an authenticated window regains focus', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValueOnce(
        success({
          accountId: 'account-id',
          authorityVersion: '1',
          permissions: ['volunteer.read_self'],
          status: 'active',
        }),
      )
      .mockResolvedValue(
        success({
          accountId: 'account-id',
          authorityVersion: '2',
          permissions: [],
          status: 'suspended',
        }),
      );

    render(
      <IdentityProvider
        accountService={new AccountContextService({ getCurrentAccountContext })}
        service={new IdentityService(authGateway)}
      >
        <AccountStatusProbe />
      </IdentityProvider>,
    );

    expect(await screen.findByText('active')).not.toBeNull();
    await waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith(
        'focus',
        expect.any(Function),
      );
    });
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('suspended')).not.toBeNull();
    expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
  });

  it('drops stale authority when a refresh cannot be authorized', async () => {
    const addEventListener = vi.spyOn(window, 'addEventListener');
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValueOnce(
        success({
          accountId: 'account-id',
          authorityVersion: '1',
          permissions: ['account.read'],
          status: 'active',
        }),
      )
      .mockResolvedValue(
        failure({ code: 'forbidden', message: 'Authority unavailable.' }),
      );

    render(
      <IdentityProvider
        accountService={new AccountContextService({ getCurrentAccountContext })}
        service={new IdentityService(authGateway)}
      >
        <AccountStatusProbe />
      </IdentityProvider>,
    );

    expect(await screen.findByText('active')).not.toBeNull();
    await waitFor(() => {
      expect(addEventListener).toHaveBeenCalledWith(
        'focus',
        expect.any(Function),
      );
    });
    window.dispatchEvent(new Event('focus'));

    expect(await screen.findByText('Authority unavailable.')).not.toBeNull();
  });

  it('discards an account response from a previous actor', async () => {
    let authListener: AuthStateListener | null = null;
    let resolveFirst: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    let resolveSecond: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    const firstContext = new Promise<Result<AccountContext | null>>(
      (resolve) => {
        resolveFirst = resolve;
      },
    );
    const secondContext = new Promise<Result<AccountContext | null>>(
      (resolve) => {
        resolveSecond = resolve;
      },
    );
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockReturnValueOnce(firstContext)
      .mockReturnValueOnce(secondContext);
    const switchingAuthGateway: AuthGateway = {
      ...authGateway,
      getCurrentUser: () =>
        Promise.resolve(
          success({ email: 'actor-a@example.invalid', id: 'actor-a' }),
        ),
      onAuthStateChange: (listener) => {
        authListener = listener;
        return () => undefined;
      },
    };

    render(
      <IdentityProvider
        accountService={new AccountContextService({ getCurrentAccountContext })}
        service={new IdentityService(switchingAuthGateway)}
      >
        <AccountStatusProbe />
      </IdentityProvider>,
    );

    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(1);
    });
    act(() => {
      authListener?.({ email: 'actor-b@example.invalid', id: 'actor-b' });
    });
    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
    });
    await act(async () => {
      resolveSecond(
        success({
          accountId: 'account-b',
          authorityVersion: '2',
          permissions: [],
          status: 'suspended',
        }),
      );
      await secondContext;
    });
    expect(await screen.findByText('suspended')).not.toBeNull();

    await act(async () => {
      resolveFirst(
        success({
          accountId: 'account-a',
          authorityVersion: '1',
          permissions: ['account.read'],
          status: 'active',
        }),
      );
      await firstContext;
    });
    expect(screen.queryByText('active')).toBeNull();
    expect(screen.getByText('suspended')).not.toBeNull();
  });
});
