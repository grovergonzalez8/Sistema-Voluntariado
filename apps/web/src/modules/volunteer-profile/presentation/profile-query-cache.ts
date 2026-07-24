import type { QueryClient } from '@tanstack/react-query';

const personalProfileQueryRoot = ['profile', 'own'] as const;

export const getProfileQueryKey = (actorId: string) =>
  [...personalProfileQueryRoot, actorId] as const;

export const clearPersonalProfileQuery = (
  queryClient: QueryClient,
  actorId: string,
): void => {
  queryClient.removeQueries({ queryKey: getProfileQueryKey(actorId) });
};
