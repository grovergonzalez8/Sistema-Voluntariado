import {
  failure,
  success,
  type Result,
} from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectActivityAttendance,
  ProjectActivityAttendanceStatus,
} from '../domain/project-activity-attendance';
import type { ProjectActivityAttendanceGateway } from './project-activity-attendance-gateway';
import {
  projectPermissions,
  type ProjectAuthorizationPort,
  type ProjectPermission,
} from './project-authorization-port';

const uuidPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

export class ProjectActivityAttendanceService {
  public constructor(
    private readonly authorization: ProjectAuthorizationPort,
    private readonly gateway: ProjectActivityAttendanceGateway,
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
      message: 'No tienes permiso para gestionar la asistencia.',
    });
  }

  private validateIds(ids: readonly string[]): Result<true> {
    return ids.every((id) => uuidPattern.test(id))
      ? success(true)
      : failure({
          code: 'validation',
          message: 'La referencia de asistencia no es válida.',
        });
  }

  public async listAttendances(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityAttendance[]>> {
    const valid = this.validateIds([projectId, activityId]);
    if (!valid.ok) return valid;
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.readAssigned,
    ]);
    return authorized.ok
      ? this.gateway.listAttendances(projectId, activityId)
      : authorized;
  }

  public async setAttendance(
    projectId: string,
    activityId: string,
    participationId: string,
    expectedStatus: ProjectActivityAttendanceStatus | null,
    status: ProjectActivityAttendanceStatus,
  ): Promise<Result<ProjectActivityAttendance>> {
    const valid = this.validateIds([projectId, activityId, participationId]);
    if (!valid.ok) return valid;
    const authorized = await this.authorizeAny([
      projectPermissions.manage,
      projectPermissions.manageAssigned,
    ]);
    return authorized.ok
      ? this.gateway.setAttendance(
          projectId,
          activityId,
          participationId,
          expectedStatus,
          status,
        )
      : authorized;
  }
}
