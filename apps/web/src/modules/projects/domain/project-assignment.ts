import type { ProjectStatus } from './project';

export interface ProjectVolunteerAssignment {
  readonly assignmentId: string;
  readonly createdAt: string;
  readonly endedAt: string | null;
  readonly projectId: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly volunteerId: string;
  readonly volunteerName: string;
}

export interface ProjectVolunteerCandidate {
  readonly fullName: string;
  readonly id: string;
}

export interface ProjectManagerAssignment {
  readonly assignmentId: string;
  readonly createdAt: string;
  readonly endedAt: string | null;
  readonly managerAccountId: string;
  readonly managerDisplayName: string;
  readonly projectId: string;
  readonly startedAt: string;
  readonly updatedAt: string;
}

export interface ProjectManagerCandidate {
  readonly displayName: string;
  readonly managerAccountId: string;
}

export interface VolunteerProjectAssignment {
  readonly assignmentId: string;
  readonly endedAt: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly startedAt: string;
}

export function isActiveProjectAssignment(
  assignment: Pick<
    ProjectManagerAssignment | ProjectVolunteerAssignment,
    'endedAt'
  >,
): boolean {
  return assignment.endedAt === null;
}
