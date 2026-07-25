import { describe, expect, it } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import type { OnboardingGateway } from './onboarding-gateway';
import { OnboardingService } from './onboarding-service';

describe('OnboardingService', () => {
  it('updates Auth password before atomically completing the profile', async () => {
    const calls: string[] = [];
    const gateway: OnboardingGateway = {
      acceptCurrentInvitation: () =>
        Promise.resolve(
          success({ accountId: 'account-id', status: 'pending_profile' }),
        ),
      completeProfileAndActivate: (input) => {
        calls.push(`profile:${input.displayName}:${input.preferredLocale}`);
        return Promise.resolve(
          success({ accountId: 'account-id', status: 'active' }),
        );
      },
      updatePassword: () => {
        calls.push('password');
        return Promise.resolve(success(undefined));
      },
    };

    const result = await new OnboardingService(gateway).completeProfile({
      displayName: '  Invitada   local ',
      password: 'local-test-only',
      preferredLocale: 'es',
    });

    expect(result).toMatchObject({ ok: true });
    expect(calls).toEqual(['password', 'profile:Invitada local:es']);
  });

  it('does not call PostgreSQL when Auth password update fails', async () => {
    let profileCalls = 0;
    const gateway: OnboardingGateway = {
      acceptCurrentInvitation: () =>
        Promise.resolve(
          success({ accountId: 'account-id', status: 'pending_profile' }),
        ),
      completeProfileAndActivate: () => {
        profileCalls += 1;
        return Promise.resolve(
          success({ accountId: 'account-id', status: 'active' }),
        );
      },
      updatePassword: () =>
        Promise.resolve(
          failure({ code: 'unexpected', message: 'Auth no disponible.' }),
        ),
    };

    const result = await new OnboardingService(gateway).completeProfile({
      displayName: 'Invitada local',
      password: 'local-test-only',
      preferredLocale: 'es',
    });

    expect(result).toMatchObject({ error: { code: 'unexpected' }, ok: false });
    expect(profileCalls).toBe(0);
  });
});
