/**
 * Date helpers. All "day" logic uses the user's LOCAL timezone and the
 * YYYY-MM-DD string format. We never go through Date.toISOString() for day
 * keys because that would shift the day near midnight in non-UTC timezones.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Format a Date as local YYYY-MM-DD. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Today's local YYYY-MM-DD. */
export function todayKey(now: Date = new Date()): string {
  return toDateKey(now);
}

/** Parse a YYYY-MM-DD key into a local-midnight Date. */
export function fromDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDateKey(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = fromDateKey(value);
  return !Number.isNaN(d.getTime()) && toDateKey(d) === value;
}

/** Add (or subtract) whole days to a date key. */
export function addDays(key: string, days: number): string {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

/** Difference in whole days: b - a. */
export function diffDays(a: string, b: string): number {
  const ms = fromDateKey(b).getTime() - fromDateKey(a).getTime();
  return Math.round(ms / 86_400_000);
}

/** "2026-09" style month key. */
export function toMonthKey(key: string): string {
  return key.slice(0, 7);
}

export function monthKeyOf(year: number, monthIndex0: number): string {
  return `${year}-${pad2(monthIndex0 + 1)}`;
}

export function daysInMonth(year: number, monthIndex0: number): number {
  return new Date(year, monthIndex0 + 1, 0).getDate();
}

/** First and last date keys of a month. */
export function monthRange(year: number, monthIndex0: number): { start: string; end: string } {
  return {
    start: `${year}-${pad2(monthIndex0 + 1)}-01`,
    end: `${year}-${pad2(monthIndex0 + 1)}-${pad2(daysInMonth(year, monthIndex0))}`,
  };
}

/** Previous month as {year, monthIndex0}. */
export function previousMonth(year: number, monthIndex0: number): { year: number; month: number } {
  return monthIndex0 === 0 ? { year: year - 1, month: 11 } : { year, month: monthIndex0 - 1 };
}

export function nextMonth(year: number, monthIndex0: number): { year: number; month: number } {
  return monthIndex0 === 11 ? { year: year + 1, month: 0 } : { year, month: monthIndex0 + 1 };
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------- Turkish formatting ----------

const TR_MONTHS = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
];

const TR_DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

export function monthNameTr(monthIndex0: number): string {
  return TR_MONTHS[monthIndex0] ?? '';
}

export function weekdayNameTr(d: Date): string {
  return TR_DAYS[d.getDay()] ?? '';
}

/** "9 Eylül 2026" */
export function formatLongDateTr(key: string): string {
  const d = fromDateKey(key);
  return `${d.getDate()} ${monthNameTr(d.getMonth())} ${d.getFullYear()}`;
}

/** "9 Eyl" */
export function formatShortDateTr(key: string): string {
  const d = fromDateKey(key);
  return `${d.getDate()} ${monthNameTr(d.getMonth()).slice(0, 3)}`;
}

/** "Eylül 2026" */
export function formatMonthTr(year: number, monthIndex0: number): string {
  return `${monthNameTr(monthIndex0)} ${year}`;
}

/** Relative or absolute timestamp for "last synced" style labels. */
export function formatDateTimeTr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const diffMs = Date.now() - d.getTime();
  const minutes = Math.round(diffMs / 60_000);
  if (minutes < 1) return 'Az önce';
  if (minutes < 60) return `${minutes} dk önce`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} sa önce`;
  return `${d.getDate()} ${monthNameTr(d.getMonth())} ${d.getFullYear()}, ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Monday-first weekday index (0 = Monday ... 6 = Sunday). */
export function mondayFirstIndex(d: Date): number {
  return (d.getDay() + 6) % 7;
}

export const WEEKDAY_SHORT_TR = ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'];
