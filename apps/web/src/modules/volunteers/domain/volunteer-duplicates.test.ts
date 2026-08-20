import { describe, expect, it } from 'vitest';

import { duplicateEvidenceLabel } from './volunteer-duplicates';

describe('volunteer duplicate evidence', () => {
  it('describes exact contact matches without treating names as identity', () => {
    expect(duplicateEvidenceLabel(['email'])).toBe('correo');
    expect(duplicateEvidenceLabel(['phone'])).toBe('celular');
    expect(duplicateEvidenceLabel(['email', 'phone'])).toBe('correo y celular');
  });
});
