import type { QueryKey } from '@tanstack/react-query';

export const accountContextQueryRoot = ['identity', 'account-context'] as const;

export const getAccountContextQueryKey = (actorId: string) =>
  [...accountContextQueryRoot, actorId] as const;

export function isAccountContextQueryForActor(
  queryKey: QueryKey,
  actorId: string,
): boolean {
  const expected = getAccountContextQueryKey(actorId);
  return expected.every((value, index) => queryKey[index] === value);
}
