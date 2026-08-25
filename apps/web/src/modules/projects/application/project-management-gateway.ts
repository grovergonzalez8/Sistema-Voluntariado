import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectManagerAssignment,
  ProjectManagerCandidate,
  ProjectVolunteerAssignment,
  ProjectVolunteerCandidate,
  VolunteerProjectAssignment,
} from '../domain/project-assignment';
import type { CanonicalProjectInput, Project } from '../domain/project';

export interface ProjectListQuery {
  readonly limit: number;
  readonly offset: number;
  readonly search: string;
}

export interface ProjectPage {
  readonly items: readonly Project[];
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
}

export interface ProjectUpdateCommand extends CanonicalProjectInput {
  readonly id: string;
}

export interface ProjectManagementGateway {
  assignManager(
    projectId: string,
    managerAccountId: string,
  ): Promise<Result<ProjectManagerAssignment>>;
  assignVolunteer(
    projectId: string,
    volunteerId: string,
  ): Promise<Result<ProjectVolunteerAssignment>>;
  closeProject(id: string): Promise<Result<Project>>;
  createProject(input: CanonicalProjectInput): Promise<Result<Project>>;
  endAssignment(id: string): Promise<Result<ProjectVolunteerAssignment>>;
  endManagerAssignment(id: string): Promise<Result<ProjectManagerAssignment>>;
  getProject(id: string): Promise<Result<Project>>;
  listProjectAssignments(
    projectId: string,
  ): Promise<Result<readonly ProjectVolunteerAssignment[]>>;
  listProjectManagerAssignments(
    projectId: string,
  ): Promise<Result<readonly ProjectManagerAssignment[]>>;
  listProjects(query: ProjectListQuery): Promise<Result<ProjectPage>>;
  listVolunteerProjects(
    volunteerId: string,
  ): Promise<Result<readonly VolunteerProjectAssignment[]>>;
  searchVolunteerCandidates(
    projectId: string,
    search: string,
  ): Promise<Result<readonly ProjectVolunteerCandidate[]>>;
  searchManagerCandidates(
    projectId: string,
    search: string,
  ): Promise<Result<readonly ProjectManagerCandidate[]>>;
  updateProject(command: ProjectUpdateCommand): Promise<Result<Project>>;
}
