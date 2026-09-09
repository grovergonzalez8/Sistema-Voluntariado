import { success, type Result } from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type {
  InvitationAcceptanceResult,
  OnboardingGateway,
} from '../application/onboarding-gateway';
import type { OnboardingCompletion } from '../domain/account-administration';
import type { OnboardingCompletionRequest } from '../domain/onboarding';
import { supabaseFailure, unknownFailure } from './supabase-gateway-result';

export class SupabaseOnboardingGateway implements OnboardingGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async acceptCurrentInvitation(
    acceptanceChallenge: string,
  ): Promise<Result<InvitationAcceptanceResult>> {
    const { data, error } = await this.client.rpc(
      'accept_current_account_invitation_v3',
      { requested_acceptance_challenge: acceptanceChallenge },
    );
    if (error) return supabaseFailure(error);
    const row = data[0];
    return row
      ? success({ accountId: row.account_id, status: 'pending_profile' })
      : unknownFailure();
  }

  public async completeProfileAndActivate(
    input: Omit<OnboardingCompletionRequest, 'password'>,
  ): Promise<Result<OnboardingCompletion>> {
    const { data, error } = await this.client.rpc(
      'complete_current_account_profile_v2',
      {
        requested_display_name: input.displayName,
        requested_locale: input.preferredLocale,
      },
    );
    if (error) return supabaseFailure(error);
    const row = data[0];
    return row
      ? success({ accountId: row.account_id, status: 'active' })
      : unknownFailure();
  }

  public async updatePassword(password: string): Promise<Result<void>> {
    const { error } = await this.client.auth.updateUser({ password });
    return error ? supabaseFailure(error) : success(undefined);
  }
}
