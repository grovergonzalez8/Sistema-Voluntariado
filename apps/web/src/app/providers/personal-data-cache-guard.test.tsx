import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { success } from '@sistema-voluntariado/shared-kernel';

import {
  IdentityContext,
  type IdentityContextValue,
} from '../../modules/identity';
import { PersonalDataCacheGuard } from './personal-data-cache-guard';

const identity = (
  userId: string,
  authorityVersion: string,
): IdentityContextValue => ({
  account: {
    accountId: `account-${userId}`,
    authorityVersion,
    permissions: ['profile.read_own'],
    status: 'active',
  },
  error: null,
  refreshAccountContext: () => Promise.resolve(success(null)),
  signIn: () =>
    Promise.resolve(
      success({ email: `${userId}@example.invalid`, id: userId }),
    ),
  signOut: () => Promise.resolve(success(undefined)),
  status: 'ready',
  user: { email: `${userId}@example.invalid`, id: userId },
});

describe('PersonalDataCacheGuard', () => {
  it('clears cached data when the actor or authority changes', async () => {
    const queryClient = new QueryClient();
    const clear = vi.spyOn(queryClient, 'clear');
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
      expect(clear).toHaveBeenCalledTimes(1);
    });

    view.rerender(renderTree(identity('actor-b', 'v1')));
    await waitFor(() => {
      expect(clear).toHaveBeenCalledTimes(2);
    });
  });
});
