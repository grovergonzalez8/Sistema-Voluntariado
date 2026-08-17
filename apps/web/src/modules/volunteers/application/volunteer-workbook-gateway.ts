import type { Result } from '@sistema-voluntariado/shared-kernel';

import type { RegisteredVolunteer } from '../domain/registered-volunteer';

export type VolunteerWorkbookCell = boolean | Date | number | string | null;
export type VolunteerWorkbookRow = readonly VolunteerWorkbookCell[];

export interface VolunteerWorkbookGateway {
  createExport(
    volunteers: readonly RegisteredVolunteer[],
  ): Promise<Result<ArrayBuffer>>;
  createTemplate(): Promise<Result<ArrayBuffer>>;
  parse(buffer: ArrayBuffer): Promise<Result<readonly VolunteerWorkbookRow[]>>;
}
