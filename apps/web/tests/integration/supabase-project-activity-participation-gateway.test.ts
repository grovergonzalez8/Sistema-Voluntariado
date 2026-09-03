import { createClient } from '@supabase/supabase-js';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { SupabaseProjectActivityParticipationGateway } from '../../src/modules/projects';
import type { Database } from '../../src/shared/infrastructure/supabase/database.types';

const apiUrl = 'http://127.0.0.1:54321';
const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const volunteerId = '30000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
const participationRow = {
  activity_id: activityId,
  created_at: '2026-09-02T14:00:00.000Z',
  ended_at: null,
  participation_id: participationId,
  started_at: '2026-09-02T14:00:00.000Z',
  updated_at: '2026-09-02T14:00:00.000Z',
  volunteer_id: volunteerId,
  volunteer_name: 'Ana Volunteer',
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

const createGateway = () =>
  new SupabaseProjectActivityParticipationGateway(
    createClient<Database>(apiUrl, 'local-test-not-a-secret', {
      auth: { persistSession: false },
    }),
  );

describe('SupabaseProjectActivityParticipationGateway integration', () => {
  it('uses the RPC transport and maps the minimum candidate projection', async () => {
    let receivedBody: unknown;
    server.use(
      http.post(
        `${apiUrl}/rest/v1/rpc/search_project_activity_volunteer_candidates`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json([
            { volunteer_id: volunteerId, volunteer_name: 'Ana Volunteer' },
          ]);
        },
      ),
    );

    const result = await createGateway().searchEligibleCandidates(
      projectId,
      activityId,
      'Ana',
    );

    expect(receivedBody).toEqual({
      requested_activity_id: activityId,
      requested_limit: 20,
      requested_project_id: projectId,
      requested_query: 'Ana',
    });
    expect(result).toEqual({
      ok: true,
      value: [{ volunteerId, volunteerName: 'Ana Volunteer' }],
    });
  });

  it('sends only technical ids when creating participation', async () => {
    let receivedBody: unknown;
    server.use(
      http.post(
        `${apiUrl}/rest/v1/rpc/create_project_activity_participation`,
        async ({ request }) => {
          receivedBody = await request.json();
          return HttpResponse.json([participationRow]);
        },
      ),
    );

    const result = await createGateway().createParticipation(
      projectId,
      activityId,
      volunteerId,
    );

    expect(receivedBody).toEqual({
      requested_activity_id: activityId,
      requested_project_id: projectId,
      requested_volunteer_id: volunteerId,
    });
    expect(result).toMatchObject({
      ok: true,
      value: { participationId, volunteerId, volunteerName: 'Ana Volunteer' },
    });
  });
});
