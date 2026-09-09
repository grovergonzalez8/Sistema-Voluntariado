import { useCallback, useRef, useState } from 'react';

import type { IdentityContextValue } from './identity-context';

export type SessionCleanupStatus = 'idle' | 'pending' | 'failed';

export function useSessionCleanup(signOut: IdentityContextValue['signOut']) {
  const [status, setStatus] = useState<SessionCleanupStatus>('idle');
  const inFlight = useRef(false);
  const onSuccess = useRef<(() => void) | null>(null);

  const attempt = useCallback(async () => {
    if (inFlight.current || !onSuccess.current) return;

    inFlight.current = true;
    setStatus('pending');
    try {
      const result = await signOut();
      if (!result.ok) {
        setStatus('failed');
        return;
      }
      onSuccess.current();
    } catch {
      setStatus('failed');
    } finally {
      inFlight.current = false;
    }
  }, [signOut]);

  const start = useCallback(
    (nextOnSuccess: () => void) => {
      if (onSuccess.current) return;
      onSuccess.current = nextOnSuccess;
      void attempt();
    },
    [attempt],
  );

  const retry = useCallback(() => {
    void attempt();
  }, [attempt]);

  return { retry, start, status } as const;
}
