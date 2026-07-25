import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';

import { useIdentity } from '../../modules/identity';
import { clearPersonalProfileQuery } from '../../modules/volunteer-profile';

export function PersonalDataCacheGuard({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { account, user } = useIdentity();
  const previousActorId = useRef<string | null>(null);
  const previousAuthority = useRef<string | null>(null);
  const actorId = user?.id ?? null;
  const authority = account
    ? `${account.accountId}:${account.authorityVersion}:${account.status}`
    : null;

  useEffect(() => {
    const previous = previousActorId.current;

    if (previous && previous !== actorId) {
      void queryClient.cancelQueries();
      clearPersonalProfileQuery(queryClient, previous);
      queryClient.clear();
    } else if (
      previousAuthority.current &&
      previousAuthority.current !== authority
    ) {
      void queryClient.cancelQueries();
      queryClient.clear();
    }

    previousActorId.current = actorId;
    previousAuthority.current = authority;
  }, [actorId, authority, queryClient]);

  return children;
}
