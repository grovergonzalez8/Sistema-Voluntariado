import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectActivityAttendance,
  ProjectActivityAttendanceStatus,
} from '../domain/project-activity-attendance';

export interface ProjectActivityAttendanceGateway {
  listAttendances(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityAttendance[]>>;
  setAttendance(
    projectId: string,
    activityId: string,
    participationId: string,
    expectedStatus: ProjectActivityAttendanceStatus | null,
    status: ProjectActivityAttendanceStatus,
  ): Promise<Result<ProjectActivityAttendance>>;
}
