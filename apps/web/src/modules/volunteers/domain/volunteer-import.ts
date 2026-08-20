import type { CanonicalVolunteerInput } from './registered-volunteer';
import type { VolunteerDuplicateField } from './volunteer-duplicates';

export interface VolunteerImportDuplicateEvidence {
  readonly fullName: string;
  readonly matchedFields: readonly VolunteerDuplicateField[];
  readonly source: 'database' | 'file';
}

export interface VolunteerImportPreviewRow {
  readonly canonical: CanonicalVolunteerInput | null;
  readonly duplicateEvidence: readonly VolunteerImportDuplicateEvidence[];
  readonly errors: readonly string[];
  readonly rowNumber: number;
}

export interface VolunteerImportPreview {
  readonly duplicateCount: number;
  readonly invalidCount: number;
  readonly rows: readonly VolunteerImportPreviewRow[];
  readonly totalDetected: number;
  readonly validCount: number;
}

export interface VolunteerImportConfirmation {
  readonly batchId: string;
  readonly insertedCount: number;
}
