import { describe, expect, it } from 'vitest';

import { phoneMatchKey, validateVolunteerInput } from './registered-volunteer';

describe('registered volunteer validation', () => {
  it('canonicalizes the required name and optional email', () => {
    expect(
      validateVolunteerInput({
        email: '  Persona.Historica@Example.Invalid ',
        fullName: '  Ana   María  ',
        phone: '',
      }),
    ).toEqual({
      ok: true,
      value: {
        email: 'persona.historica@example.invalid',
        fullName: 'Ana María',
        phone: null,
      },
    });
  });

  it('allows a historical record without contact data', () => {
    expect(
      validateVolunteerInput({
        email: ' ',
        fullName: 'Registro histórico',
        phone: ' ',
      }).ok,
    ).toBe(true);
  });

  it.each(['', ' '.repeat(4), 'a'.repeat(101)])(
    'rejects an invalid name',
    (fullName) => {
      const result = validateVolunteerInput({
        email: '',
        fullName,
        phone: '',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.fullName).toBeDefined();
    },
  );

  it.each(['sin-arroba', 'a@b', `a@${'x'.repeat(250)}.invalid`])(
    'rejects an invalid email',
    (email) => {
      const result = validateVolunteerInput({
        email,
        fullName: 'Nombre válido',
        phone: '',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.email).toBeDefined();
    },
  );

  it('preserves international phone formatting and zeros', () => {
    const result = validateVolunteerInput({
      email: '',
      fullName: 'Nombre válido',
      phone: '  +591 (02) 001-020  ',
    });
    expect(result).toEqual({
      ok: true,
      value: {
        email: null,
        fullName: 'Nombre válido',
        phone: '+591 (02) 001-020',
      },
    });
    expect(phoneMatchKey('+591 (02) 001-020')).toBe('59102001020');
  });

  it.each(['extensión', '+()', '12#34'])(
    'rejects an invalid phone',
    (phone) => {
      const result = validateVolunteerInput({
        email: '',
        fullName: 'Nombre válido',
        phone,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.phone).toBeDefined();
    },
  );
});
