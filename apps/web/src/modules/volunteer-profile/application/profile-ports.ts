import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { Profile, ProfileUpdate } from '../domain/profile';

export interface CurrentActorPort {
  getCurrentUserId(): Promise<Result<string>>;
}

export interface ProfileRepository {
  getByUserId(userId: string): Promise<Result<Profile | null>>;
  updateByUserId(
    userId: string,
    update: ProfileUpdate,
  ): Promise<Result<Profile>>;
}
