import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  CanonicalProjectActivityInput,
  ProjectActivity,
} from '../domain/project-activity';

export interface ProjectActivityCreateCommand extends CanonicalProjectActivityInput {
  readonly projectId: string;
}

export interface ProjectActivityUpdateCommand extends ProjectActivityCreateCommand {
  readonly activityId: string;
}

export interface ProjectActivityGateway {
  cancelProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>>;
  completeProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>>;
  createProjectActivity(
    command: ProjectActivityCreateCommand,
  ): Promise<Result<ProjectActivity>>;
  getProjectActivity(
    projectId: string,
    activityId: string,
  ): Promise<Result<ProjectActivity>>;
  listProjectActivities(
    projectId: string,
  ): Promise<Result<readonly ProjectActivity[]>>;
  updateProjectActivity(
    command: ProjectActivityUpdateCommand,
  ): Promise<Result<ProjectActivity>>;
}
