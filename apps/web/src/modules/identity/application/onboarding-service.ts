import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { OnboardingCompletion } from '../domain/account-administration';
import {
  createOnboardingCompletionRequest,
  type OnboardingCompletionInput,
} from '../domain/onboarding';
import type {
  InvitationAcceptanceResult,
  OnboardingGateway,
} from './onboarding-gateway';

export class OnboardingService {
  public constructor(private readonly gateway: OnboardingGateway) {}

  public acceptCurrentInvitation(): Promise<
    Result<InvitationAcceptanceResult>
  > {
    return this.gateway.acceptCurrentInvitation();
  }

  public async completeProfile(
    input: OnboardingCompletionInput,
  ): Promise<Result<OnboardingCompletion>> {
    const request = createOnboardingCompletionRequest(input);
    if (!request.ok) {
      return request;
    }

    const password = await this.gateway.updatePassword(request.value.password);
    if (!password.ok) {
      return password;
    }

    return this.gateway.completeProfileAndActivate({
      displayName: request.value.displayName,
      preferredLocale: request.value.preferredLocale,
    });
  }
}
