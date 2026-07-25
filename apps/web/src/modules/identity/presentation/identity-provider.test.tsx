import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
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
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { getAccountContextQueryKey } from './account-context-query';
import { useIdentity } from './identity-context';
import { IdentityProvider } from './identity-provider';

const actorA = { email: 'actor-a@example.invalid', id: 'actor-a' } as const;
const actorB = { email: 'actor-b@example.invalid', id: 'actor-b' } as const;

function account(
  accountId: string,
  status: AccountContext['status'] = 'active',
  authorityVersion = '1',
): AccountContext {
  return {
    accountId,
    authorityVersion,
    permissions: ['account.read'],
    status,
  };
}

function createAuthGateway(initialUser: AuthenticatedUser = actorA): {
  readonly gateway: AuthGateway;
  readonly listener: { current: AuthStateListener | null };
} {
  const listener = { current: null as AuthStateListener | null };
  return {
    gateway: {
      getCurrentUser: () => Promise.resolve(success(initialUser)),
      onAuthStateChange: (nextListener) => {
        listener.current = nextListener;
        return () => {
          listener.current = null;
        };
      },
      signIn: () => Promise.resolve(success(initialUser)),
      signOut: () => Promise.resolve(success(undefined)),
    },
    listener,
  };
}

function IdentityProbe() {
  const identity = useIdentity();
  return (
    <div>
      <button
        onClick={() =>
          void identity.signIn({
            email: 'actor-a@example.invalid',
            password: 'test-password',
          })
        }
      >
        sign in
      </button>
      <span data-testid="access">{identity.access.kind}</span>
      <span data-testid="account">
        {identity.account
          ? `${identity.account.accountId}:${identity.account.status}:${identity.account.authorityVersion}`
          : 'none'}
      </span>
    </div>
  );
}

function renderIdentity(
  getCurrentAccountContext: AccountContextGateway['getCurrentAccountContext'],
  authGateway: AuthGateway,
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const view = render(
    <QueryClientProvider client={queryClient}>
      <IdentityProvider
        accountService={
          new AccountContextService({
            getCurrentAccountContext,
          })
        }
        service={new IdentityService(authGateway)}
      >
        <IdentityProbe />
      </IdentityProvider>
    </QueryClientProvider>,
  );
  return { ...view, queryClient };
}

describe('IdentityProvider', () => {
  it('keeps active authority while a hidden-to-visible focus refetch is pending', async () => {
    let resolveRefetch: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    const refetch = new Promise<Result<AccountContext | null>>((resolve) => {
      resolveRefetch = resolve;
    });
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValueOnce(success(account('account-a')))
      .mockReturnValueOnce(refetch);
    const { gateway } = createAuthGateway();

    renderIdentity(getCurrentAccountContext, gateway);
    expect(await screen.findByText('account-a:active:1')).not.toBeNull();

    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    window.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    window.dispatchEvent(new Event('visibilitychange'));

    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('access').textContent).toBe('loading-authority');
    expect(screen.getByText('account-a:active:1')).not.toBeNull();

    await act(async () => {
      resolveRefetch(success(account('account-a', 'active', '2')));
      await refetch;
    });
    expect(await screen.findByText('account-a:active:2')).not.toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('access').textContent).toBe('active');
    });
  });

  it.each(['token-refreshed', 'signed-in', 'user-updated'] as const)(
    'preserves same-user authority for %s',
    async (event) => {
      let resolveRefetch: (
        result: Result<AccountContext | null>,
      ) => void = () => undefined;
      const refetch = new Promise<Result<AccountContext | null>>((resolve) => {
        resolveRefetch = resolve;
      });
      const getCurrentAccountContext = vi
        .fn<AccountContextGateway['getCurrentAccountContext']>()
        .mockResolvedValueOnce(success(account('account-a')))
        .mockReturnValueOnce(refetch);
      const { gateway, listener } = createAuthGateway();

      renderIdentity(getCurrentAccountContext, gateway);
      expect(await screen.findByText('account-a:active:1')).not.toBeNull();
      act(() => {
        listener.current?.({ event, user: actorA });
      });

      await waitFor(() => {
        expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
      });
      expect(screen.getByText('account-a:active:1')).not.toBeNull();
      expect(screen.getByTestId('access').textContent).toBe(
        'loading-authority',
      );

      await act(async () => {
        resolveRefetch(success(account('account-a', 'active', '2')));
        await refetch;
      });
      expect(await screen.findByText('account-a:active:2')).not.toBeNull();
    },
  );

  it('clears authority and becomes unauthenticated on SIGNED_OUT', async () => {
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValue(success(account('account-a')));
    const { gateway, listener } = createAuthGateway();
    const { queryClient } = renderIdentity(getCurrentAccountContext, gateway);

    expect(await screen.findByText('account-a:active:1')).not.toBeNull();
    act(() => {
      listener.current?.({ event: 'signed-out', user: null });
    });

    await waitFor(() => {
      expect(screen.getByTestId('access').textContent).toBe('unauthenticated');
    });
    expect(screen.getByTestId('account').textContent).toBe('none');
    await waitFor(() => {
      expect(
        queryClient.getQueryState(getAccountContextQueryKey(actorA.id)),
      ).toBeUndefined();
    });
  });

  it('does not resurrect a stale bootstrap user after SIGNED_OUT', async () => {
    let resolveCurrentUser: (
      result: Result<AuthenticatedUser | null>,
    ) => void = () => undefined;
    const currentUser = new Promise<Result<AuthenticatedUser | null>>(
      (resolve) => {
        resolveCurrentUser = resolve;
      },
    );
    const listener = { current: null as AuthStateListener | null };
    const gateway: AuthGateway = {
      getCurrentUser: () => currentUser,
      onAuthStateChange: (nextListener) => {
        listener.current = nextListener;
        return () => undefined;
      },
      signIn: () => Promise.resolve(success(actorA)),
      signOut: () => Promise.resolve(success(undefined)),
    };
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValue(success(account('account-a')));

    renderIdentity(getCurrentAccountContext, gateway);
    await waitFor(() => {
      expect(listener.current).not.toBeNull();
    });
    act(() => {
      listener.current?.({ event: 'signed-out', user: null });
    });
    await act(async () => {
      resolveCurrentUser(success(actorA));
      await currentUser;
    });

    expect(screen.getByTestId('access').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('account').textContent).toBe('none');
    expect(getCurrentAccountContext).not.toHaveBeenCalled();
  });

  it('does not apply a stale sign-in result after a newer SIGNED_OUT event', async () => {
    let resolveSignIn: (result: Result<AuthenticatedUser>) => void = () =>
      undefined;
    const signInResult = new Promise<Result<AuthenticatedUser>>((resolve) => {
      resolveSignIn = resolve;
    });
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValue(success(account('account-a')));
    const { gateway, listener } = createAuthGateway();
    gateway.getCurrentUser = () => Promise.resolve(success(null));
    gateway.signIn = () => signInResult;

    renderIdentity(getCurrentAccountContext, gateway);
    await waitFor(() => {
      expect(screen.getByTestId('access').textContent).toBe('unauthenticated');
    });
    act(() => {
      screen.getByRole('button', { name: 'sign in' }).click();
    });
    act(() => {
      listener.current?.({ event: 'signed-out', user: null });
    });
    await act(async () => {
      resolveSignIn(success(actorA));
      await signInResult;
    });

    expect(screen.getByTestId('access').textContent).toBe('unauthenticated');
    expect(screen.getByTestId('account').textContent).toBe('none');
    expect(getCurrentAccountContext).not.toHaveBeenCalled();
  });

  it('clears the previous account when the authenticated user really changes', async () => {
    let resolveActorB: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    const actorBContext = new Promise<Result<AccountContext | null>>(
      (resolve) => {
        resolveActorB = resolve;
      },
    );
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValueOnce(success(account('account-a')))
      .mockReturnValueOnce(actorBContext);
    const { gateway, listener } = createAuthGateway();

    renderIdentity(getCurrentAccountContext, gateway);
    expect(await screen.findByText('account-a:active:1')).not.toBeNull();
    act(() => {
      listener.current?.({ event: 'signed-in', user: actorB });
    });

    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
    });
    expect(screen.getByTestId('account').textContent).toBe('none');
    expect(screen.getByTestId('access').textContent).toBe('loading-authority');

    await act(async () => {
      resolveActorB(success(account('account-b')));
      await actorBContext;
    });
    expect(await screen.findByText('account-b:active:1')).not.toBeNull();
    expect(screen.queryByText('account-a:active:1')).toBeNull();
  });

  it('discards a late response from a previous authenticated user', async () => {
    let resolveActorA: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    let resolveActorB: (result: Result<AccountContext | null>) => void = () =>
      undefined;
    const actorAContext = new Promise<Result<AccountContext | null>>(
      (resolve) => {
        resolveActorA = resolve;
      },
    );
    const actorBContext = new Promise<Result<AccountContext | null>>(
      (resolve) => {
        resolveActorB = resolve;
      },
    );
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockReturnValueOnce(actorAContext)
      .mockReturnValueOnce(actorBContext);
    const { gateway, listener } = createAuthGateway();

    renderIdentity(getCurrentAccountContext, gateway);
    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(1);
    });
    act(() => {
      listener.current?.({ event: 'signed-in', user: actorB });
    });
    await waitFor(() => {
      expect(getCurrentAccountContext).toHaveBeenCalledTimes(2);
    });

    await act(async () => {
      resolveActorB(success(account('account-b', 'suspended')));
      await actorBContext;
    });
    expect(await screen.findByText('account-b:suspended:1')).not.toBeNull();

    await act(async () => {
      resolveActorA(success(account('account-a')));
      await actorAContext;
    });
    expect(screen.queryByText('account-a:active:1')).toBeNull();
    expect(screen.getByText('account-b:suspended:1')).not.toBeNull();
  });

  it('turns a temporary authority failure into a recoverable state', async () => {
    const getCurrentAccountContext = vi
      .fn<AccountContextGateway['getCurrentAccountContext']>()
      .mockResolvedValueOnce(success(account('account-a')))
      .mockResolvedValue(
        failure({ code: 'network', message: 'Authority unavailable.' }),
      );
    const { gateway, listener } = createAuthGateway();

    renderIdentity(getCurrentAccountContext, gateway);
    expect(await screen.findByText('account-a:active:1')).not.toBeNull();
    act(() => {
      listener.current?.({ event: 'token-refreshed', user: actorA });
    });

    await waitFor(
      () => {
        expect(screen.getByTestId('access').textContent).toBe(
          'recoverable-error',
        );
      },
      { timeout: 3000 },
    );
    expect(screen.getByText('account-a:active:1')).not.toBeNull();
  });
});
