/**
 * Pure analytics helpers. Every function takes plain arrays of DailyLog and
 * returns primitives, so they are trivially unit-testable and never depend on
 * React or IndexedDB.
 *
 * Data rules (see README):
 *  - Statistics are computed only from days that actually have a record.
 *  - Missing weight is never treated as 0 and never carried forward.
 */
import type { DailyLog, WorkoutType } from '../types/DailyLog';
import { WORKOUT_TYPES } from '../types/DailyLog';
import { addDays, diffDays, fromDateKey, monthRange, previousMonth, toMonthKey, todayKey } from './dateUtils';

export type Period = '7d' | '30d' | 'month' | '3m' | '6m' | '1y' | 'all';

export const PERIODS: { key: Period; label: string }[] = [
  { key: '7d', label: '7 gün' },
  { key: '30d', label: '30 gün' },
  { key: 'month', label: 'Bu ay' },
  { key: '3m', label: '3 ay' },
  { key: '6m', label: '6 ay' },
  { key: '1y', label: '1 yıl' },
  { key: 'all', label: 'Tümü' },
];

export function sortByDate(logs: DailyLog[]): DailyLog[] {
  return [...logs].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Inclusive date range for a period, ending today. `all` returns null start. */
export function periodRange(period: Period, today: string = todayKey()): { start: string | null; end: string } {
  const d = fromDateKey(today);
  switch (period) {
    case '7d':
      return { start: addDays(today, -6), end: today };
    case '30d':
      return { start: addDays(today, -29), end: today };
    case 'month':
      return { start: monthRange(d.getFullYear(), d.getMonth()).start, end: today };
    case '3m': {
      const s = new Date(d.getFullYear(), d.getMonth() - 3, d.getDate());
      return { start: keyOf(s), end: today };
    }
    case '6m': {
      const s = new Date(d.getFullYear(), d.getMonth() - 6, d.getDate());
      return { start: keyOf(s), end: today };
    }
    case '1y': {
      const s = new Date(d.getFullYear() - 1, d.getMonth(), d.getDate());
      return { start: keyOf(s), end: today };
    }
    case 'all':
    default:
      return { start: null, end: today };
  }
}

function keyOf(d: Date): string {
  const m = d.getMonth() + 1;
  const day = d.getDate();
  return `${d.getFullYear()}-${m < 10 ? '0' + m : m}-${day < 10 ? '0' + day : day}`;
}

export function filterByRange(logs: DailyLog[], start: string | null, end: string): DailyLog[] {
  return logs.filter((l) => (start === null || l.date >= start) && l.date <= end);
}

export function filterByPeriod(logs: DailyLog[], period: Period, today: string = todayKey()): DailyLog[] {
  const { start, end } = periodRange(period, today);
  return filterByRange(logs, start, end);
}

export function filterByMonth(logs: DailyLog[], year: number, monthIndex0: number): DailyLog[] {
  const { start, end } = monthRange(year, monthIndex0);
  return filterByRange(logs, start, end);
}

// ---------- streaks ----------

/** Consecutive logged days ending today (or yesterday, if today isn't logged yet). */
export function currentStreak(logs: DailyLog[], today: string = todayKey()): number {
  if (logs.length === 0) return 0;
  const dates = new Set(logs.map((l) => l.date));
  let cursor = dates.has(today) ? today : addDays(today, -1);
  if (!dates.has(cursor)) return 0;
  let streak = 0;
  while (dates.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

export function longestStreak(logs: DailyLog[]): number {
  if (logs.length === 0) return 0;
  const dates = Array.from(new Set(logs.map((l) => l.date))).sort();
  let best = 1;
  let run = 1;
  for (let i = 1; i < dates.length; i += 1) {
    if (diffDays(dates[i - 1], dates[i]) === 1) {
      run += 1;
      best = Math.max(best, run);
    } else {
      run = 1;
    }
  }
  return best;
}

// ---------- workout ----------

export function workoutDays(logs: DailyLog[]): number {
  return logs.filter((l) => l.workout !== 'none').length;
}

export function workoutDistribution(logs: DailyLog[]): Record<WorkoutType, number> {
  const dist = Object.fromEntries(WORKOUT_TYPES.map((t) => [t, 0])) as Record<WorkoutType, number>;
  for (const l of logs) {
    if (l.workout in dist) dist[l.workout] += 1;
  }
  return dist;
}

// ---------- cigarettes ----------

export function totalCigarettes(logs: DailyLog[]): number {
  return logs.reduce((sum, l) => sum + (Number.isFinite(l.cigarettes) ? l.cigarettes : 0), 0);
}

/** Average per recorded day. Null when there are no records. */
export function averageCigarettes(logs: DailyLog[]): number | null {
  if (logs.length === 0) return null;
  return totalCigarettes(logs) / logs.length;
}

export interface MovingAveragePoint {
  date: string;
  value: number;
  /** The trailing average over the previous `window` recorded days (including this one). */
  average: number;
}

/**
 * Trailing moving average over the last `window` RECORDED days.
 * Missing days are not interpolated; the window counts records, not calendar days.
 */
export function cigaretteMovingAverage(logs: DailyLog[], window = 7): MovingAveragePoint[] {
  const sorted = sortByDate(logs);
  const out: MovingAveragePoint[] = [];
  let sum = 0;
  for (let i = 0; i < sorted.length; i += 1) {
    sum += sorted[i].cigarettes;
    if (i >= window) sum -= sorted[i - window].cigarettes;
    const count = Math.min(i + 1, window);
    out.push({ date: sorted[i].date, value: sorted[i].cigarettes, average: round1(sum / count) });
  }
  return out;
}

export interface MonthComparison {
  currentAverage: number | null;
  previousAverage: number | null;
  /** Ratio, e.g. -0.22 for a 22% decrease. Null when either month lacks data. */
  change: number | null;
  currentTotal: number;
  previousTotal: number;
  currentDays: number;
  previousDays: number;
}

export function previousMonthCigaretteComparison(
  logs: DailyLog[],
  year: number,
  monthIndex0: number,
): MonthComparison {
  const cur = filterByMonth(logs, year, monthIndex0);
  const pm = previousMonth(year, monthIndex0);
  const prev = filterByMonth(logs, pm.year, pm.month);
  const currentAverage = averageCigarettes(cur);
  const previousAverage = averageCigarettes(prev);
  let change: number | null = null;
  if (currentAverage !== null && previousAverage !== null) {
    change = previousAverage === 0 ? (currentAverage === 0 ? 0 : null) : (currentAverage - previousAverage) / previousAverage;
  }
  return {
    currentAverage,
    previousAverage,
    change,
    currentTotal: totalCigarettes(cur),
    previousTotal: totalCigarettes(prev),
    currentDays: cur.length,
    previousDays: prev.length,
  };
}

// ---------- boolean habits ----------

function ratio(logs: DailyLog[], predicate: (l: DailyLog) => boolean): number | null {
  if (logs.length === 0) return null;
  return logs.filter(predicate).length / logs.length;
}

export function waterCompliance(logs: DailyLog[]): number | null {
  return ratio(logs, (l) => l.waterEnough);
}

export function alcoholFreeRatio(logs: DailyLog[]): number | null {
  return ratio(logs, (l) => !l.alcohol);
}

export function healthyDietCompliance(logs: DailyLog[]): number | null {
  return ratio(logs, (l) => l.healthyDiet);
}

export function countWhere(logs: DailyLog[], predicate: (l: DailyLog) => boolean): number {
  return logs.filter(predicate).length;
}

// ---------- weight ----------

export interface WeightPoint {
  date: string;
  weight: number;
}

/** Only actual measurements, sorted by date. Never interpolates. */
export function weightSeries(logs: DailyLog[]): WeightPoint[] {
  return sortByDate(logs)
    .filter((l): l is DailyLog & { weight: number } => typeof l.weight === 'number' && Number.isFinite(l.weight))
    .map((l) => ({ date: l.date, weight: l.weight }));
}

export function latestWeight(logs: DailyLog[]): WeightPoint | null {
  const s = weightSeries(logs);
  return s.length ? s[s.length - 1] : null;
}

export function firstWeight(logs: DailyLog[]): WeightPoint | null {
  const s = weightSeries(logs);
  return s.length ? s[0] : null;
}

export function totalWeightChange(logs: DailyLog[]): number | null {
  const s = weightSeries(logs);
  if (s.length < 2) return null;
  return round1(s[s.length - 1].weight - s[0].weight);
}

/**
 * Change between the latest measurement and the earliest measurement inside the
 * trailing 30-day window. Requires at least two measurements in that window.
 */
export function weightChangeLast30Days(logs: DailyLog[], today: string = todayKey()): number | null {
  const start = addDays(today, -29);
  const s = weightSeries(logs).filter((p) => p.date >= start && p.date <= today);
  if (s.length < 2) return null;
  return round1(s[s.length - 1].weight - s[0].weight);
}

// ---------- completion ----------

export interface MonthCompletion {
  recordedDays: number;
  /** Days elapsed in the month so far (up to today), or full month for past months. */
  elapsedDays: number;
  totalDays: number;
}

export function monthCompletion(
  logs: DailyLog[],
  year: number,
  monthIndex0: number,
  today: string = todayKey(),
): MonthCompletion {
  const { start, end } = monthRange(year, monthIndex0);
  const totalDays = fromDateKey(end).getDate();
  let elapsedDays: number;
  if (today < start) elapsedDays = 0;
  else if (today > end) elapsedDays = totalDays;
  else elapsedDays = fromDateKey(today).getDate();
  const recordedDays = filterByMonth(logs, year, monthIndex0).length;
  return { recordedDays, elapsedDays, totalDays };
}

export function isCurrentMonth(key: string, today: string = todayKey()): boolean {
  return toMonthKey(key) === toMonthKey(today);
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
