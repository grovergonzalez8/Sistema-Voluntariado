import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';
import type { AuthGateway, AuthStateListener } from './auth-gateway';

export class IdentityService {
  public constructor(private readonly gateway: AuthGateway) {}

  public getCurrentUser(): Promise<Result<AuthenticatedUser | null>> {
    return this.gateway.getCurrentUser();
  }

  public onAuthStateChange(listener: AuthStateListener): () => void {
    return this.gateway.onAuthStateChange(listener);
  }

  public signIn(
    credentials: SignInCredentials,
  ): Promise<Result<AuthenticatedUser>> {
    return this.gateway.signIn(credentials);
  }

  public signOut(): Promise<Result<void>> {
    return this.gateway.signOut();
  }
}
