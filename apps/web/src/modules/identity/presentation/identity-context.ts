import { createContext, useContext } from 'react';

import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';
import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';

export interface IdentityContextValue {
  readonly account: AccountContext | null;
  readonly error: string | null;
  readonly refreshAccountContext: () => Promise<Result<AccountContext | null>>;
  readonly signIn: (
    credentials: SignInCredentials,
  ) => Promise<Result<AuthenticatedUser>>;
  readonly signOut: () => Promise<Result<void>>;
  readonly status: 'loading' | 'ready';
  readonly user: AuthenticatedUser | null;
}

export const IdentityContext = createContext<IdentityContextValue | null>(null);

export function useIdentity(): IdentityContextValue {
  const value = useContext(IdentityContext);

  if (!value) {
    throw new Error('IdentityProvider is required.');
  }

  return value;
}
