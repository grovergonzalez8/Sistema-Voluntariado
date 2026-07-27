import type { QueryClient } from '@tanstack/react-query';

const personalProfileQueryRoot = ['profile', 'own'] as const;

export const getProfileQueryKey = (actorId: string, authorityVersion: string) =>
  [...personalProfileQueryRoot, actorId, authorityVersion] as const;

export const clearPersonalProfileQuery = (
  queryClient: QueryClient,
  actorId: string,
): void => {
  queryClient.removeQueries({
    queryKey: [...personalProfileQueryRoot, actorId],
  });
};
