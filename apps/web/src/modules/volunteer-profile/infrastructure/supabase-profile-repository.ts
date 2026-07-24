import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { ProfileRepository } from '../application/profile-ports';
import type { Profile, ProfileUpdate } from '../domain/profile';
import type { Database } from '../../../shared/infrastructure/supabase/database.types';

type ProfileRow = Pick<
  Database['public']['Tables']['profiles']['Row'],
  'created_at' | 'display_name' | 'id' | 'preferred_locale' | 'updated_at'
>;

const profileColumns =
  'id, display_name, preferred_locale, created_at, updated_at' as const;

const mapProfile = (row: ProfileRow): Profile => ({
  createdAt: row.created_at,
  displayName: row.display_name,
  preferredLocale: row.preferred_locale,
  updatedAt: row.updated_at,
  userId: row.id,
});

const mapDatabaseError = (code: string | undefined) =>
  code === '42501' || code === 'PGRST301'
    ? {
        code: 'forbidden' as const,
        message: 'No tienes permiso para acceder a este perfil.',
      }
    : {
        code: 'unexpected' as const,
        message: 'No fue posible completar la operación de perfil.',
      };

export class SupabaseProfileRepository implements ProfileRepository {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async getByUserId(userId: string): Promise<Result<Profile | null>> {
    const { data, error } = await this.client
      .from('profiles')
      .select(profileColumns)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      return failure(mapDatabaseError(error.code));
    }

    return success(data ? mapProfile(data) : null);
  }

  public async updateByUserId(
    userId: string,
    update: ProfileUpdate,
  ): Promise<Result<Profile>> {
    const { data, error } = await this.client
      .from('profiles')
      .update({
        display_name: update.displayName,
        preferred_locale: update.preferredLocale,
      })
      .eq('id', userId)
      .select(profileColumns)
      .maybeSingle();

    if (error) {
      return failure(mapDatabaseError(error.code));
    }

    if (!data) {
      return failure({
        code: 'forbidden',
        message: 'El perfil no está disponible para actualización.',
      });
    }

    return success(mapProfile(data));
  }
}
