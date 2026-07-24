import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import type { Profile } from '../domain/profile';
import {
  clearPersonalProfileQuery,
  getProfileQueryKey,
} from './profile-query-cache';

const profile = (id: string, displayName: string): Profile => ({
  createdAt: '2026-07-24T00:00:00.000Z',
  displayName,
  preferredLocale: 'es',
  updatedAt: '2026-07-24T00:00:00.000Z',
  userId: id,
});

describe('personal profile query cache', () => {
  it('isolates consecutive users and clears the previous session', () => {
    const queryClient = new QueryClient();
    const firstUserId = '00000000-0000-4000-8000-000000000001';
    const secondUserId = '00000000-0000-4000-8000-000000000002';

    queryClient.setQueryData(
      getProfileQueryKey(firstUserId),
      profile(firstUserId, 'Usuario A'),
    );

    expect(queryClient.getQueryData(getProfileQueryKey(secondUserId))).toBe(
      undefined,
    );

    queryClient.setQueryData(
      getProfileQueryKey(secondUserId),
      profile(secondUserId, 'Usuario B'),
    );
    clearPersonalProfileQuery(queryClient, firstUserId);

    expect(queryClient.getQueryData(getProfileQueryKey(firstUserId))).toBe(
      undefined,
    );
    expect(
      queryClient.getQueryData(getProfileQueryKey(secondUserId)),
    ).toMatchObject({ displayName: 'Usuario B' });
  });
});
