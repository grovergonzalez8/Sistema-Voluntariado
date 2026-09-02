import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseProjectActivityParticipationGateway } from './supabase-project-activity-participation-gateway';

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

describe('SupabaseProjectActivityParticipationGateway', () => {
  it('maps validated participation output and exact create signature', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({ data: [participationRow], error: null }),
    );
    const gateway = new SupabaseProjectActivityParticipationGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    expect(
      await gateway.createParticipation(projectId, activityId, volunteerId),
    ).toEqual({
      ok: true,
      value: {
        activityId,
        createdAt: participationRow.created_at,
        endedAt: null,
        participationId,
        startedAt: participationRow.started_at,
        updatedAt: participationRow.updated_at,
        volunteerId,
        volunteerName: 'Ana Volunteer',
      },
    });
    expect(rpc).toHaveBeenCalledWith('create_project_activity_participation', {
      requested_activity_id: activityId,
      requested_project_id: projectId,
      requested_volunteer_id: volunteerId,
    });
  });

  it('calls list candidates and finish with bounded RPC parameters', async () => {
    const rpc = vi.fn((operation: string) =>
      Promise.resolve({
        data:
          operation === 'search_project_activity_volunteer_candidates'
            ? [{ volunteer_id: volunteerId, volunteer_name: 'Ana Volunteer' }]
            : [participationRow],
        error: null,
      }),
    );
    const gateway = new SupabaseProjectActivityParticipationGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    expect((await gateway.listParticipations(projectId, activityId)).ok).toBe(
      true,
    );
    expect(
      (await gateway.searchEligibleCandidates(projectId, activityId, 'Ana')).ok,
    ).toBe(true);
    expect(
      (
        await gateway.finishParticipation(
          projectId,
          activityId,
          participationId,
        )
      ).ok,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith(
      'search_project_activity_volunteer_candidates',
      {
        requested_activity_id: activityId,
        requested_limit: 20,
        requested_project_id: projectId,
        requested_query: 'Ana',
      },
    );
    expect(rpc).toHaveBeenCalledWith('finish_project_activity_participation', {
      requested_activity_id: activityId,
      requested_participation_id: participationId,
      requested_project_id: projectId,
    });
  });

  it.each([
    ['permission_denied', 'forbidden'],
    ['invalid_project_activity_volunteer_query', 'validation'],
    ['project_not_found', 'not-found'],
    ['project_activity_not_found', 'not-found'],
    ['project_activity_participation_not_found', 'not-found'],
    ['project_closed', 'conflict'],
    ['project_activity_not_scheduled', 'conflict'],
    ['volunteer_not_assigned_to_project', 'conflict'],
    ['project_activity_participation_already_active', 'conflict'],
    ['project_activity_participation_already_ended', 'conflict'],
    ['unrecognized_database_error', 'unexpected'],
  ] as const)('maps %s selectively to %s', async (message, code) => {
    const gateway = new SupabaseProjectActivityParticipationGateway({
      rpc: () => Promise.resolve({ data: null, error: { message } }),
    } as unknown as SupabaseClient<Database>);

    expect(
      await gateway.listParticipations(projectId, activityId),
    ).toMatchObject({ error: { code }, ok: false });
  });

  it('rejects malformed output without exposing raw database content', async () => {
    const gateway = new SupabaseProjectActivityParticipationGateway({
      rpc: () =>
        Promise.resolve({
          data: [{ ...participationRow, volunteer_name: '' }],
          error: null,
        }),
    } as unknown as SupabaseClient<Database>);

    expect(await gateway.listParticipations(projectId, activityId)).toEqual({
      error: {
        code: 'unexpected',
        message: 'El servidor devolvió una participación no válida.',
      },
      ok: false,
    });
  });
});
