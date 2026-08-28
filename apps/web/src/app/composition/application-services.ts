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
import {
  ProjectActivityService,
  ProjectManagementService,
  SupabaseProjectActivityGateway,
  SupabaseProjectManagementGateway,
  type ProjectAuthorizationPort,
} from '../../modules/projects';
import {
  SupabaseVolunteerRegistryGateway,
  VolunteerRegistryService,
  XlsxVolunteerWorkbookGateway,
  type VolunteerAuthorizationPort,
} from '../../modules/volunteers';
import { createSupabaseBrowserClient } from '../../shared/infrastructure/supabase/create-supabase-client';
import type { Environment } from '../config/environment';

export interface ApplicationServices {
  readonly accountAdministration: AccountAdministrationService;
  readonly accountContext: AccountContextService;
  readonly identity: IdentityService;
  readonly invitations: InvitationAdministrationService;
  readonly onboarding: OnboardingService;
  readonly profile: ProfileService;
  readonly projectActivities: ProjectActivityService;
  readonly projects: ProjectManagementService;
  readonly volunteers: VolunteerRegistryService;
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
  const volunteerAuthorization: VolunteerAuthorizationPort = {
    hasPermission: async (permission) => {
      const context = await accountContext.getCurrentAccountContext();
      if (!context.ok) return context;
      return success(
        context.value?.status === 'active' &&
          context.value.permissions.includes(permission),
      );
    },
  };
  const volunteers = new VolunteerRegistryService(
    volunteerAuthorization,
    new SupabaseVolunteerRegistryGateway(supabase),
    new XlsxVolunteerWorkbookGateway(),
  );
  const projectAuthorization: ProjectAuthorizationPort = {
    hasPermission: async (permission) => {
      const context = await accountContext.getCurrentAccountContext();
      if (!context.ok) return context;
      return success(
        context.value?.status === 'active' &&
          context.value.permissions.includes(permission),
      );
    },
  };
  const projects = new ProjectManagementService(
    projectAuthorization,
    new SupabaseProjectManagementGateway(supabase),
  );
  const projectActivities = new ProjectActivityService(
    projectAuthorization,
    new SupabaseProjectActivityGateway(supabase),
  );

  return {
    accountAdministration,
    accountContext,
    identity,
    invitations,
    onboarding,
    profile,
    projectActivities,
    projects,
    volunteers,
  };
}
