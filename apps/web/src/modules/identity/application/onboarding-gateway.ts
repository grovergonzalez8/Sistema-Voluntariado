import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { OnboardingCompletion } from '../domain/account-administration';
import type { OnboardingCompletionRequest } from '../domain/onboarding';

export interface InvitationAcceptanceResult {
  readonly accountId: string;
  readonly status: 'pending_profile';
}

export interface OnboardingGateway {
  acceptCurrentInvitation(
    acceptanceChallenge: string,
  ): Promise<Result<InvitationAcceptanceResult>>;
  completeProfileAndActivate(
    input: Omit<OnboardingCompletionRequest, 'password'>,
  ): Promise<Result<OnboardingCompletion>>;
  updatePassword(password: string): Promise<Result<void>>;
}
