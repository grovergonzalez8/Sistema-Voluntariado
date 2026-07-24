import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';

export type AuthStateListener = (user: AuthenticatedUser | null) => void;

export interface AuthGateway {
  getCurrentUser(): Promise<Result<AuthenticatedUser | null>>;
  onAuthStateChange(listener: AuthStateListener): () => void;
  signIn(credentials: SignInCredentials): Promise<Result<AuthenticatedUser>>;
  signOut(): Promise<Result<void>>;
}
