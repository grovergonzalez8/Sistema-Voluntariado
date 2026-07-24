import { describe, expect, it } from 'vitest';

import { createProfileUpdate } from './profile';

describe('createProfileUpdate', () => {
  it('normalizes an allowed profile update', () => {
    const result = createProfileUpdate({
      displayName: '  Perfil   local  ',
      preferredLocale: 'es',
    });

    expect(result).toEqual({
      ok: true,
      value: { displayName: 'Perfil local', preferredLocale: 'es' },
    });
  });

  it('rejects unknown locales and empty names', () => {
    expect(
      createProfileUpdate({ displayName: '   ', preferredLocale: 'fr' }),
    ).toMatchObject({
      error: { code: 'validation' },
      ok: false,
    });
  });
});
