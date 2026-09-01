import {
  failure,
  success,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type {
  ProjectActivityCreateCommand,
  ProjectActivityGateway,
  ProjectActivityUpdateCommand,
} from '../application/project-activity-gateway';
import type { ProjectActivity } from '../domain/project-activity';

interface SupabaseErrorLike {
  readonly message: string;
}

const activityRowSchema = z.object({
  created_at: z.iso.datetime({ offset: true }),
  description: z.string().nullable(),
  ends_at: z.iso.datetime({ offset: true }).nullable(),
  id: z.uuid(),
  location_text: z.string().nullable(),
  name: z.string(),
  project_id: z.uuid(),
  starts_at: z.iso.datetime({ offset: true }),
  status: z.enum(['scheduled', 'completed', 'cancelled']),
  status_changed_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

const errorCodes: Readonly<Record<string, AppErrorCode>> = {
  invalid_project_activity: 'validation',
  permission_denied: 'forbidden',
  project_activity_not_found: 'not-found',
  project_activity_not_scheduled: 'conflict',
  project_closed: 'conflict',
  project_not_found: 'not-found',
};

const specificMessages: Readonly<Record<string, string>> = {
  invalid_project_activity: 'Revisa los datos de la actividad.',
  project_activity_not_found: 'No se encontró la actividad solicitada.',
  project_activity_not_scheduled:
    'La actividad ya no está programada y no admite cambios.',
  project_closed: 'El proyecto cerrado no admite cambios en sus actividades.',
  project_not_found: 'No se encontró el proyecto solicitado.',
};

function gatewayFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = errorCodes[error.message] ?? 'unexpected';
  const message =
    specificMessages[error.message] ??
    (code === 'forbidden'
      ? 'No tienes permiso para realizar esta operación de actividades.'
      : 'No fue posible completar la operación de actividades.');
  return failure({ code, message });
}

function invalidOutput<T>(): Result<T> {
  return failure({
    code: 'unexpected',
    message: 'El servidor devolvió una actividad no válida.',
  });
}

function mapActivity(value: unknown): Result<ProjectActivity> {
  const parsed = activityRowSchema.safeParse(value);
  if (!parsed.success) return invalidOutput();
  const row = parsed.data;
  return success({
    createdAt: row.created_at,
    description: row.description,
    endsAt: row.ends_at,
    id: row.id,
    locationText: row.location_text,
    name: row.name,
    projectId: row.project_id,
    startsAt: row.starts_at,
    status: row.status,
    statusChangedAt: row.status_changed_at,
    updatedAt: row.updated_at,
  });
}

function mapActivityList(
  values: readonly unknown[],
): Result<readonly ProjectActivity[]> {
  const activities: ProjectActivity[] = [];
  for (const value of values) {
    const mapped = mapActivity(value);
    if (!mapped.ok) return mapped;
    activities.push(mapped.value);
  }
  return success(activities);
}

export class SupabaseProjectActivityGateway implements ProjectActivityGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async listProjectActivities(
    projectId: string,
  ): Promise<Result<readonly ProjectActivity[]>> {
    const { data, error } = await this.client.rpc('list_project_activities', {
      requested_project_id: projectId,
    });
    return error ? gatewayFailure(error) : mapActivityList(data);
  }

  public async getProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    const { data, error } = await this.client.rpc(
      'get_project_activity_detail',
      {
        requested_activity_id: activityId,
        requested_project_id: projectId,
      },
    );
    if (error) return gatewayFailure(error);
    return data[0] ? mapActivity(data[0]) : invalidOutput();
  }

  public async createProjectActivity(
    command: ProjectActivityCreateCommand,
  ): Promise<Result<ProjectActivity>> {
    const { data, error } = await this.client.rpc('create_project_activity', {
      requested_description: command.description,
      requested_ends_at: command.endsAt,
      requested_location_text: command.locationText,
      requested_name: command.name,
      requested_project_id: command.projectId,
      requested_starts_at: command.startsAt,
    });
    if (error) return gatewayFailure(error);
    return data[0] ? mapActivity(data[0]) : invalidOutput();
  }

  public async updateProjectActivity(
    command: ProjectActivityUpdateCommand,
  ): Promise<Result<ProjectActivity>> {
    const { data, error } = await this.client.rpc('update_project_activity', {
      requested_activity_id: command.activityId,
      requested_description: command.description,
      requested_ends_at: command.endsAt,
      requested_location_text: command.locationText,
      requested_name: command.name,
      requested_project_id: command.projectId,
      requested_starts_at: command.startsAt,
    });
    if (error) return gatewayFailure(error);
    return data[0] ? mapActivity(data[0]) : invalidOutput();
  }

  public async completeProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    return this.transition('complete_project_activity', projectId, activityId);
  }

  public async cancelProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    return this.transition('cancel_project_activity', projectId, activityId);
  }

  private async transition(
    operation: 'cancel_project_activity' | 'complete_project_activity',
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    const { data, error } = await this.client.rpc(operation, {
      requested_activity_id: activityId,
      requested_project_id: projectId,
    });
    if (error) return gatewayFailure(error);
    return data[0] ? mapActivity(data[0]) : invalidOutput();
  }
}
