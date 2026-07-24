import type { Result } from '@sistema-voluntariado/shared-kernel';

import {
  createProfileUpdate,
  type Profile,
  type ProfileUpdateInput,
} from '../domain/profile';
import type { CurrentActorPort, ProfileRepository } from './profile-ports';

export class ProfileService {
  public constructor(
    private readonly currentActor: CurrentActorPort,
    private readonly repository: ProfileRepository,
  ) {}

  public async getOwnProfile(): Promise<Result<Profile | null>> {
    const actor = await this.currentActor.getCurrentUserId();

    if (!actor.ok) {
      return actor;
    }

    return this.repository.getByUserId(actor.value);
  }

  public async updateOwnProfile(
    input: ProfileUpdateInput,
  ): Promise<Result<Profile>> {
    const update = createProfileUpdate(input);
    if (!update.ok) {
      return update;
    }

    const actor = await this.currentActor.getCurrentUserId();
    if (!actor.ok) {
      return actor;
    }

    return this.repository.updateByUserId(actor.value, update.value);
  }
}
