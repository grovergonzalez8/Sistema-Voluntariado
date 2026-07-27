import { createContext, useContext } from 'react';

import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { AccountContext } from '../domain/account-administration';
import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';

export type IdentityAccessState =
  | { readonly kind: 'initializing' }
  | { readonly kind: 'unauthenticated' }
  | {
      readonly account: AccountContext | null;
      readonly kind: 'loading-authority';
    }
  | { readonly account: AccountContext; readonly kind: 'active' }
  | { readonly account: AccountContext; readonly kind: 'invited' }
  | { readonly account: AccountContext; readonly kind: 'pending-profile' }
  | { readonly account: AccountContext; readonly kind: 'suspended' }
  | { readonly account: AccountContext; readonly kind: 'archived' }
  | { readonly kind: 'forbidden' }
  | {
      readonly account: AccountContext | null;
      readonly kind: 'recoverable-error';
      readonly message: string;
    };

export interface IdentityContextValue {
  readonly access: IdentityAccessState;
  readonly account: AccountContext | null;
  readonly refreshAccountContext: () => Promise<Result<AccountContext | null>>;
  readonly signIn: (
    credentials: SignInCredentials,
  ) => Promise<Result<AuthenticatedUser>>;
  readonly signOut: () => Promise<Result<void>>;
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
