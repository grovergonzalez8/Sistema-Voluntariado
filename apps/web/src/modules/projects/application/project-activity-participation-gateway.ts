import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  ProjectActivityParticipation,
  ProjectActivityVolunteerCandidate,
} from '../domain/project-activity-participation';

export interface ProjectActivityParticipationGateway {
  createParticipation(
    projectId: string,
    activityId: string,
    volunteerId: string,
  ): Promise<Result<ProjectActivityParticipation>>;
  finishParticipation(
    projectId: string,
    activityId: string,
    participationId: string,
  ): Promise<Result<ProjectActivityParticipation>>;
  listParticipations(
    projectId: string,
    activityId: string,
  ): Promise<Result<readonly ProjectActivityParticipation[]>>;
  searchEligibleCandidates(
    projectId: string,
    activityId: string,
    query: string,
  ): Promise<Result<readonly ProjectActivityVolunteerCandidate[]>>;
}
