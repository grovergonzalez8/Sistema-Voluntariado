export type {
  AccountAdministrationGateway,
  AccountListQuery,
  ChangeAccountStatusCommand,
  ManageAccountRoleCommand,
} from './application/account-administration-gateway';
export { AccountAdministrationService } from './application/account-administration-service';
export type { AccountContextGateway } from './application/account-context-gateway';
export { AccountContextService } from './application/account-context-service';
export { IdentityService } from './application/identity-service';
export type { AuthGateway } from './application/auth-gateway';
export type {
  CreateInvitationCommand,
  InvitationAdministrationGateway,
  InvitationIdempotentCommand,
  RecoverInvitationCommand,
  RevokeInvitationCommand,
} from './application/invitation-administration-gateway';
export { InvitationAdministrationService } from './application/invitation-administration-service';
export type {
  InvitationAcceptanceResult,
  OnboardingGateway,
} from './application/onboarding-gateway';
export { OnboardingService } from './application/onboarding-service';
export type {
  AccountContext,
  AccountDetail,
  AccountStatusHistoryEntry,
  AccountSummary,
  AuditEntry,
  InvitationCommandResult,
  InvitationSummary,
  OnboardingCompletion,
  RoleSummary,
} from './domain/account-administration';
export {
  accountStatuses,
  createAccountTransition,
  hasOperationalAccess,
  isAccountStatus,
  isBlockedAccountStatus,
  normalizeAdministrativeReason,
  requiresOnboarding,
} from './domain/account-lifecycle';
export type {
  AccountStatus,
  AccountTransition,
} from './domain/account-lifecycle';
export type {
  AuthenticatedUser,
  SignInCredentials,
} from './domain/authenticated-user';
export {
  createCanonicalInvitationRequest,
  createInvitationFingerprintSource,
  createInvitationTransition,
  getEffectiveInvitationStatus,
  getInvitationAcceptanceError,
  invitationStatuses,
  isInvitationStatus,
  isOpenInvitationStatus,
  normalizeEmail,
} from './domain/invitation';
export type {
  CanonicalInvitationRequest,
  InvitationState,
  InvitationStatus,
  InvitationTransition,
  PreferredLocale,
} from './domain/invitation';
export { createOnboardingCompletionRequest } from './domain/onboarding';
export type {
  OnboardingCompletionInput,
  OnboardingCompletionRequest,
} from './domain/onboarding';
export { authorizeRoleMutation } from './domain/role-grant-policy';
export type {
  RoleGrantPolicyDecision,
  RoleMutationOperation,
} from './domain/role-grant-policy';
export { SupabaseAuthGateway } from './infrastructure/supabase-auth-gateway';
export { SupabaseAccountAdministrationGateway } from './infrastructure/supabase-account-administration-gateway';
export { SupabaseAccountContextGateway } from './infrastructure/supabase-account-context-gateway';
export { SupabaseInvitationAdministrationGateway } from './infrastructure/supabase-invitation-administration-gateway';
export { SupabaseOnboardingGateway } from './infrastructure/supabase-onboarding-gateway';
export { IdentityProvider } from './presentation/identity-provider';
export {
  accountContextQueryRoot,
  getAccountContextQueryKey,
  isAccountContextQueryForActor,
} from './presentation/account-context-query';
export {
  IdentityContext,
  type IdentityAccessState,
  type IdentityContextValue,
} from './presentation/identity-context';
export {
  AccountBlockedPage,
  AuthorityLoadingPage,
  AuthorityRecoveryPage,
  ForbiddenAccessPage,
  OperationalAccountRoute,
  PermissionRoute,
} from './presentation/account-access-route';
export { AccountDetailPage } from './presentation/account-detail-page';
export { AccountsPage } from './presentation/accounts-page';
export { AuthCallbackPage } from './presentation/auth-callback-page';
export { CompleteProfilePage } from './presentation/complete-profile-page';
export { InvitationAcceptancePage } from './presentation/invitation-acceptance-page';
export { InvitationDetailPage } from './presentation/invitation-detail-page';
export { InvitationsPage } from './presentation/invitations-page';
export { LoginPage } from './presentation/login-page';
export { ProtectedRoute } from './presentation/protected-route';
export { useIdentity } from './presentation/identity-context';
