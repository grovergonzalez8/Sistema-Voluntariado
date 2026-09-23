import {
  failure,
  success,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type { ProjectActivityAttendanceGateway } from '../application/project-activity-attendance-gateway';
import type {
  ProjectActivityAttendance,
  ProjectActivityAttendanceStatus,
} from '../domain/project-activity-attendance';

interface SupabaseErrorLike {
  readonly message: string;
}

const attendanceRowSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  participation_id: z.uuid(),
  status: z.enum(['present', 'absent']),
  updated_at: z.iso.datetime({ offset: true }),
});

const errorCodes: Readonly<Record<string, AppErrorCode>> = {
  invalid_project_activity_attendance_status: 'validation',
  permission_denied: 'forbidden',
  project_activity_attendance_already_recorded: 'attendance-stale',
  project_activity_attendance_status_conflict: 'attendance-stale',
  project_activity_not_completed: 'conflict',
  project_activity_not_found: 'not-found',
  project_activity_participation_not_found: 'not-found',
  project_closed: 'conflict',
  project_not_found: 'not-found',
};

const specificMessages: Readonly<Record<string, string>> = {
  invalid_project_activity_attendance_status:
    'El estado de asistencia solicitado no es válido.',
  project_activity_attendance_already_recorded:
    'La asistencia cambió desde la última lectura.',
  project_activity_attendance_status_conflict:
    'La asistencia cambió desde la última lectura.',
  project_activity_not_completed:
    'La asistencia solo puede registrarse en una actividad completada.',
  project_activity_not_found: 'No se encontró la actividad solicitada.',
  project_activity_participation_not_found:
    'No se encontró la participación solicitada.',
  project_closed: 'El proyecto cerrado conserva la asistencia como historial.',
  project_not_found: 'No se encontró el proyecto solicitado.',
};

function gatewayFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = errorCodes[error.message] ?? 'unexpected';
  const message =
    specificMessages[error.message] ??
    (code === 'forbidden'
      ? 'No tienes permiso para gestionar la asistencia.'
      : 'No fue posible completar la operación de asistencia.');
  return failure({ code, message });
}

function invalidOutput<T>(): Result<T> {
  return failure({
    code: 'unexpected',
    message: 'El servidor devolvió una asistencia no válida.',
  });
}

function mapAttendance(value: unknown): Result<ProjectActivityAttendance> {
  const parsed = attendanceRowSchema.safeParse(value);
  if (!parsed.success) return invalidOutput();
  return success({
    createdAt: parsed.data.created_at,
    participationId: parsed.data.participation_id,
    status: parsed.data.status,
    updatedAt: parsed.data.updated_at,
  });
}

function mapAttendanceList(
  value: unknown,
): Result<readonly ProjectActivityAttendance[]> {
  const parsed = z.array(attendanceRowSchema).safeParse(value);
  if (!parsed.success) return invalidOutput();
  const attendances: ProjectActivityAttendance[] = [];
  for (const row of parsed.data) {
    attendances.push({
      createdAt: row.created_at,
      participationId: row.participation_id,
      status: row.status,
      updatedAt: row.updated_at,
    });
  }
  return success(attendances);
}

function mapAttendanceMutation(
  value: unknown,
): Result<ProjectActivityAttendance> {
  const parsed = z.array(attendanceRowSchema).length(1).safeParse(value);
  return parsed.success ? mapAttendance(parsed.data[0]) : invalidOutput();
}

export class SupabaseProjectActivityAttendanceGateway implements ProjectActivityAttendanceGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async listAttendances(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityAttendance[]>> {
    const { data, error } = await this.client.rpc(
      'list_project_activity_attendances',
      {
        requested_activity_id: activityId,
        requested_project_id: projectId,
      },
    );
    return error ? gatewayFailure(error) : mapAttendanceList(data);
  }

  public async setAttendance(
    projectId: string,
    activityId: string,
    participationId: string,
    expectedStatus: ProjectActivityAttendanceStatus | null,
    status: ProjectActivityAttendanceStatus,
  ): Promise<Result<ProjectActivityAttendance>> {
    const { data, error } = await this.client.rpc(
      'set_project_activity_attendance',
      {
        expected_status: expectedStatus,
        requested_activity_id: activityId,
        requested_participation_id: participationId,
        requested_project_id: projectId,
        requested_status: status,
      },
    );
    if (error) return gatewayFailure(error);
    return mapAttendanceMutation(data);
  }
}
