export interface ProjectActivityParticipation {
  readonly activityId: string;
  readonly createdAt: string;
  readonly endedAt: string | null;
  readonly participationId: string;
  readonly startedAt: string;
  readonly updatedAt: string;
  readonly volunteerId: string;
  readonly volunteerName: string;
}

export interface ProjectActivityVolunteerCandidate {
  readonly volunteerId: string;
  readonly volunteerName: string;
}

export function isActiveProjectActivityParticipation(
  participation: Pick<ProjectActivityParticipation, 'endedAt'>,
): boolean {
  return participation.endedAt === null;
}
