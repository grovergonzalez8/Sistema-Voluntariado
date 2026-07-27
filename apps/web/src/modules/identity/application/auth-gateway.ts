import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';

export type AuthStateEvent =
  | 'initial-session'
  | 'mfa-challenge-verified'
  | 'password-recovery'
  | 'signed-in'
  | 'signed-out'
  | 'token-refreshed'
  | 'user-updated';

export interface AuthStateChange {
  readonly event: AuthStateEvent;
  readonly user: AuthenticatedUser | null;
}

export type AuthStateListener = (change: AuthStateChange) => void;

export interface AuthGateway {
  getCurrentUser(): Promise<Result<AuthenticatedUser | null>>;
  onAuthStateChange(listener: AuthStateListener): () => void;
  signIn(credentials: SignInCredentials): Promise<Result<AuthenticatedUser>>;
  signOut(): Promise<Result<void>>;
}
