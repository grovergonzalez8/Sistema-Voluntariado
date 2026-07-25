import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  AppResultError,
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type { AccountContextService } from '../application/account-context-service';
import type { IdentityService } from '../application/identity-service';
import type { AccountContext } from '../domain/account-administration';
import type { AuthenticatedUser } from '../domain/authenticated-user';
import { getAccountContextQueryKey } from './account-context-query';
import {
  IdentityContext,
  type IdentityAccessState,
  type IdentityContextValue,
} from './identity-context';

interface IdentityProviderProps extends PropsWithChildren {
  readonly accountService: AccountContextService;
  readonly service: IdentityService;
}

const disabledAccountContextKey = [
  'identity',
  'account-context',
  'unauthenticated',
] as const;

function accessForAccount(account: AccountContext): IdentityAccessState {
  switch (account.status) {
    case 'active':
      return { account, kind: 'active' };
    case 'archived':
      return { account, kind: 'archived' };
    case 'invited':
      return { account, kind: 'invited' };
    case 'pending_profile':
      return { account, kind: 'pending-profile' };
    case 'suspended':
      return { account, kind: 'suspended' };
  }
}

export function IdentityProvider({
  accountService,
  children,
  service,
}: IdentityProviderProps) {
  const queryClient = useQueryClient();
  const [userState, setUserState] = useState<
    AuthenticatedUser | null | undefined
  >(undefined);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const authEventGeneration = useRef(0);
  const actorId = useRef<string | null>(null);
  const currentActorId = userState?.id ?? null;

  const loadAccountContext = useCallback(async () => {
    const result = await accountService.getCurrentAccountContext();
    if (!result.ok) throw new AppResultError(result.error);
    return result.value;
  }, [accountService]);

  const accountQuery = useQuery<AccountContext | null, AppResultError>({
    enabled: currentActorId !== null,
    gcTime: 5 * 60_000,
    queryFn: loadAccountContext,
    queryKey: currentActorId
      ? getAccountContextQueryKey(currentActorId)
      : disabledAccountContextKey,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    retry: 1,
    staleTime: 0,
  });

  const removeActorAuthority = useCallback(
    (previousActorId: string) => {
      const queryKey = getAccountContextQueryKey(previousActorId);
      void queryClient.cancelQueries({ exact: true, queryKey }).finally(() => {
        queryClient.removeQueries({ exact: true, queryKey });
      });
    },
    [queryClient],
  );

  const applyActor = useCallback(
    (nextUser: AuthenticatedUser | null): boolean => {
      const nextActorId = nextUser?.id ?? null;
      const previousActorId = actorId.current;
      if (previousActorId === nextActorId) {
        setUserState(nextUser);
        setSessionError(null);
        return false;
      }

      actorId.current = nextActorId;
      if (previousActorId) removeActorAuthority(previousActorId);
      setUserState(nextUser);
      setSessionError(null);
      return true;
    },
    [removeActorAuthority],
  );

  const fetchAccountContextFor = useCallback(
    async (
      requestedActorId: string,
    ): Promise<Result<AccountContext | null>> => {
      try {
        const account = await queryClient.fetchQuery({
          queryFn: loadAccountContext,
          queryKey: getAccountContextQueryKey(requestedActorId),
          staleTime: 0,
        });
        return success(account);
      } catch (error) {
        return error instanceof AppResultError
          ? failure(error.appError)
          : failure({
              code: 'unexpected',
              message: 'No fue posible verificar la autoridad actual.',
            });
      }
    },
    [loadAccountContext, queryClient],
  );

  const refreshAccountContext = useCallback(async () => {
    const requestedActorId = actorId.current;
    if (!requestedActorId) {
      return failure({
        code: 'unauthenticated',
        message: 'Debes iniciar sesión.',
      });
    }
    return fetchAccountContextFor(requestedActorId);
  }, [fetchAccountContextFor]);

  const signIn = useCallback<IdentityContextValue['signIn']>(
    async (credentials) => {
      const generation = authEventGeneration.current;
      const result = await service.signIn(credentials);
      if (generation !== authEventGeneration.current) return result;
      if (!result.ok) {
        setSessionError(result.error.message);
        return result;
      }

      applyActor(result.value);
      await fetchAccountContextFor(result.value.id);
      return result;
    },
    [applyActor, fetchAccountContextFor, service],
  );

  const signOut = useCallback<IdentityContextValue['signOut']>(async () => {
    const generation = authEventGeneration.current;
    const result = await service.signOut();
    if (generation !== authEventGeneration.current) return result;
    if (result.ok) applyActor(null);
    else setSessionError(result.error.message);
    return result;
  }, [applyActor, service]);

  useEffect(() => {
    let active = true;
    const initialGeneration = authEventGeneration.current;
    const unsubscribe = service.onAuthStateChange((change) => {
      if (!active) return;
      authEventGeneration.current += 1;
      if (change.event === 'signed-out' || !change.user) {
        applyActor(null);
        return;
      }

      const changedActor = applyActor(change.user);
      if (!changedActor) {
        void queryClient.invalidateQueries({
          exact: true,
          queryKey: getAccountContextQueryKey(change.user.id),
          refetchType: 'active',
        });
      }
    });

    void service.getCurrentUser().then((result) => {
      if (!active || authEventGeneration.current !== initialGeneration) return;
      if (result.ok) {
        applyActor(result.value);
      } else {
        actorId.current = null;
        setUserState(null);
        setSessionError(result.error.message);
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [applyActor, queryClient, service]);

  useEffect(() => {
    if (accountQuery.error?.appError.code === 'unauthenticated') {
      applyActor(null);
    }
  }, [accountQuery.error, applyActor]);

  const account = currentActorId ? (accountQuery.data ?? null) : null;

  const access = useMemo<IdentityAccessState>(() => {
    if (userState === undefined) return { kind: 'initializing' };
    if (!userState) {
      return sessionError
        ? {
            account: null,
            kind: 'recoverable-error',
            message: sessionError,
          }
        : { kind: 'unauthenticated' };
    }
    if (accountQuery.error) {
      return accountQuery.error.appError.code === 'unauthenticated'
        ? { kind: 'unauthenticated' }
        : {
            account,
            kind: 'recoverable-error',
            message: accountQuery.error.appError.message,
          };
    }
    if (accountQuery.isPending) {
      return { account, kind: 'loading-authority' };
    }
    if (!account) return { kind: 'forbidden' };
    if (accountQuery.isFetching) {
      return { account, kind: 'loading-authority' };
    }
    return accessForAccount(account);
  }, [
    account,
    accountQuery.error,
    accountQuery.isFetching,
    accountQuery.isPending,
    sessionError,
    userState,
  ]);

  const value = useMemo<IdentityContextValue>(
    () => ({
      access,
      account,
      refreshAccountContext,
      signIn,
      signOut,
      user: userState ?? null,
    }),
    [access, account, refreshAccountContext, signIn, signOut, userState],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}
