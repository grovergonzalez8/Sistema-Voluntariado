import { describe, expect, it } from 'vitest';

import { failure, success } from '@sistema-voluntariado/shared-kernel';

import type { Profile } from '../domain/profile';
import type { CurrentActorPort, ProfileRepository } from './profile-ports';
import { ProfileService } from './profile-service';

const profile: Profile = {
  createdAt: '2026-07-23T00:00:00.000Z',
  displayName: 'Perfil local',
  preferredLocale: 'es',
  updatedAt: '2026-07-23T00:00:00.000Z',
  userId: 'trusted-user-id',
};

describe('ProfileService', () => {
  it('does not query a profile when there is no authenticated actor', async () => {
    let repositoryCalls = 0;
    const actor: CurrentActorPort = {
      getCurrentUserId: () =>
        Promise.resolve(
          failure({ code: 'unauthenticated', message: 'Sesión requerida.' }),
        ),
    };
    const repository: ProfileRepository = {
      getByUserId: () => {
        repositoryCalls += 1;
        return Promise.resolve(success(profile));
      },
      updateByUserId: () => Promise.resolve(success(profile)),
    };

    const result = await new ProfileService(actor, repository).getOwnProfile();

    expect(result).toMatchObject({
      error: { code: 'unauthenticated' },
      ok: false,
    });
    expect(repositoryCalls).toBe(0);
  });

  it('uses the trusted actor id and normalized allowed fields', async () => {
    let receivedUserId = '';
    let receivedName = '';
    const actor: CurrentActorPort = {
      getCurrentUserId: () => Promise.resolve(success('trusted-user-id')),
    };
    const repository: ProfileRepository = {
      getByUserId: () => Promise.resolve(success(profile)),
      updateByUserId: (userId, update) => {
        receivedUserId = userId;
        receivedName = update.displayName;
        return Promise.resolve(
          success({ ...profile, displayName: update.displayName }),
        );
      },
    };

    const result = await new ProfileService(actor, repository).updateOwnProfile(
      {
        displayName: '  Nombre   permitido ',
        preferredLocale: 'es',
      },
    );

    expect(result).toMatchObject({ ok: true });
    expect(receivedUserId).toBe('trusted-user-id');
    expect(receivedName).toBe('Nombre permitido');
  });
});
