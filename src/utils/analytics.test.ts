import { describe, expect, it } from 'vitest';
import type { DailyLog } from '../types/DailyLog';
import {
  alcoholFreeRatio,
  averageCigarettes,
  cigaretteMovingAverage,
  currentStreak,
  filterByPeriod,
  firstWeight,
  healthyDietCompliance,
  latestWeight,
  longestStreak,
  monthCompletion,
  previousMonthCigaretteComparison,
  totalWeightChange,
  waterCompliance,
  weightChangeLast30Days,
  weightSeries,
  workoutDistribution,
} from './analytics';

function log(date: string, partial: Partial<DailyLog> = {}): DailyLog {
  return {
    id: `id-${date}`,
    date,
    workout: 'none',
    cigarettes: 0,
    waterEnough: true,
    alcohol: false,
    healthyDiet: true,
    createdAt: `${date}T10:00:00.000Z`,
    updatedAt: `${date}T10:00:00.000Z`,
    syncStatus: 'synced',
    ...partial,
  };
}

describe('streaks', () => {
  it('returns 0 with no data', () => {
    expect(currentStreak([], '2026-09-09')).toBe(0);
    expect(longestStreak([])).toBe(0);
  });
  it('counts consecutive days ending today', () => {
    const logs = [log('2026-09-07'), log('2026-09-08'), log('2026-09-09')];
    expect(currentStreak(logs, '2026-09-09')).toBe(3);
  });
  it('keeps the streak alive when today is not logged yet', () => {
    const logs = [log('2026-09-07'), log('2026-09-08')];
    expect(currentStreak(logs, '2026-09-09')).toBe(2);
  });
  it('breaks on a gap', () => {
    const logs = [log('2026-09-05'), log('2026-09-06'), log('2026-09-08'), log('2026-09-09')];
    expect(currentStreak(logs, '2026-09-09')).toBe(2);
    expect(longestStreak(logs)).toBe(2);
  });
  it('handles month boundaries', () => {
    const logs = [log('2026-08-30'), log('2026-08-31'), log('2026-09-01')];
    expect(longestStreak(logs)).toBe(3);
  });
});

describe('cigarettes', () => {
  it('averages only recorded days', () => {
    expect(averageCigarettes([])).toBeNull();
    expect(averageCigarettes([log('2026-09-01', { cigarettes: 2 }), log('2026-09-03', { cigarettes: 4 })])).toBe(3);
  });
  it('computes a trailing moving average over recorded days', () => {
    const logs = [1, 2, 3, 4, 5, 6, 7, 8].map((n, i) => log(`2026-09-0${i + 1}`, { cigarettes: n }));
    const ma = cigaretteMovingAverage(logs, 7);
    expect(ma[0].average).toBe(1);
    expect(ma[6].average).toBe(4); // (1..7)/7
    expect(ma[7].average).toBe(5); // (2..8)/7
  });
  it('compares against the previous month', () => {
    const logs = [
      log('2026-08-01', { cigarettes: 4 }),
      log('2026-08-02', { cigarettes: 4 }),
      log('2026-09-01', { cigarettes: 3 }),
      log('2026-09-02', { cigarettes: 3 }),
    ];
    const c = previousMonthCigaretteComparison(logs, 2026, 8);
    expect(c.currentAverage).toBe(3);
    expect(c.previousAverage).toBe(4);
    expect(c.change).toBeCloseTo(-0.25);
  });
  it('returns null change when previous month has no data', () => {
    const c = previousMonthCigaretteComparison([log('2026-09-01', { cigarettes: 3 })], 2026, 8);
    expect(c.change).toBeNull();
    expect(c.previousDays).toBe(0);
  });
});

describe('habit ratios', () => {
  const logs = [
    log('2026-09-01', { waterEnough: true, alcohol: false, healthyDiet: true }),
    log('2026-09-02', { waterEnough: false, alcohol: true, healthyDiet: false }),
    log('2026-09-03', { waterEnough: true, alcohol: false, healthyDiet: false }),
    log('2026-09-04', { waterEnough: true, alcohol: false, healthyDiet: true }),
  ];
  it('uses recorded days as denominator', () => {
    expect(waterCompliance(logs)).toBe(0.75);
    expect(alcoholFreeRatio(logs)).toBe(0.75);
    expect(healthyDietCompliance(logs)).toBe(0.5);
    expect(waterCompliance([])).toBeNull();
  });
});

describe('workout distribution', () => {
  it('counts each type', () => {
    const logs = [log('2026-09-01', { workout: 'push' }), log('2026-09-02', { workout: 'push' }), log('2026-09-03', { workout: 'cardio' })];
    expect(workoutDistribution(logs)).toEqual({ push: 2, pull: 0, legs_core: 0, cardio: 1, none: 0 });
  });
});

describe('weight', () => {
  const logs = [
    log('2026-08-01', { weight: 80 }),
    log('2026-08-15'),
    log('2026-08-20', { weight: 79 }),
    log('2026-09-05', { weight: 78.4 }),
    log('2026-09-09'),
  ];
  it('ignores days without a measurement', () => {
    expect(weightSeries(logs).map((p) => p.date)).toEqual(['2026-08-01', '2026-08-20', '2026-09-05']);
  });
  it('finds first and latest', () => {
    expect(firstWeight(logs)?.weight).toBe(80);
    expect(latestWeight(logs)?.weight).toBe(78.4);
    expect(totalWeightChange(logs)).toBe(-1.6);
  });
  it('30-day change needs two measurements in window', () => {
    expect(weightChangeLast30Days(logs, '2026-09-09')).toBe(-0.6);
    expect(weightChangeLast30Days([log('2026-09-05', { weight: 78 })], '2026-09-09')).toBeNull();
  });
  it('never treats missing weight as zero', () => {
    expect(latestWeight([log('2026-09-09')])).toBeNull();
  });
});

describe('completion and periods', () => {
  it('uses elapsed days for the current month', () => {
    const logs = [log('2026-09-01'), log('2026-09-02')];
    const c = monthCompletion(logs, 2026, 8, '2026-09-09');
    expect(c).toEqual({ recordedDays: 2, elapsedDays: 9, totalDays: 30 });
  });
  it('uses the full month for past months', () => {
    expect(monthCompletion([], 2026, 7, '2026-09-09').elapsedDays).toBe(31);
  });
  it('filters 7-day period inclusively', () => {
    const logs = [log('2026-09-02'), log('2026-09-03'), log('2026-09-09')];
    expect(filterByPeriod(logs, '7d', '2026-09-09').map((l) => l.date)).toEqual(['2026-09-03', '2026-09-09']);
  });
});
