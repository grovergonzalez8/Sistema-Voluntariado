const localDateTimePattern =
  /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})T(?<hour>\d{2}):(?<minute>\d{2})$/u;

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function localDateTimeToInstant(value: string): string | null {
  const match = localDateTimePattern.exec(value);
  if (!match?.groups) return null;
  const year = Number(match.groups['year']);
  const month = Number(match.groups['month']);
  const day = Number(match.groups['day']);
  const hour = Number(match.groups['hour']);
  const minute = Number(match.groups['minute']);
  const local = new Date(year, month - 1, day, hour, minute, 0, 0);

  if (
    local.getFullYear() !== year ||
    local.getMonth() !== month - 1 ||
    local.getDate() !== day ||
    local.getHours() !== hour ||
    local.getMinutes() !== minute
  ) {
    return null;
  }
  return local.toISOString();
}

export function instantToLocalDateTime(value: string): string {
  const instant = new Date(value);
  if (Number.isNaN(instant.valueOf())) return '';
  return `${String(instant.getFullYear()).padStart(4, '0')}-${pad(
    instant.getMonth() + 1,
  )}-${pad(instant.getDate())}T${pad(instant.getHours())}:${pad(
    instant.getMinutes(),
  )}`;
}
