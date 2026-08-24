import {
  failure,
  success,
  type AppErrorCode,
  type Result,
} from '@sistema-voluntariado/shared-kernel';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '../../../shared/infrastructure/supabase/database.types';
import type {
  ProjectListQuery,
  ProjectManagementGateway,
  ProjectPage,
  ProjectUpdateCommand,
} from '../application/project-management-gateway';
import type {
  ProjectVolunteerAssignment,
  ProjectVolunteerCandidate,
  VolunteerProjectAssignment,
} from '../domain/project-assignment';
import type { CanonicalProjectInput, Project } from '../domain/project';

interface SupabaseErrorLike {
  readonly message: string;
}

const errorCodes: Readonly<Record<string, AppErrorCode>> = {
  assignment_already_active: 'conflict',
  assignment_already_ended: 'conflict',
  assignment_not_found: 'not-found',
  invalid_project_query: 'validation',
  invalid_volunteer_query: 'validation',
  permission_denied: 'forbidden',
  project_already_closed: 'conflict',
  project_closed: 'conflict',
  project_has_active_assignments: 'conflict',
  project_not_found: 'not-found',
  volunteer_not_found: 'not-found',
};

const specificMessages: Readonly<Record<string, string>> = {
  assignment_already_active:
    'El voluntario ya tiene una asignación activa a este proyecto.',
  assignment_already_ended: 'La asignación ya había sido finalizada.',
  assignment_not_found: 'No se encontró la asignación solicitada.',
  project_already_closed: 'El proyecto ya está cerrado.',
  project_closed: 'No se puede asignar a un proyecto cerrado.',
  project_has_active_assignments:
    'Finaliza todas las asignaciones activas antes de cerrar el proyecto.',
  project_not_found: 'No se encontró el proyecto solicitado.',
  volunteer_not_found: 'No se encontró el voluntario solicitado.',
};

function gatewayFailure<T>(error: SupabaseErrorLike): Result<T> {
  const code = errorCodes[error.message] ?? 'unexpected';
  const message =
    specificMessages[error.message] ??
    (code === 'forbidden'
      ? 'No tienes permiso para administrar proyectos.'
      : code === 'validation'
        ? 'La solicitud de proyectos no es válida.'
        : 'No fue posible completar la operación de proyectos.');
  return failure({ code, message });
}

function mapProject(row: {
  readonly created_at: string;
  readonly description: string | null;
  readonly id: string;
  readonly name: string;
  readonly status: 'active' | 'closed';
  readonly updated_at: string;
}): Project {
  return {
    createdAt: row.created_at,
    description: row.description,
    id: row.id,
    name: row.name,
    status: row.status,
    updatedAt: row.updated_at,
  };
}

function mapAssignment(row: {
  readonly assignment_id: string;
  readonly created_at: string;
  readonly ended_at: string | null;
  readonly project_id: string;
  readonly started_at: string;
  readonly updated_at: string;
  readonly volunteer_id: string;
  readonly volunteer_name: string;
}): ProjectVolunteerAssignment {
  return {
    assignmentId: row.assignment_id,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    projectId: row.project_id,
    startedAt: row.started_at,
    updatedAt: row.updated_at,
    volunteerId: row.volunteer_id,
    volunteerName: row.volunteer_name,
  };
}

export class SupabaseProjectManagementGateway implements ProjectManagementGateway {
  public constructor(private readonly client: SupabaseClient<Database>) {}

  public async listProjects(
    query: ProjectListQuery,
  ): Promise<Result<ProjectPage>> {
    const { data, error } = await this.client.rpc('list_projects', {
      requested_limit: query.limit,
      requested_offset: query.offset,
      requested_search: query.search,
    });
    if (error) return gatewayFailure(error);
    return success({
      items: data.map((row) => mapProject({ ...row, id: row.project_id })),
      limit: query.limit,
      offset: query.offset,
      total: data[0]?.total_count ?? 0,
    });
  }

  public async getProject(id: string): Promise<Result<Project>> {
    const { data, error } = await this.client.rpc('get_project_detail', {
      requested_project_id: id,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapProject(row))
      : gatewayFailure({ message: 'project_not_found' });
  }

  public async createProject(
    input: CanonicalProjectInput,
  ): Promise<Result<Project>> {
    const { data, error } = await this.client.rpc('create_project', {
      requested_description: input.description,
      requested_name: input.name,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapProject(row))
      : failure({
          code: 'unexpected',
          message: 'El servidor no devolvió el proyecto creado.',
        });
  }

  public async updateProject(
    command: ProjectUpdateCommand,
  ): Promise<Result<Project>> {
    const { data, error } = await this.client.rpc('update_project', {
      requested_description: command.description,
      requested_name: command.name,
      requested_project_id: command.id,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapProject(row))
      : gatewayFailure({ message: 'project_not_found' });
  }

  public async closeProject(id: string): Promise<Result<Project>> {
    const { data, error } = await this.client.rpc('close_project', {
      requested_project_id: id,
    });
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapProject(row))
      : gatewayFailure({ message: 'project_not_found' });
  }

  public async listProjectAssignments(
    projectId: string,
  ): Promise<Result<readonly ProjectVolunteerAssignment[]>> {
    const { data, error } = await this.client.rpc('list_project_assignments', {
      requested_project_id: projectId,
    });
    return error ? gatewayFailure(error) : success(data.map(mapAssignment));
  }

  public async searchVolunteerCandidates(
    projectId: string,
    search: string,
  ): Promise<Result<readonly ProjectVolunteerCandidate[]>> {
    const { data, error } = await this.client.rpc(
      'search_project_volunteer_candidates',
      {
        requested_limit: 20,
        requested_project_id: projectId,
        requested_search: search,
      },
    );
    return error
      ? gatewayFailure(error)
      : success(
          data.map((row) => ({
            fullName: row.full_name,
            id: row.volunteer_id,
          })),
        );
  }

  public async assignVolunteer(
    projectId: string,
    volunteerId: string,
  ): Promise<Result<ProjectVolunteerAssignment>> {
    const { data, error } = await this.client.rpc(
      'assign_volunteer_to_project',
      {
        requested_project_id: projectId,
        requested_volunteer_id: volunteerId,
      },
    );
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapAssignment(row))
      : failure({
          code: 'unexpected',
          message: 'El servidor no devolvió la asignación creada.',
        });
  }

  public async endAssignment(
    id: string,
  ): Promise<Result<ProjectVolunteerAssignment>> {
    const { data, error } = await this.client.rpc(
      'finish_project_volunteer_assignment',
      { requested_assignment_id: id },
    );
    if (error) return gatewayFailure(error);
    const row = data[0];
    return row
      ? success(mapAssignment(row))
      : gatewayFailure({ message: 'assignment_not_found' });
  }

  public async listVolunteerProjects(
    volunteerId: string,
  ): Promise<Result<readonly VolunteerProjectAssignment[]>> {
    const { data, error } = await this.client.rpc('list_volunteer_projects', {
      requested_volunteer_id: volunteerId,
    });
    return error
      ? gatewayFailure(error)
      : success(
          data.map((row) => ({
            assignmentId: row.assignment_id,
            endedAt: row.ended_at,
            projectId: row.project_id,
            projectName: row.project_name,
            projectStatus: row.project_status,
            startedAt: row.started_at,
          })),
        );
  }
}
