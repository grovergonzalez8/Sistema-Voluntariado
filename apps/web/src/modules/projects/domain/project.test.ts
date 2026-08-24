import { describe, expect, it } from 'vitest';

import { isActiveProjectAssignment } from './project-assignment';
import { validateProjectInput } from './project';

describe('project domain', () => {
  it('canonicalizes the minimal project fields', () => {
    expect(
      validateProjectInput({
        description: '  Apoyo   comunitario ',
        name: '  Proyecto   Norte ',
      }),
    ).toEqual({
      ok: true,
      value: {
        description: 'Apoyo comunitario',
        name: 'Proyecto Norte',
      },
    });
    expect(
      validateProjectInput({ description: '   ', name: 'Proyecto' }),
    ).toEqual({
      ok: true,
      value: { description: null, name: 'Proyecto' },
    });
  });

  it('rejects fields outside the approved V1 limits', () => {
    expect(validateProjectInput({ description: '', name: '   ' })).toEqual({
      errors: { name: 'Escribe un nombre de 1 a 120 caracteres.' },
      ok: false,
    });
    expect(
      validateProjectInput({ description: 'x'.repeat(1001), name: 'Proyecto' }),
    ).toEqual({
      errors: {
        description: 'La descripción no puede superar 1.000 caracteres.',
      },
      ok: false,
    });
  });

  it('derives assignment activity only from the end timestamp', () => {
    expect(isActiveProjectAssignment({ endedAt: null })).toBe(true);
    expect(isActiveProjectAssignment({ endedAt: '2026-08-24T12:00:00Z' })).toBe(
      false,
    );
  });
});
