import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import {
  getAccountContextQueryKey,
  IdentityContext,
  type IdentityContextValue,
} from '../../modules/identity';
import { PersonalDataCacheGuard } from './personal-data-cache-guard';

const identity = (
  userId: string,
  authorityVersion: string,
): IdentityContextValue => {
  const account = {
    accountId: `account-${userId}`,
    authorityVersion,
    permissions: ['profile.read_own'],
    status: 'active' as const,
  };
  return {
    access: { account, kind: 'active' },
    account,
    refreshAccountContext: () => Promise.resolve(success(null)),
    signIn: () =>
      Promise.resolve(
        success({ email: `${userId}@example.invalid`, id: userId }),
      ),
    signOut: () => Promise.resolve(success(undefined)),
    user: { email: `${userId}@example.invalid`, id: userId },
  };
};

describe('PersonalDataCacheGuard', () => {
  it('preserves current authority but removes other private data on authority changes', async () => {
    const queryClient = new QueryClient();
    const authorityKey = getAccountContextQueryKey('actor-a');
    const profileKey = ['profile', 'actor-a'] as const;
    queryClient.setQueryData(authorityKey, { authorityVersion: 'v1' });
    queryClient.setQueryData(profileKey, { displayName: 'Private profile' });
    const renderTree = (value: IdentityContextValue) => (
      <QueryClientProvider client={queryClient}>
        <IdentityContext.Provider value={value}>
          <PersonalDataCacheGuard>
            <span>contenido</span>
          </PersonalDataCacheGuard>
        </IdentityContext.Provider>
      </QueryClientProvider>
    );
    const view = render(renderTree(identity('actor-a', 'v1')));

    view.rerender(renderTree(identity('actor-a', 'v2')));
    await waitFor(() => {
      expect(queryClient.getQueryData(profileKey)).toBeUndefined();
    });
    expect(queryClient.getQueryData(authorityKey)).toEqual({
      authorityVersion: 'v1',
    });
  });

  it('removes the previous actor cache without removing the new actor authority', async () => {
    const queryClient = new QueryClient();
    const actorAKey = getAccountContextQueryKey('actor-a');
    const actorBKey = getAccountContextQueryKey('actor-b');
    queryClient.setQueryData(actorAKey, { accountId: 'account-a' });
    const renderTree = (value: IdentityContextValue) => (
      <QueryClientProvider client={queryClient}>
        <IdentityContext.Provider value={value}>
          <PersonalDataCacheGuard>
            <span>contenido</span>
          </PersonalDataCacheGuard>
        </IdentityContext.Provider>
      </QueryClientProvider>
    );
    const view = render(renderTree(identity('actor-a', 'v1')));
    queryClient.setQueryData(actorBKey, { accountId: 'account-b' });

    view.rerender(renderTree(identity('actor-b', 'v1')));
    await waitFor(() => {
      expect(queryClient.getQueryData(actorAKey)).toBeUndefined();
    });
    expect(queryClient.getQueryData(actorBKey)).toEqual({
      accountId: 'account-b',
    });
  });

  it('does not let a delayed purge remove a newer actor authority query', async () => {
    const queryClient = new QueryClient();
    const actorCKey = getAccountContextQueryKey('actor-c');
    let resolveFirstCancellation: () => void = () => undefined;
    const firstCancellation = new Promise<void>((resolve) => {
      resolveFirstCancellation = resolve;
    });
    const originalCancelQueries = queryClient.cancelQueries.bind(queryClient);
    vi.spyOn(queryClient, 'cancelQueries')
      .mockImplementationOnce(() => firstCancellation)
      .mockImplementation((filters) => originalCancelQueries(filters));
    const renderTree = (value: IdentityContextValue) => (
      <QueryClientProvider client={queryClient}>
        <IdentityContext.Provider value={value}>
          <PersonalDataCacheGuard>
            <span>contenido</span>
          </PersonalDataCacheGuard>
        </IdentityContext.Provider>
      </QueryClientProvider>
    );
    const view = render(renderTree(identity('actor-a', 'v1')));

    view.rerender(renderTree(identity('actor-b', 'v1')));
    queryClient.setQueryData(actorCKey, { accountId: 'account-c' });
    view.rerender(renderTree(identity('actor-c', 'v1')));
    await waitFor(() => {
      expect(queryClient.getQueryData(actorCKey)).toEqual({
        accountId: 'account-c',
      });
    });

    await act(async () => {
      resolveFirstCancellation();
      await firstCancellation;
    });
    expect(queryClient.getQueryData(actorCKey)).toEqual({
      accountId: 'account-c',
    });
  });
});
