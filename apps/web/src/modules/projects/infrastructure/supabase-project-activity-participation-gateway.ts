import {
  failure,
  success,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type { ProjectActivityParticipationGateway } from '../application/project-activity-participation-gateway';
import type {
  ProjectActivityParticipation,
  ProjectActivityVolunteerCandidate,
} from '../domain/project-activity-participation';

interface SupabaseErrorLike {
  readonly message: string;
}

const participationRowSchema = z.object({
  activity_id: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  ended_at: z.iso.datetime({ offset: true }).nullable(),
  participation_id: z.uuid(),
  started_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
  volunteer_id: z.uuid(),
  volunteer_name: z.string().min(1),
});

const candidateRowSchema = z.object({
  volunteer_id: z.uuid(),
  volunteer_name: z.string().min(1),
});

const errorCodes: Readonly<Record<string, AppErrorCode>> = {
  invalid_project_activity_volunteer_query: 'validation',
  permission_denied: 'forbidden',
  project_activity_not_found: 'not-found',
  project_activity_not_scheduled: 'conflict',
  project_activity_participation_already_active: 'conflict',
  project_activity_participation_already_ended: 'conflict',
  project_activity_participation_not_found: 'not-found',
  project_closed: 'conflict',
  project_not_found: 'not-found',
  volunteer_not_assigned_to_project: 'conflict',
};

const specificMessages: Readonly<Record<string, string>> = {
  invalid_project_activity_volunteer_query:
    'La búsqueda de voluntarios no es válida.',
  project_activity_not_found: 'No se encontró la actividad solicitada.',
  project_activity_not_scheduled:
    'La actividad ya no está programada y sus participantes son históricos.',
  project_activity_participation_already_active:
    'El voluntario ya participa activamente en esta actividad.',
  project_activity_participation_already_ended:
    'La participación ya había sido finalizada.',
  project_activity_participation_not_found:
    'No se encontró la participación solicitada.',
  project_closed:
    'El proyecto cerrado conserva sus participaciones como historial.',
  project_not_found: 'No se encontró el proyecto solicitado.',
  volunteer_not_assigned_to_project:
    'El voluntario ya no tiene una asignación activa a este proyecto.',
};

function gatewayFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = errorCodes[error.message] ?? 'unexpected';
  const message =
    specificMessages[error.message] ??
    (code === 'forbidden'
      ? 'No tienes permiso para gestionar participantes de la actividad.'
      : 'No fue posible completar la operación de participantes.');
  return failure({ code, message });
}

function invalidOutput<T>(): Result<T> {
  return failure({
    code: 'unexpected',
    message: 'El servidor devolvió una participación no válida.',
  });
}

function mapParticipation(
  value: unknown,
): Result<ProjectActivityParticipation> {
  const parsed = participationRowSchema.safeParse(value);
  if (!parsed.success) return invalidOutput();
  const row = parsed.data;
  return success({
    activityId: row.activity_id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    participationId: row.participation_id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
  });
}

function mapParticipationList(
  values: readonly unknown[],
): Result<readonly ProjectActivityParticipation[]> {
  const participations: ProjectActivityParticipation[] = [];
  for (const value of values) {
    const mapped = mapParticipation(value);
    if (!mapped.ok) return mapped;
    participations.push(mapped.value);
  }
  return success(participations);
}

function mapCandidateList(
  values: readonly unknown[],
): Result<readonly ProjectActivityVolunteerCandidate[]> {
  const candidates: ProjectActivityVolunteerCandidate[] = [];
  for (const value of values) {
    const parsed = candidateRowSchema.safeParse(value);
    if (!parsed.success) return invalidOutput();
    candidates.push({
      volunteerId: parsed.data.volunteer_id,
      volunteerName: parsed.data.volunteer_name,
    });
  }
  return success(candidates);
}

export class SupabaseProjectActivityParticipationGateway implements ProjectActivityParticipationGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async listParticipations(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityParticipation[]>> {
    const { data, error } = await this.client.rpc(
      'list_project_activity_participations',
      {
        requested_activity_id: activityId,
        requested_project_id: projectId,
      },
    );
    return error ? gatewayFailure(error) : mapParticipationList(data);
  }

  public async searchEligibleCandidates(
    projectId: string,
    activityId: string,
    query: string,
  ): Promise<Result<readonly ProjectActivityVolunteerCandidate[]>> {
    const { data, error } = await this.client.rpc(
      'search_project_activity_volunteer_candidates',
      {
        requested_activity_id: activityId,
        requested_limit: 20,
        requested_project_id: projectId,
        requested_query: query,
      },
    );
    return error ? gatewayFailure(error) : mapCandidateList(data);
  }

  public async createParticipation(
    projectId: string,
    activityId: string,
    volunteerId: string,
  ): Promise<Result<ProjectActivityParticipation>> {
    const { data, error } = await this.client.rpc(
      'create_project_activity_participation',
      {
        requested_activity_id: activityId,
        requested_project_id: projectId,
        requested_volunteer_id: volunteerId,
      },
    );
    if (error) return gatewayFailure(error);
    return data[0] ? mapParticipation(data[0]) : invalidOutput();
  }

  public async finishParticipation(
    projectId: string,
    activityId: string,
    participationId: string,
  ): Promise<Result<ProjectActivityParticipation>> {
    const { data, error } = await this.client.rpc(
      'finish_project_activity_participation',
      {
        requested_activity_id: activityId,
        requested_participation_id: participationId,
        requested_project_id: projectId,
      },
    );
    if (error) return gatewayFailure(error);
    return data[0] ? mapParticipation(data[0]) : invalidOutput();
  }
}
