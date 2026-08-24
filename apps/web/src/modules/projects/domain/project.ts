export const projectStatuses = ['active', 'closed'] as const;

export type ProjectStatus = (typeof projectStatuses)[number];

export interface ProjectInput {
  readonly description: string;
  readonly name: string;
}

export interface CanonicalProjectInput {
  readonly description: string | null;
  readonly name: string;
}

export interface Project extends CanonicalProjectInput {
  readonly createdAt: string;
  readonly id: string;
  readonly status: ProjectStatus;
  readonly updatedAt: string;
}

export type ProjectInputField = 'description' | 'name';

export type ProjectValidationErrors = Readonly<
  Partial<Record<ProjectInputField, string>>
>;

export type ProjectValidationResult =
  | { readonly errors: ProjectValidationErrors; readonly ok: false }
  | { readonly ok: true; readonly value: CanonicalProjectInput };

function normalizeVisibleWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function validateProjectInput(
  input: ProjectInput,
): ProjectValidationResult {
  const name = normalizeVisibleWhitespace(input.name);
  const normalizedDescription = normalizeVisibleWhitespace(input.description);
  const description =
    normalizedDescription === '' ? null : normalizedDescription;
  const errors: Partial<Record<ProjectInputField, string>> = {};

  if (name.length < 1 || name.length > 120) {
    errors.name = 'Escribe un nombre de 1 a 120 caracteres.';
  }
  if (description !== null && description.length > 1000) {
    errors.description = 'La descripción no puede superar 1.000 caracteres.';
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : { ok: true, value: { description, name } };
}
