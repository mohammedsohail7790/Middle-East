/** Timezone-aware date/time formatting — use tenant IANA timezone from settings. */

export function formatDateTimeInTimezone(
  value: string | number | Date,
  timezone: string,
  options?: Intl.DateTimeFormatOptions
): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  try {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: timezone,
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...options,
    }).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatTimeInTimezone(
  value: string | number | Date,
  timezone: string
): string {
  return formatDateTimeInTimezone(value, timezone, {
    hour: "numeric",
    minute: "2-digit",
    year: undefined,
    month: undefined,
    day: undefined,
  });
}

export function formatDateInTimezone(
  value: string | number | Date,
  timezone: string
): string {
  return formatDateTimeInTimezone(value, timezone, {
    hour: undefined,
    minute: undefined,
  });
}
