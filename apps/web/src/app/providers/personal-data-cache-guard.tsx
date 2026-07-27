import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';

import {
  isAccountContextQueryForActor,
  useIdentity,
} from '../../modules/identity';

export function PersonalDataCacheGuard({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { account, user } = useIdentity();
  const previousActorId = useRef<string | null>(null);
  const previousAuthority = useRef<string | null>(null);
  const cleanupGeneration = useRef(0);
  const actorId = user?.id ?? null;
  const authority = account
    ? `${account.accountId}:${account.authorityVersion}:${account.status}`
    : null;

  useEffect(() => {
    const generation = ++cleanupGeneration.current;
    const previous = previousActorId.current;

    const actorChanged = Boolean(previous && previous !== actorId);
    const authorityChanged = Boolean(
      previousAuthority.current && previousAuthority.current !== authority,
    );

    if (actorChanged || authorityChanged) {
      const shouldRemove = (queryKey: readonly unknown[]) =>
        !actorId || !isAccountContextQueryForActor(queryKey, actorId);
      void queryClient
        .cancelQueries({ predicate: (query) => shouldRemove(query.queryKey) })
        .finally(() => {
          if (cleanupGeneration.current !== generation) return;
          queryClient.removeQueries({
            predicate: (query) => shouldRemove(query.queryKey),
          });
        });
      queryClient.getMutationCache().clear();
    }

    previousActorId.current = actorId;
    previousAuthority.current = authority;

    return () => {
      if (cleanupGeneration.current === generation) {
        cleanupGeneration.current += 1;
      }
    };
  }, [actorId, authority, queryClient]);

  return children;
}
