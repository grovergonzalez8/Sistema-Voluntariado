import { failure, success } from '@sistema-voluntariado/shared-kernel';

import {
  AccountAdministrationService,
  AccountContextService,
  IdentityService,
  InvitationAdministrationService,
  OnboardingService,
  SupabaseAccountAdministrationGateway,
  SupabaseAccountContextGateway,
  SupabaseAuthGateway,
  SupabaseInvitationAdministrationGateway,
  SupabaseOnboardingGateway,
} from '../../modules/identity';
import {
  ProfileService,
  SupabaseProfileRepository,
  type CurrentActorPort,
} from '../../modules/volunteer-profile';
import { createSupabaseBrowserClient } from '../../shared/infrastructure/supabase/create-supabase-client';
import type { Environment } from '../config/environment';

export interface ApplicationServices {
  readonly accountAdministration: AccountAdministrationService;
  readonly accountContext: AccountContextService;
  readonly identity: IdentityService;
  readonly invitations: InvitationAdministrationService;
  readonly onboarding: OnboardingService;
  readonly profile: ProfileService;
}

export function createApplicationServices(
  environment: Environment,
): ApplicationServices {
  const supabase = createSupabaseBrowserClient(environment);
  const identity = new IdentityService(new SupabaseAuthGateway(supabase));
  const accountContext = new AccountContextService(
    new SupabaseAccountContextGateway(supabase),
  );
  const invitations = new InvitationAdministrationService(
    new SupabaseInvitationAdministrationGateway(supabase),
  );
  const onboarding = new OnboardingService(
    new SupabaseOnboardingGateway(supabase),
  );
  const accountAdministration = new AccountAdministrationService(
    new SupabaseAccountAdministrationGateway(supabase),
  );
  const currentActor: CurrentActorPort = {
    getCurrentUserId: async () => {
      const currentUser = await identity.getCurrentUser();

      if (!currentUser.ok) {
        return currentUser;
      }

      return currentUser.value
        ? success(currentUser.value.id)
        : failure({
            code: 'unauthenticated',
            message: 'Debes iniciar sesión para consultar el perfil.',
          });
    },
  };
  const profile = new ProfileService(
    currentActor,
    new SupabaseProfileRepository(supabase),
  );

  return {
    accountAdministration,
    accountContext,
    identity,
    invitations,
    onboarding,
    profile,
  };
}
