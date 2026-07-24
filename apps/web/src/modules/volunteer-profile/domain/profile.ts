import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

export type PreferredLocale = 'en' | 'es';

export interface Profile {
  readonly createdAt: string;
  readonly displayName: string | null;
  readonly preferredLocale: PreferredLocale;
  readonly updatedAt: string;
  readonly userId: string;
}

export interface ProfileUpdateInput {
  readonly displayName: string;
  readonly preferredLocale: string;
}

export interface ProfileUpdate {
  readonly displayName: string;
  readonly preferredLocale: PreferredLocale;
}

export function createProfileUpdate(
  input: ProfileUpdateInput,
): Result<ProfileUpdate> {
  const displayName = input.displayName.trim().replace(/\s+/g, ' ');

  if (displayName.length < 1 || displayName.length > 100) {
    return failure({
      code: 'validation',
      message: 'El nombre visible debe tener entre 1 y 100 caracteres.',
    });
  }

  if (input.preferredLocale !== 'es' && input.preferredLocale !== 'en') {
    return failure({
      code: 'validation',
      message: 'El idioma seleccionado no es válido.',
    });
  }

  return success({
    displayName,
    preferredLocale: input.preferredLocale,
  });
}
