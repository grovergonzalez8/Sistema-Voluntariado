import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, type PropsWithChildren } from 'react';

import { useIdentity } from '../../modules/identity';
import { clearPersonalProfileQuery } from '../../modules/volunteer-profile';

export function PersonalDataCacheGuard({ children }: PropsWithChildren) {
  const queryClient = useQueryClient();
  const { user } = useIdentity();
  const previousActorId = useRef<string | null>(null);
  const actorId = user?.id ?? null;

  useEffect(() => {
    const previous = previousActorId.current;

    if (previous && previous !== actorId) {
      clearPersonalProfileQuery(queryClient, previous);
    }

    previousActorId.current = actorId;
  }, [actorId, queryClient]);

  return children;
}
