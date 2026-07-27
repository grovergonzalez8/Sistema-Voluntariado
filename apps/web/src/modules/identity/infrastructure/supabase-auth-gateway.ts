import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type {
  AuthChangeEvent,
  SupabaseClient,
  User,
} from '@supabase/supabase-js';

import type {
  AuthGateway,
  AuthStateEvent,
  AuthStateListener,
} from '../application/auth-gateway';
import type {
  AuthenticatedUser,
  SignInCredentials,
} from '../domain/authenticated-user';

const mapUser = (user: User): AuthenticatedUser => ({
  email: user.email ?? null,
  id: user.id,
});

const authStateEvents: Readonly<Record<AuthChangeEvent, AuthStateEvent>> = {
  INITIAL_SESSION: 'initial-session',
  MFA_CHALLENGE_VERIFIED: 'mfa-challenge-verified',
  PASSWORD_RECOVERY: 'password-recovery',
  SIGNED_IN: 'signed-in',
  SIGNED_OUT: 'signed-out',
  TOKEN_REFRESHED: 'token-refreshed',
  USER_UPDATED: 'user-updated',
};

export class SupabaseAuthGateway implements AuthGateway {
  public constructor(private readonly client: SupabaseClient) {}

  public async getCurrentUser(): Promise<Result<AuthenticatedUser | null>> {
    const { data, error } = await this.client.auth.getUser();

    if (error?.name === 'AuthSessionMissingError') {
      return success(null);
    }

    if (error) {
      return failure({
        code: 'unexpected',
        message: 'No fue posible verificar la sesión actual.',
      });
    }

    return success(mapUser(data.user));
  }

  public onAuthStateChange(listener: AuthStateListener): () => void {
    const { data } = this.client.auth.onAuthStateChange((event, session) => {
      listener({
        event: authStateEvents[event],
        user: session?.user ? mapUser(session.user) : null,
      });
    });

    return () => {
      data.subscription.unsubscribe();
    };
  }

  public async signIn(
    credentials: SignInCredentials,
  ): Promise<Result<AuthenticatedUser>> {
    const { data, error } = await this.client.auth.signInWithPassword({
      email: credentials.email,
      password: credentials.password,
    });

    if (error) {
      return failure({
        code: 'unauthenticated',
        message: 'No fue posible iniciar sesión. Verifica tus credenciales.',
      });
    }

    return success(mapUser(data.user));
  }

  public async signOut(): Promise<Result<void>> {
    const { error } = await this.client.auth.signOut();

    if (error) {
      return failure({
        code: 'unexpected',
        message: 'No fue posible cerrar la sesión.',
      });
    }

    return success(undefined);
  }
}
