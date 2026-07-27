import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type { PreferredLocale } from './invitation';

export interface OnboardingCompletionInput {
  readonly displayName: string;
  readonly password: string;
  readonly preferredLocale: string;
}

export interface OnboardingCompletionRequest {
  readonly displayName: string;
  readonly password: string;
  readonly preferredLocale: PreferredLocale;
}

export function createOnboardingCompletionRequest(
  input: OnboardingCompletionInput,
): Result<OnboardingCompletionRequest> {
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

  if (input.password.length < 8 || input.password.length > 128) {
    return failure({
      code: 'validation',
      message: 'La contraseña debe tener entre 8 y 128 caracteres.',
    });
  }

  return success({
    displayName,
    password: input.password,
    preferredLocale: input.preferredLocale,
  });
}
