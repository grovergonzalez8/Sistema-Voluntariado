import { describe, expect, it } from 'vitest';

import {
  canTransitionProjectActivity,
  isScheduledProjectActivity,
  isTerminalProjectActivity,
  validateProjectActivityInput,
} from './project-activity';

const validInput = {
  description: '\t Jornada \n comunitaria\u00a0',
  endsAt: '2026-08-26T12:00:00-04:00',
  locationText: '\t Centro \n vecinal\t',
  name: '\t Limpieza \n del parque\t',
  startsAt: '2026-08-26T10:00:00-04:00',
};

describe('project activity domain', () => {
  it('normalizes content and stores instants without a custom timezone', () => {
    expect(validateProjectActivityInput(validInput)).toEqual({
      ok: true,
      value: {
        description: 'Jornada comunitaria',
        endsAt: '2026-08-26T16:00:00.000Z',
        locationText: 'Centro vecinal',
        name: 'Limpieza del parque',
        startsAt: '2026-08-26T14:00:00.000Z',
      },
    });
  });

  it('normalizes optional blank values to null and permits equal instants', () => {
    expect(
      validateProjectActivityInput({
        ...validInput,
        description: '   ',
        endsAt: '2026-08-26T14:00:00Z',
        locationText: '\n\t',
        startsAt: '2026-08-26T10:00:00-04:00',
      }),
    ).toEqual({
      ok: true,
      value: {
        description: null,
        endsAt: '2026-08-26T14:00:00.000Z',
        locationText: null,
        name: 'Limpieza del parque',
        startsAt: '2026-08-26T14:00:00.000Z',
      },
    });
  });

  it('enforces limits by Unicode code points like PostgreSQL char_length', () => {
    expect(
      validateProjectActivityInput({
        ...validInput,
        description: 'x'.repeat(1001),
        locationText: 'x'.repeat(201),
        name: '😀'.repeat(120),
      }),
    ).toMatchObject({
      errors: {
        description: 'La descripción no puede superar 1.000 caracteres.',
        locationText: 'La ubicación no puede superar 200 caracteres.',
      },
      ok: false,
    });
    expect(
      validateProjectActivityInput({ ...validInput, name: '😀'.repeat(121) }),
    ).toEqual({
      errors: { name: 'Escribe un nombre de 1 a 120 caracteres.' },
      ok: false,
    });
  });

  it('rejects missing or invalid starts and an end before start', () => {
    expect(
      validateProjectActivityInput({
        ...validInput,
        endsAt: '2026-08-26T09:59:59Z',
        name: ' ',
        startsAt: '2026-08-26T10:00:00Z',
      }),
    ).toEqual({
      errors: {
        endsAt: 'La fecha de fin no puede ser anterior al inicio.',
        name: 'Escribe un nombre de 1 a 120 caracteres.',
      },
      ok: false,
    });
    expect(
      validateProjectActivityInput({
        ...validInput,
        endsAt: 'not-a-date',
        startsAt: '',
      }),
    ).toEqual({
      errors: {
        endsAt: 'Indica una fecha y hora de fin válidas.',
        startsAt: 'Indica una fecha y hora de inicio válidas.',
      },
      ok: false,
    });
  });

  it('requires explicit offsets and rejects invalid calendar values', () => {
    for (const startsAt of [
      '2026-08-27',
      '2026-08-27T10:00',
      '2026-02-30T10:00:00Z',
      '2026-08-27T24:00:00Z',
      '2026-08-27T10:00:00+14:01',
      '2026-08-27T10:00:00+15:00',
      '0000-01-01T00:00:00Z',
      '0001-01-01T00:00:00+14:00',
      '9999-12-31T23:59:59-14:00',
    ]) {
      expect(
        validateProjectActivityInput({ ...validInput, startsAt }),
      ).toMatchObject({
        errors: {
          startsAt: 'Indica una fecha y hora de inicio válidas.',
        },
        ok: false,
      });
    }
  });

  it('permits only scheduled to terminal transitions', () => {
    expect(canTransitionProjectActivity('scheduled', 'completed')).toBe(true);
    expect(canTransitionProjectActivity('scheduled', 'cancelled')).toBe(true);
    expect(canTransitionProjectActivity('scheduled', 'scheduled')).toBe(false);
    expect(canTransitionProjectActivity('completed', 'cancelled')).toBe(false);
    expect(canTransitionProjectActivity('cancelled', 'completed')).toBe(false);
    expect(isScheduledProjectActivity({ status: 'scheduled' })).toBe(true);
    expect(isTerminalProjectActivity({ status: 'completed' })).toBe(true);
    expect(isTerminalProjectActivity({ status: 'cancelled' })).toBe(true);
  });
});
