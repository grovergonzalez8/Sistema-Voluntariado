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

export interface VolunteerProjectAssignment {
  readonly assignmentId: string;
  readonly endedAt: string | null;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectStatus: ProjectStatus;
  readonly startedAt: string;
}

export function isActiveProjectAssignment(
  assignment: Pick<ProjectVolunteerAssignment, 'endedAt'>,
): boolean {
  return assignment.endedAt === null;
}
