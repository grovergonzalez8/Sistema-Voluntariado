export const volunteerSortOptions = [
  'name_asc',
  'name_desc',
  'newest',
  'oldest',
] as const;

export type VolunteerSort = (typeof volunteerSortOptions)[number];

export interface VolunteerInput {
  readonly email: string;
  readonly fullName: string;
  readonly phone: string;
}

export interface CanonicalVolunteerInput {
  readonly email: string | null;
  readonly fullName: string;
  readonly phone: string | null;
}

export interface RegisteredVolunteer extends CanonicalVolunteerInput {
  readonly createdAt: string;
  readonly id: string;
  readonly updatedAt: string;
}

export type VolunteerInputField = 'email' | 'fullName' | 'phone';

export type VolunteerValidationErrors = Readonly<
  Partial<Record<VolunteerInputField, string>>
>;

export type VolunteerValidationResult =
  | {
      readonly errors: VolunteerValidationErrors;
      readonly ok: false;
    }
  | {
      readonly ok: true;
      readonly value: CanonicalVolunteerInput;
    };

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
const phonePattern = /^[+0-9 ().\-/]+$/u;

function normalizeVisibleWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

export function phoneMatchKey(phone: string | null): string | null {
  if (phone === null) return null;
  const digits = phone.replace(/\D/gu, '');
  return digits.length === 0 ? null : digits;
}

export function validateVolunteerInput(
  input: VolunteerInput,
): VolunteerValidationResult {
  const fullName = normalizeVisibleWhitespace(input.fullName);
  const emailValue = normalizeVisibleWhitespace(input.email).toLowerCase();
  const phoneValue = normalizeVisibleWhitespace(input.phone);
  const email = emailValue === '' ? null : emailValue;
  const phone = phoneValue === '' ? null : phoneValue;
  const errors: Partial<Record<VolunteerInputField, string>> = {};

  if (fullName.length < 1 || fullName.length > 100) {
    errors.fullName = 'Escribe un nombre de 1 a 100 caracteres.';
  }
  if (
    email !== null &&
    (email.length < 3 || email.length > 254 || !emailPattern.test(email))
  ) {
    errors.email = 'Escribe un correo válido o deja el campo vacío.';
  }
  if (
    phone !== null &&
    (phone.length < 3 ||
      phone.length > 40 ||
      !phonePattern.test(phone) ||
      phoneMatchKey(phone) === null)
  ) {
    errors.phone =
      'Escribe un celular válido usando dígitos y separadores habituales.';
  }

  return Object.keys(errors).length > 0
    ? { errors, ok: false }
    : { ok: true, value: { email, fullName, phone } };
}

export function isVolunteerSort(value: string): value is VolunteerSort {
  return volunteerSortOptions.some((option) => option === value);
}
