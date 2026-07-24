import { useEffect, useMemo, useState, type PropsWithChildren } from 'react';

import type { AuthenticatedUser } from '../domain/authenticated-user';
import type { IdentityService } from '../application/identity-service';
import { IdentityContext, type IdentityContextValue } from './identity-context';

interface IdentityProviderProps extends PropsWithChildren {
  readonly service: IdentityService;
}

export function IdentityProvider({ children, service }: IdentityProviderProps) {
  const [user, setUser] = useState<AuthenticatedUser | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready'>('loading');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    const unsubscribe = service.onAuthStateChange((nextUser) => {
      if (active) {
        setUser(nextUser);
        setStatus('ready');
        setError(null);
      }
    });

    void service.getCurrentUser().then((result) => {
      if (!active) {
        return;
      }

      if (result.ok) {
        setUser(result.value);
        setError(null);
      } else {
        setError(result.error.message);
      }
      setStatus('ready');
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  const value = useMemo<IdentityContextValue>(
    () => ({
      error,
      signIn: async (credentials) => {
        const result = await service.signIn(credentials);
        if (result.ok) {
          setUser(result.value);
          setError(null);
        } else {
          setError(result.error.message);
        }
        return result;
      },
      signOut: async () => {
        const result = await service.signOut();
        if (result.ok) {
          setUser(null);
          setError(null);
        } else {
          setError(result.error.message);
        }
        return result;
      },
      status,
      user,
    }),
    [error, service, status, user],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
