import { describe, expect, it } from 'vitest';

import {
  getProjectActivityStatusTone,
  getProjectStatusTone,
} from './project-status-badge-tone';

describe('project status badge tones', () => {
  it('maps project lifecycle states without changing their meaning', () => {
    expect(getProjectStatusTone('active')).toBe('success');
    expect(getProjectStatusTone('closed')).toBe('neutral');
  });

  it('distinguishes scheduled, completed and cancelled activities', () => {
    expect(getProjectActivityStatusTone('scheduled')).toBe('info');
    expect(getProjectActivityStatusTone('completed')).toBe('success');
    expect(getProjectActivityStatusTone('cancelled')).toBe('danger');
  });
});
