/**
 * Date handling.
 *
 * Everything is formatted against ONE explicit display time zone. Without it,
 * a date rendered on the server (UTC) and re-rendered on the client (local)
 * produces different strings and React reports a hydration mismatch — and, far
 * worse, a late-night expense can appear to land on a different calendar day
 * than the one the budget counted it in.
 */

/** Overridable at deploy time; defaults to IST since the product ships INR-first. */
export const TIME_ZONE = process.env.NEXT_PUBLIC_TIME_ZONE || 'Asia/Kolkata';
const LOCALE = 'en-IN';

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = JSON.stringify(options);
  let cached = cache.get(key);
  if (!cached) {
    cached = new Intl.DateTimeFormat(LOCALE, { timeZone: TIME_ZONE, ...options });
    cache.set(key, cached);
  }
  return cached;
}

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
] as const;

export const MONTH_ABBR = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
] as const;

export interface MonthKey {
  month: number; // 1-12
  year: number;
}

/** Calendar-day parts of a date *in the display time zone*. */
export function zonedParts(date: Date): { year: number; month: number; day: number } {
  const parts = fmt({ year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  return { year: pick('year'), month: pick('month'), day: pick('day') };
}

export function monthKeyOf(date: Date): MonthKey {
  const { year, month } = zonedParts(date);
  return { month, year };
}

export function currentMonthKey(now: Date = new Date()): MonthKey {
  return monthKeyOf(now);
}

/**
 * UTC instant for the first millisecond of a month in the display zone.
 * Used as an inclusive lower bound in date range queries.
 */
export function monthStart({ month, year }: MonthKey): Date {
  return zonedMidnight(year, month, 1);
}

/** Exclusive upper bound: first millisecond of the following month. */
export function monthEnd({ month, year }: MonthKey): Date {
  return month === 12 ? zonedMidnight(year + 1, 1, 1) : zonedMidnight(year, month + 1, 1);
}

/**
 * Midnight of a calendar day in the display zone, expressed as a UTC instant.
 * Derived by measuring the zone's offset at that moment rather than assuming
 * a fixed one, so DST zones stay correct.
 */
export function zonedMidnight(year: number, month: number, day: number): Date {
  const naiveUtc = Date.UTC(year, month - 1, day, 0, 0, 0, 0);
  const offset = zoneOffsetMs(new Date(naiveUtc));
  return new Date(naiveUtc - offset);
}

function zoneOffsetMs(date: Date): number {
  const parts = fmt({
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
  }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');
  const asUtc = Date.UTC(pick('year'), pick('month') - 1, pick('day'), pick('hour') % 24, pick('minute'), pick('second'));
  return asUtc - date.getTime();
}

export function startOfDay(date: Date): Date {
  const { year, month, day } = zonedParts(date);
  return zonedMidnight(year, month, day);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}

export function addMonthsToKey({ month, year }: MonthKey, delta: number): MonthKey {
  const zeroBased = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zeroBased / 12), month: (zeroBased % 12) + 1 };
}

/** Advance a date by whole months, clamping to the last valid day. */
export function addMonths(date: Date, months: number): Date {
  const { year, month, day } = zonedParts(date);
  const zeroBased = year * 12 + (month - 1) + months;
  const targetYear = Math.floor(zeroBased / 12);
  const targetMonth = (zeroBased % 12) + 1;
  const lastDay = daysInMonth(targetYear, targetMonth);
  return zonedMidnight(targetYear, targetMonth, Math.min(day, lastDay));
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function monthLabel({ month, year }: MonthKey, style: 'long' | 'short' = 'long'): string {
  const name = style === 'long' ? MONTH_NAMES[month - 1] : MONTH_ABBR[month - 1];
  return `${name} ${year}`;
}

export function isSameZonedDay(a: Date, b: Date): boolean {
  const left = zonedParts(a);
  const right = zonedParts(b);
  return left.year === right.year && left.month === right.month && left.day === right.day;
}

/* ------------------------------------------------------------------------ */
/* Display                                                                   */
/* ------------------------------------------------------------------------ */

export function formatDate(date: Date): string {
  return fmt({ day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

export function formatDateShort(date: Date): string {
  return fmt({ day: 'numeric', month: 'short' }).format(date);
}

export function formatTime(date: Date): string {
  return fmt({ hour: 'numeric', minute: '2-digit', hour12: true }).format(date).toUpperCase();
}

/** "Today · 10:32 AM", "Yesterday · 6:42 PM", "8 Sep · 9:00 AM". */
export function formatDateTimeRelative(date: Date, now: Date = new Date()): string {
  const time = formatTime(date);
  if (isSameZonedDay(date, now)) return `Today · ${time}`;
  if (isSameZonedDay(date, addDays(now, -1))) return `Yesterday · ${time}`;
  if (isSameZonedDay(date, addDays(now, 1))) return `Tomorrow · ${time}`;
  return `${formatDateShort(date)} · ${time}`;
}

export function formatDayLabel(date: Date, now: Date = new Date()): string {
  if (isSameZonedDay(date, now)) return 'Today';
  if (isSameZonedDay(date, addDays(now, -1))) return 'Yesterday';
  if (isSameZonedDay(date, addDays(now, 1))) return 'Tomorrow';
  const sameYear = zonedParts(date).year === zonedParts(now).year;
  return sameYear ? formatDateShort(date) : formatDate(date);
}

/** Compact age for activity feeds: "just now", "12m", "3h", "5d", "12 Aug". */
export function formatAge(date: Date, now: Date = new Date()): string {
  const seconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (seconds < 45) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604_800) return `${Math.floor(seconds / 86_400)}d ago`;
  return formatDateShort(date);
}

export function daysBetween(from: Date, to: Date): number {
  return Math.round((startOfDay(to).getTime() - startOfDay(from).getTime()) / 86_400_000);
}

/** `YYYY-MM-DD` in the display zone — the value shape `<input type="date">` wants. */
export function toDateInputValue(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** `HH:MM` (24h) in the display zone, for `<input type="time">`. */
export function toTimeInputValue(date: Date): string {
  const parts = fmt({ hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(date);
  const pick = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? '00';
  return `${pick('hour').padStart(2, '0')}:${pick('minute')}`;
}

/** Combine the `date` and `time` inputs of a form into a UTC instant. */
export function fromDateTimeInputs(dateValue: string, timeValue?: string | null): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue.trim());
  if (!match) return null;
  const [, y, m, d] = match;
  const year = Number(y);
  const month = Number(m);
  const day = Number(d);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;

  const midnight = zonedMidnight(year, month, day);
  if (!timeValue) return midnight;

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec(timeValue.trim());
  if (!timeMatch) return midnight;
  const hours = Number(timeMatch[1]);
  const minutes = Number(timeMatch[2]);
  if (hours > 23 || minutes > 59) return midnight;
  return new Date(midnight.getTime() + hours * 3_600_000 + minutes * 60_000);
}
