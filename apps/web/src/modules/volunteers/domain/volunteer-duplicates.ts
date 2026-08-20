export type VolunteerDuplicateField = 'email' | 'phone';

export interface VolunteerDuplicateMatch {
  readonly fullName: string;
  readonly id: string;
  readonly matchedFields: readonly VolunteerDuplicateField[];
}

export function duplicateEvidenceLabel(
  fields: readonly VolunteerDuplicateField[],
): string {
  if (fields.includes('email') && fields.includes('phone')) {
    return 'correo y celular';
  }
  return fields.includes('email') ? 'correo' : 'celular';
}
