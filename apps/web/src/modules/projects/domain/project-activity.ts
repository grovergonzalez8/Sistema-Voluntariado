export const projectActivityStatuses = [
  'scheduled',
  'completed',
  'cancelled',
] as const;

export type ProjectActivityStatus = (typeof projectActivityStatuses)[number];

export interface ProjectActivityInput {
  readonly description: string;
  readonly endsAt: string;
  readonly locationText: string;
  readonly name: string;
  readonly startsAt: string;
}

export interface CanonicalProjectActivityInput {
  readonly description: string | null;
  readonly endsAt: string | null;
  readonly locationText: string | null;
  readonly name: string;
  readonly startsAt: string;
}

export interface ProjectActivity extends CanonicalProjectActivityInput {
  readonly createdAt: string;
  readonly id: string;
  readonly projectId: string;
  readonly status: ProjectActivityStatus;
  readonly statusChangedAt: string;
  readonly updatedAt: string;
}

export type ProjectActivityInputField =
  'description' | 'endsAt' | 'locationText' | 'name' | 'startsAt';

export type ProjectActivityValidationErrors = Readonly<
  Partial<Record<ProjectActivityInputField, string>>
>;

export type ProjectActivityValidationResult =
  | { readonly errors: ProjectActivityValidationErrors; readonly ok: false }
  | { readonly ok: true; readonly value: CanonicalProjectActivityInput };

function normalizeVisibleWhitespace(value: string): string {
  return value.trim().replace(/\s+/gu, ' ');
}

function codePointLength(value: string): number {
  return Array.from(value).length;
}

const instantPattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})(?::(?<second>\d{2})(?:\.(?<fraction>\d{1,3}))?)?(?<offset>Z|(?<offsetSign>[+-])(?<offsetHour>\d{2}):(?<offsetMinute>\d{2}))$/u;

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return days[month - 1] ?? 0;
}

function canonicalInstant(value: string): string | null {
  const match = instantPattern.exec(value);
  if (!match?.groups) return null;

  const year = Number(match.groups['year']);
  const month = Number(match.groups['month']);
  const day = Number(match.groups['day']);
  const hour = Number(match.groups['hour']);
  const minute = Number(match.groups['minute']);
  const second = Number(match.groups['second'] ?? '0');
  const offsetHour = Number(match.groups['offsetHour'] ?? '0');
  const offsetMinute = Number(match.groups['offsetMinute'] ?? '0');

  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > daysInMonth(year, month) ||
    hour > 23 ||
    minute > 59 ||
    second > 59 ||
    offsetHour > 14 ||
    offsetMinute > 59 ||
    (offsetHour === 14 && offsetMinute !== 0)
  ) {
    return null;
  }

  const instant = new Date(value);
  if (
    Number.isNaN(instant.valueOf()) ||
    instant.getUTCFullYear() < 1 ||
    instant.getUTCFullYear() > 9999
  ) {
    return null;
  }
  return instant.toISOString();
}

export function validateProjectActivityInput(
  input: ProjectActivityInput,
): ProjectActivityValidationResult {
  const name = normalizeVisibleWhitespace(input.name);
  const normalizedDescription = normalizeVisibleWhitespace(input.description);
  const normalizedLocation = normalizeVisibleWhitespace(input.locationText);
  const description =
    normalizedDescription === '' ? null : normalizedDescription;
  const locationText = normalizedLocation === '' ? null : normalizedLocation;
  const startsAt = canonicalInstant(input.startsAt);
  const endsAt = canonicalInstant(input.endsAt);
  const errors: Partial<Record<ProjectActivityInputField, string>> = {};

  if (codePointLength(name) < 1 || codePointLength(name) > 120) {
    errors.name = 'Escribe un nombre de 1 a 120 caracteres.';
  }
  if (description !== null && codePointLength(description) > 1000) {
    errors.description = 'La descripción no puede superar 1.000 caracteres.';
  }
  if (locationText !== null && codePointLength(locationText) > 200) {
    errors.locationText = 'La ubicación no puede superar 200 caracteres.';
  }
  if (startsAt === null) {
    errors.startsAt = 'Indica una fecha y hora de inicio válidas.';
  }
  if (input.endsAt.trim() !== '' && endsAt === null) {
    errors.endsAt = 'Indica una fecha y hora de fin válidas.';
  } else if (
    startsAt !== null &&
    endsAt !== null &&
    new Date(endsAt).valueOf() < new Date(startsAt).valueOf()
  ) {
    errors.endsAt = 'La fecha de fin no puede ser anterior al inicio.';
  }

  return Object.keys(errors).length > 0 || startsAt === null
    ? { errors, ok: false }
    : {
        ok: true,
        value: { description, endsAt, locationText, name, startsAt },
      };
}

export function isScheduledProjectActivity(
  activity: Pick<ProjectActivity, 'status'>,
): boolean {
  return activity.status === 'scheduled';
}

export function isTerminalProjectActivity(
  activity: Pick<ProjectActivity, 'status'>,
): boolean {
  return activity.status === 'completed' || activity.status === 'cancelled';
}

export function canTransitionProjectActivity(
  current: ProjectActivityStatus,
  target: ProjectActivityStatus,
): boolean {
  return (
    current === 'scheduled' &&
    (target === 'completed' || target === 'cancelled')
  );
}
