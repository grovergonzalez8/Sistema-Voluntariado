export { IdentityService } from './application/identity-service';
export type { AuthGateway } from './application/auth-gateway';
export type {
  AuthenticatedUser,
  SignInCredentials,
} from './domain/authenticated-user';
export { SupabaseAuthGateway } from './infrastructure/supabase-auth-gateway';
export { IdentityProvider } from './presentation/identity-provider';
export { LoginPage } from './presentation/login-page';
export { ProtectedRoute } from './presentation/protected-route';
export { useIdentity } from './presentation/identity-context';
