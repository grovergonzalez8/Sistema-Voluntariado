import { describe, expect, it } from 'vitest';

import {
  instantToLocalDateTime,
  localDateTimeToInstant,
} from './project-activity-date-time';

describe('project activity local date time conversion', () => {
  it('converts a numeric local wall time to an instant and back explicitly', () => {
    const instant = localDateTimeToInstant('2026-08-27T10:30');
    expect(instant).not.toBeNull();
    if (instant === null) throw new Error('Expected a valid local date time');
    expect(instantToLocalDateTime(instant)).toBe('2026-08-27T10:30');
  });

  it('rejects invalid or normalized calendar values', () => {
    expect(localDateTimeToInstant('')).toBeNull();
    expect(localDateTimeToInstant('08/27/2026 10:30')).toBeNull();
    expect(localDateTimeToInstant('2026-02-30T10:30')).toBeNull();
    expect(localDateTimeToInstant('2026-08-27T25:00')).toBeNull();
    expect(instantToLocalDateTime('not-an-instant')).toBe('');
  });
});
