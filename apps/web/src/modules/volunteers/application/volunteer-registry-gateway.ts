import type { Result } from '@sistema-voluntariado/shared-kernel';

import type {
  CanonicalVolunteerInput,
  RegisteredVolunteer,
  VolunteerSort,
} from '../domain/registered-volunteer';
import type { VolunteerDuplicateMatch } from '../domain/volunteer-duplicates';

export interface VolunteerListQuery {
  readonly limit: number;
  readonly offset: number;
  readonly search: string;
  readonly sort: VolunteerSort;
}

export interface VolunteerPage {
  readonly items: readonly RegisteredVolunteer[];
  readonly limit: number;
  readonly offset: number;
  readonly total: number;
}

export interface VolunteerSaveCommand extends CanonicalVolunteerInput {
  readonly acceptPotentialDuplicate: boolean;
}

export interface VolunteerUpdateCommand extends VolunteerSaveCommand {
  readonly id: string;
}

export interface VolunteerImportDuplicateQueryRow {
  readonly email: string | null;
  readonly phone: string | null;
  readonly rowNumber: number;
}

export interface VolunteerImportDuplicateMatch extends VolunteerDuplicateMatch {
  readonly rowNumber: number;
}

export interface VolunteerImportCommandRow extends CanonicalVolunteerInput {
  readonly acceptPotentialDuplicate: boolean;
}

export interface VolunteerImportResult {
  readonly batchId: string;
  readonly insertedCount: number;
}

export interface VolunteerRegistryGateway {
  createVolunteer(
    command: VolunteerSaveCommand,
  ): Promise<Result<RegisteredVolunteer>>;
  findPotentialDuplicates(
    input: CanonicalVolunteerInput,
    excludeId: string | null,
  ): Promise<Result<readonly VolunteerDuplicateMatch[]>>;
  getVolunteer(id: string): Promise<Result<RegisteredVolunteer>>;
  importVolunteers(
    rows: readonly VolunteerImportCommandRow[],
  ): Promise<Result<VolunteerImportResult>>;
  listVolunteers(query: VolunteerListQuery): Promise<Result<VolunteerPage>>;
  previewImportDuplicates(
    rows: readonly VolunteerImportDuplicateQueryRow[],
  ): Promise<Result<readonly VolunteerImportDuplicateMatch[]>>;
  exportVolunteers(
    query: VolunteerListQuery,
  ): Promise<Result<readonly RegisteredVolunteer[]>>;
  updateVolunteer(
    command: VolunteerUpdateCommand,
  ): Promise<Result<RegisteredVolunteer>>;
}
