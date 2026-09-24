import type { SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import { SupabaseProjectActivityAttendanceGateway } from './supabase-project-activity-attendance-gateway';

const projectId = '10000000-0000-4000-8000-000000000001';
const activityId = '20000000-0000-4000-8000-000000000001';
const participationId = '40000000-0000-4000-8000-000000000001';
const attendanceRow = {
  created_at: '2026-09-21T14:00:00.000Z',
  participation_id: participationId,
  status: 'present' as const,
  updated_at: '2026-09-21T14:00:00.000Z',
};

function createGateway(rpc: ReturnType<typeof vi.fn>) {
  return new SupabaseProjectActivityAttendanceGateway({
    rpc,
  } as unknown as SupabaseClient<Database>);
}

describe('SupabaseProjectActivityAttendanceGateway', () => {
  it('maps list success and preserves an empty successful result', async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: [attendanceRow], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const gateway = createGateway(rpc);

    expect(await gateway.listAttendances(projectId, activityId)).toEqual({
      ok: true,
      value: [
        {
          createdAt: attendanceRow.created_at,
          participationId,
          status: 'present',
          updatedAt: attendanceRow.updated_at,
        },
      ],
    });
    expect(await gateway.listAttendances(projectId, activityId)).toEqual({
      ok: true,
      value: [],
    });
    expect(rpc).toHaveBeenCalledWith('list_project_activity_attendances', {
      requested_activity_id: activityId,
      requested_project_id: projectId,
    });
  });

  it('does not convert list failure into an empty success', async () => {
    const gateway = createGateway(
      vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'permission_denied' },
      }),
    );

    expect(await gateway.listAttendances(projectId, activityId)).toEqual({
      error: {
        code: 'forbidden',
        message: 'No tienes permiso para gestionar la asistencia.',
      },
      ok: false,
    });
  });

  it.each([
    [null, 'present'],
    ['present', 'absent'],
    ['absent', 'present'],
  ] as const)(
    'sends the exact set precondition %s',
    async (expected, status) => {
      const resultRow = { ...attendanceRow, status };
      const rpc = vi.fn().mockResolvedValue({ data: [resultRow], error: null });
      const gateway = createGateway(rpc);

      expect(
        await gateway.setAttendance(
          projectId,
          activityId,
          participationId,
          expected,
          status,
        ),
      ).toMatchObject({ ok: true, value: { status } });
      expect(rpc).toHaveBeenCalledWith('set_project_activity_attendance', {
        expected_status: expected,
        requested_activity_id: activityId,
        requested_participation_id: participationId,
        requested_project_id: projectId,
        requested_status: status,
      });
    },
  );

  it.each([
    'project_activity_attendance_status_conflict',
    'project_activity_attendance_already_recorded',
  ])('maps %s to a distinguishable stale conflict', async (message) => {
    const gateway = createGateway(
      vi.fn().mockResolvedValue({ data: null, error: { message } }),
    );

    expect(
      await gateway.setAttendance(
        projectId,
        activityId,
        participationId,
        'present',
        'absent',
      ),
    ).toMatchObject({ error: { code: 'attendance-stale' }, ok: false });
  });

  it('maps unexpected errors and malformed output without leaking payloads', async () => {
    const unexpected = createGateway(
      vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'unrecognized_database_error' },
      }),
    );
    const malformed = createGateway(
      vi.fn().mockResolvedValue({
        data: [{ ...attendanceRow, status: 'late' }],
        error: null,
      }),
    );
    const malformedContainer = createGateway(
      vi.fn().mockResolvedValue({ data: null, error: null }),
    );
    const malformedMutationCardinality = createGateway(
      vi.fn().mockResolvedValue({
        data: [attendanceRow, attendanceRow],
        error: null,
      }),
    );

    expect(
      await unexpected.listAttendances(projectId, activityId),
    ).toMatchObject({ error: { code: 'unexpected' }, ok: false });
    expect(
      await malformed.listAttendances(projectId, activityId),
    ).toMatchObject({ error: { code: 'unexpected' }, ok: false });
    expect(
      await malformedContainer.listAttendances(projectId, activityId),
    ).toMatchObject({ error: { code: 'unexpected' }, ok: false });
    expect(
      await malformedContainer.setAttendance(
        projectId,
        activityId,
        participationId,
        null,
        'present',
      ),
    ).toMatchObject({ error: { code: 'unexpected' }, ok: false });
    expect(
      await malformedMutationCardinality.setAttendance(
        projectId,
        activityId,
        participationId,
        null,
        'present',
      ),
    ).toMatchObject({ error: { code: 'unexpected' }, ok: false });
  });
});
