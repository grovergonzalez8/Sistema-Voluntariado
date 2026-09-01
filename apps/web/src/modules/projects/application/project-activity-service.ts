import {
  failure,
  success,
  type AppError,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import {
  validateProjectActivityInput,
  type ProjectActivity,
  type ProjectActivityInput,
} from '../domain/project-activity';
import {
  projectPermissions,
  type ProjectAuthorizationPort,
  type ProjectPermission,
} from './project-authorization-port';
import type { ProjectActivityGateway } from './project-activity-gateway';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ProjectActivityService {
  public constructor(
    private readonly authorization: ProjectAuthorizationPort,
    private readonly gateway: ProjectActivityGateway,
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
      message: 'No tienes permiso para realizar esta operación de actividades.',
    });
  }

  private invalidIdError(
    id: string,
    entity: 'activity' | 'project',
  ): AppError | undefined {
    if (uuidPattern.test(id)) return undefined;
    return {
      code: 'validation',
      message:
        entity === 'activity'
          ? 'La actividad solicitada no es válida.'
          : 'El proyecto solicitado no es válido.',
    };
  }

  private validateIds(
    projectId: string,
    activityId?: string,
  ): AppError | undefined {
    return (
      this.invalidIdError(projectId, 'project') ??
      (activityId === undefined
        ? undefined
        : this.invalidIdError(activityId, 'activity'))
    );
  }

  public async listProjectActivities(
    projectId: string,
  ): Promise<Result<readonly ProjectActivity[]>> {
    const invalidId = this.validateIds(projectId);
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.readAssigned,
    ]);
    return authorized.ok
      ? this.gateway.listProjectActivities(projectId)
      : authorized;
  }

  public async getProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    const invalidId = this.validateIds(projectId, activityId);
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.readAssigned,
    ]);
    return authorized.ok
      ? this.gateway.getProjectActivity(projectId, activityId)
      : authorized;
  }

  public async createProjectActivity(
    projectId: string,
    input: ProjectActivityInput,
  ): Promise<Result<ProjectActivity>> {
    return this.saveProjectActivity(projectId, undefined, input);
  }

  public async updateProjectActivity(
    projectId: string,
    activityId: string,
    input: ProjectActivityInput,
  ): Promise<Result<ProjectActivity>> {
    return this.saveProjectActivity(projectId, activityId, input);
  }

  private async saveProjectActivity(
    projectId: string,
    activityId: string | undefined,
    input: ProjectActivityInput,
  ): Promise<Result<ProjectActivity>> {
    const invalidId = this.validateIds(projectId, activityId);
    if (invalidId) return failure(invalidId);
    const canonical = validateProjectActivityInput(input);
    if (!canonical.ok) {
      return failure({
        code: 'validation',
        message: 'Revisa los datos de la actividad.',
      });
    }
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    if (!authorized.ok) return authorized;
    return activityId === undefined
      ? this.gateway.createProjectActivity({
          ...canonical.value,
          projectId,
        })
      : this.gateway.updateProjectActivity({
          ...canonical.value,
          activityId,
          projectId,
        });
  }

  public async completeProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    return this.transitionProjectActivity('complete', projectId, activityId);
  }

  public async cancelProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    return this.transitionProjectActivity('cancel', projectId, activityId);
  }

  private async transitionProjectActivity(
    transition: 'cancel' | 'complete',
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>> {
    const invalidId = this.validateIds(projectId, activityId);
    if (invalidId) return failure(invalidId);
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    if (!authorized.ok) return authorized;
    return transition === 'complete'
      ? this.gateway.completeProjectActivity(projectId, activityId)
      : this.gateway.cancelProjectActivity(projectId, activityId);
  }
}
