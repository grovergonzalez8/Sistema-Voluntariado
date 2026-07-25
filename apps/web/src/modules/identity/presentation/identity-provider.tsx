import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import type { AccountContextService } from '../application/account-context-service';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import type { AccountContext } from '../domain/account-administration';
import type { IdentityService } from '../application/identity-service';
import { IdentityContext, type IdentityContextValue } from './identity-context';

interface IdentityProviderProps extends PropsWithChildren {
  readonly accountService: AccountContextService;
  readonly service: IdentityService;
}

export function IdentityProvider({
  accountService,
  children,
  service,
}: IdentityProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [account, setAccount] = useState<AccountContext | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);
  const actorGeneration = useRef(0);
  const actorId = useRef<string | null>(null);
  const contextRequest = useRef(0);

  const refreshAccountContext = useCallback(async () => {
    const requestedActorId = actorId.current;
    const requestedGeneration = actorGeneration.current;
    const requestedContext = ++contextRequest.current;
    const result = await accountService.getCurrentAccountContext();
    if (
      requestedActorId !== actorId.current ||
      requestedGeneration !== actorGeneration.current ||
      requestedContext !== contextRequest.current
    ) {
      return result;
    }

    if (result.ok) {
      setAccount(result.value);
      setError(null);
    } else {
      setAccount(null);
      setError(result.error.message);
    }
    return result;
  }, [accountService]);

  useEffect(() => {
    let active = true;
    const initialGeneration = actorGeneration.current;
    const applyActor = (nextUser: AuthenticatedUser | null) => {
      const generation = ++actorGeneration.current;
      contextRequest.current += 1;
      actorId.current = nextUser?.id ?? null;
      setUser(nextUser);
      setAccount(null);
      setError(null);
      if (!nextUser) {
        setStatus('ready');
        return;
      }

      setStatus('loading');
      void refreshAccountContext().finally(() => {
        if (active && actorGeneration.current === generation) {
          setStatus('ready');
        }
      });
    };
    const unsubscribe = service.onAuthStateChange((nextUser) => {
      if (active) applyActor(nextUser);
    });

    void service.getCurrentUser().then((result) => {
      if (!active || actorGeneration.current !== initialGeneration) return;

      if (result.ok) {
        applyActor(result.value);
      } else {
        actorGeneration.current += 1;
        contextRequest.current += 1;
        actorId.current = null;
        setAccount(null);
        setError(result.error.message);
        setStatus('ready');
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [refreshAccountContext, service]);

  useEffect(() => {
    if (!user) return undefined;

    const refresh = () => {
      void refreshAccountContext();
    };
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    const intervalId = window.setInterval(refresh, 30_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refreshWhenVisible);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, [refreshAccountContext, user]);

  const value = useMemo<IdentityContextValue>(
    () => ({
      account,
      error,
      refreshAccountContext,
      signIn: async (credentials) => {
        const result = await service.signIn(credentials);
        if (result.ok) {
          const generation = ++actorGeneration.current;
          contextRequest.current += 1;
          actorId.current = result.value.id;
          setUser(result.value);
          setError(null);
          setStatus('loading');
          await refreshAccountContext();
          if (actorGeneration.current === generation) setStatus('ready');
        } else {
          setError(result.error.message);
        }
        return result;
      },
      signOut: async () => {
        const result = await service.signOut();
        if (result.ok) {
          actorGeneration.current += 1;
          contextRequest.current += 1;
          actorId.current = null;
          setUser(null);
          setAccount(null);
          setError(null);
        } else {
          setError(result.error.message);
        }
        return result;
      },
      status,
      user,
    }),
    [account, error, refreshAccountContext, service, status, user],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
