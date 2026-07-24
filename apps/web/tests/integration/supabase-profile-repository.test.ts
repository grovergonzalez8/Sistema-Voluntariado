import { createClient } from '@supabase/supabase-js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseProfileRepository } from '../../src/modules/volunteer-profile';
import type { Database } from '../../src/shared/infrastructure/supabase/database.types';

const apiUrl = 'http://127.0.0.1:54321';
const profileRow: Database['public']['Tables']['profiles']['Row'] = {
  archived_at: null,
  created_at: '2026-07-23T00:00:00.000Z',
  display_name: 'Perfil local',
  id: '00000000-0000-4000-8000-000000000001',
  preferred_locale: 'es',
  updated_at: '2026-07-23T00:00:00.000Z',
};

const server = setupServer();

beforeAll(() => {
  server.listen({ onUnhandledRequest: 'error' });
});
afterEach(() => {
  server.resetHandlers();
});
afterAll(() => {
  server.close();
});

const createRepository = () =>
  new SupabaseProfileRepository(
    createClient<Database>(apiUrl, 'local-test-not-a-secret', {
      auth: { persistSession: false },
    }),
  );

describe('SupabaseProfileRepository', () => {
  it('maps the selected database row into the domain profile', async () => {
    server.use(
      http.get(`${apiUrl}/rest/v1/profiles`, () =>
        HttpResponse.json(profileRow),
      ),
    );

    const result = await createRepository().getByUserId(profileRow.id);

    expect(result).toEqual({
      ok: true,
      value: {
        createdAt: profileRow.created_at,
        displayName: profileRow.display_name,
        preferredLocale: 'es',
        updatedAt: profileRow.updated_at,
        userId: profileRow.id,
      },
    });
  });

  it('sends only the two allowed fields when updating', async () => {
    let receivedBody: unknown;
    server.use(
      http.patch(`${apiUrl}/rest/v1/profiles`, async ({ request }) => {
        receivedBody = await request.json();
        return HttpResponse.json({
          ...profileRow,
          display_name: 'Nombre actualizado',
          preferred_locale: 'en',
        });
      }),
    );

    const result = await createRepository().updateByUserId(profileRow.id, {
      displayName: 'Nombre actualizado',
      preferredLocale: 'en',
    });

    expect(receivedBody).toEqual({
      display_name: 'Nombre actualizado',
      preferred_locale: 'en',
    });
    expect(result).toMatchObject({
      ok: true,
      value: { displayName: 'Nombre actualizado', preferredLocale: 'en' },
    });
  });
});
