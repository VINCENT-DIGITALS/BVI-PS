const EM_DASH = "—";

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

/** Coerce a date-like value into a valid Date, or null when unparseable. */
function toDate(value: string | Date | null | undefined): Date | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Format a date as "May 29, 2026". Returns an em dash for nullish/invalid input. */
export function formatDate(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? dateFormatter.format(date) : EM_DASH;
}

/** Format a date with time as "May 29, 2026, 3:45 PM". Returns an em dash for nullish/invalid input. */
export function formatDateTime(d: string | Date | null | undefined): string {
  const date = toDate(d);
  return date ? dateTimeFormatter.format(date) : EM_DASH;
}
