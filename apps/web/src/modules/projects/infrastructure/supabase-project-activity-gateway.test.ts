import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseProjectActivityGateway } from './supabase-project-activity-gateway';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const activityRow = {
  created_at: '2026-08-26T14:00:00.000Z',
  description: null,
  ends_at: null,
  id: activityId,
  location_text: 'Sede',
  name: 'Actividad V1',
  project_id: projectId,
  starts_at: '2026-08-27T14:00:00.000Z',
  status: 'scheduled' as const,
  status_changed_at: '2026-08-26T14:00:00.000Z',
  updated_at: '2026-08-26T14:00:00.000Z',
};

describe('SupabaseProjectActivityGateway', () => {
  it('maps validated activity output and sends no technical create fields', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({ data: [activityRow], error: null }),
    );
    const gateway = new SupabaseProjectActivityGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    const result = await gateway.createProjectActivity({
      description: null,
      endsAt: null,
      locationText: 'Sede',
      name: 'Actividad V1',
      projectId,
      startsAt: '2026-08-27T14:00:00.000Z',
    });

    expect(result).toEqual({
      ok: true,
      value: {
        createdAt: activityRow.created_at,
        description: null,
        endsAt: null,
        id: activityId,
        locationText: 'Sede',
        name: 'Actividad V1',
        projectId,
        startsAt: activityRow.starts_at,
        status: 'scheduled',
        statusChangedAt: activityRow.status_changed_at,
        updatedAt: activityRow.updated_at,
      },
    });
    expect(rpc).toHaveBeenCalledWith('create_project_activity', {
      requested_description: null,
      requested_ends_at: null,
      requested_location_text: 'Sede',
      requested_name: 'Actividad V1',
      requested_project_id: projectId,
      requested_starts_at: '2026-08-27T14:00:00.000Z',
    });
  });

  it('maps list, detail, update, complete and cancel RPC signatures', async () => {
    const rpc = vi.fn(() =>
      Promise.resolve({ data: [activityRow], error: null }),
    );
    const gateway = new SupabaseProjectActivityGateway({
      rpc,
    } as unknown as SupabaseClient<Database>);

    expect((await gateway.listProjectActivities(projectId)).ok).toBe(true);
    expect((await gateway.getProjectActivity(projectId, activityId)).ok).toBe(
      true,
    );
    expect(
      (
        await gateway.updateProjectActivity({
          activityId,
          description: null,
          endsAt: null,
          locationText: null,
          name: 'Editada',
          projectId,
          startsAt: activityRow.starts_at,
        })
      ).ok,
    ).toBe(true);
    expect(
      (await gateway.completeProjectActivity(projectId, activityId)).ok,
    ).toBe(true);
    expect(
      (await gateway.cancelProjectActivity(projectId, activityId)).ok,
    ).toBe(true);
    expect(rpc).toHaveBeenCalledWith('get_project_activity_detail', {
      requested_activity_id: activityId,
      requested_project_id: projectId,
    });
    expect(rpc).toHaveBeenCalledWith('complete_project_activity', {
      requested_activity_id: activityId,
      requested_project_id: projectId,
    });
    expect(rpc).toHaveBeenCalledWith('cancel_project_activity', {
      requested_activity_id: activityId,
      requested_project_id: projectId,
    });
  });

  it.each([
    ['permission_denied', 'forbidden'],
    ['invalid_project_activity', 'validation'],
    ['project_not_found', 'not-found'],
    ['project_activity_not_found', 'not-found'],
    ['project_closed', 'conflict'],
    ['project_activity_not_scheduled', 'conflict'],
    ['unrecognized_database_error', 'unexpected'],
  ] as const)('maps %s precisely to %s', async (message, code) => {
    const gateway = new SupabaseProjectActivityGateway({
      rpc: () => Promise.resolve({ data: null, error: { message } }),
    } as unknown as SupabaseClient<Database>);

    expect(await gateway.listProjectActivities(projectId)).toMatchObject({
      error: { code },
      ok: false,
    });
  });

  it('rejects malformed server output instead of leaking it to presentation', async () => {
    const gateway = new SupabaseProjectActivityGateway({
      rpc: () =>
        Promise.resolve({
          data: [{ ...activityRow, status: 'reopened' }],
          error: null,
        }),
    } as unknown as SupabaseClient<Database>);

    expect(await gateway.listProjectActivities(projectId)).toEqual({
      error: {
        code: 'unexpected',
        message: 'El servidor devolvió una actividad no válida.',
      },
      ok: false,
    });
  });
});
