import { describe, expect, it } from 'vitest';

import { assertLocalSupabaseUrl } from './playwright-local-environment';

describe('assertLocalSupabaseUrl', () => {
  it.each([
    'http://127.0.0.1:54321',
    'http://127.0.0.1:54321/',
    'http://localhost:54321',
  ])('accepts the known local endpoint %s', (url) => {
    expect(assertLocalSupabaseUrl(url)).toMatch(/^http:\/\//u);
  });

  it.each([
    'https://project.supabase.co',
    'http://192.168.1.10:54321',
    'http://localhost:54322',
    'http://localhost:54321/rest/v1',
    'not-a-url',
  ])('rejects a non-local or malformed endpoint %s', (url) => {
    expect(() => assertLocalSupabaseUrl(url)).toThrow(/local Supabase URL/u);
  });
});
