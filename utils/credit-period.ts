/** UTC calendar-month helpers for anniversary credit grants (anchor day preserved). */

export function utcDayOfMonth(d: Date): number {
  return d.getUTCDate();
}

export function daysInUtcMonth(year: number, monthIndex0: number): number {
  return new Date(Date.UTC(year, monthIndex0 + 1, 0)).getUTCDate();
}

/** Clamp day into the target UTC month (31 Jan → 28/29 Feb). */
export function clampUtcDay(year: number, monthIndex0: number, day: number): number {
  const dim = daysInUtcMonth(year, monthIndex0);
  return Math.min(Math.max(1, day), dim);
}

/**
 * Add calendar months in UTC, keeping `anchorDay` when the month is long enough.
 * Example: 31 Jan + 1 → 28 Feb; 28 Feb + 1 with anchor 31 → 31 Mar.
 */
export function addCalendarMonthsUtc(from: Date, months: number, anchorDay: number): Date {
  const y = from.getUTCFullYear();
  const m = from.getUTCMonth();
  const total = m + months;
  const year = y + Math.floor(total / 12);
  const monthIndex0 = ((total % 12) + 12) % 12;
  const day = clampUtcDay(year, monthIndex0, anchorDay);
  return new Date(
    Date.UTC(
      year,
      monthIndex0,
      day,
      from.getUTCHours(),
      from.getUTCMinutes(),
      from.getUTCSeconds(),
      from.getUTCMilliseconds(),
    ),
  );
}

export function parseIsoDate(iso: string): Date | null {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
