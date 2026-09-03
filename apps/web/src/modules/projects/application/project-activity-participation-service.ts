import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectActivityParticipation,
  ProjectActivityVolunteerCandidate,
} from '../domain/project-activity-participation';
import {
  projectPermissions,
  type ProjectAuthorizationPort,
  type ProjectPermission,
} from './project-authorization-port';
import type { ProjectActivityParticipationGateway } from './project-activity-participation-gateway';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ProjectActivityParticipationService {
  public constructor(
    private readonly authorization: ProjectAuthorizationPort,
    private readonly gateway: ProjectActivityParticipationGateway,
  ) {}

  private async authorizeAny(
    permissions: readonly ProjectPermission[],
  ): Promise<Result<true>> {
    for (const permission of permissions) {
      const result = await this.authorization.hasPermission(permission);
      if (!result.ok) return result;
      if (result.value) return success(true);
    }
    return failure({
      code: 'forbidden',
      message:
        'No tienes permiso para gestionar participantes de la actividad.',
    });
  }

  private validateIds(ids: readonly string[]): Result<true> {
    return ids.every((id) => uuidPattern.test(id))
      ? success(true)
      : failure({
          code: 'validation',
          message: 'La referencia de participación no es válida.',
        });
  }

  public async listParticipations(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityParticipation[]>> {
    const valid = this.validateIds([projectId, activityId]);
    if (!valid.ok) return valid;
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.readAssigned,
    ]);
    return authorized.ok
      ? this.gateway.listParticipations(projectId, activityId)
      : authorized;
  }

  public async searchEligibleCandidates(
    projectId: string,
    activityId: string,
    query: string,
  ): Promise<Result<readonly ProjectActivityVolunteerCandidate[]>> {
    const valid = this.validateIds([projectId, activityId]);
    if (!valid.ok) return valid;
    const canonicalQuery = query.trim().replace(/\s+/gu, ' ');
    if (Array.from(canonicalQuery).length > 100) {
      return failure({
        code: 'validation',
        message: 'La búsqueda no puede superar 100 caracteres.',
      });
    }
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    return authorized.ok
      ? this.gateway.searchEligibleCandidates(
          projectId,
          activityId,
          canonicalQuery,
        )
      : authorized;
  }

  public async createParticipation(
    projectId: string,
    activityId: string,
    volunteerId: string,
  ): Promise<Result<ProjectActivityParticipation>> {
    const valid = this.validateIds([projectId, activityId, volunteerId]);
    if (!valid.ok) return valid;
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    return authorized.ok
      ? this.gateway.createParticipation(projectId, activityId, volunteerId)
      : authorized;
  }

  public async finishParticipation(
    projectId: string,
    activityId: string,
    participationId: string,
  ): Promise<Result<ProjectActivityParticipation>> {
    const valid = this.validateIds([projectId, activityId, participationId]);
    if (!valid.ok) return valid;
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    return authorized.ok
      ? this.gateway.finishParticipation(projectId, activityId, participationId)
      : authorized;
  }
}
