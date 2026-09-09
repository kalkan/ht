import { beforeEach, describe, expect, it } from 'vitest';
import { db, getAllLogs, getLogByDate, upsertLogForDate } from './database';
import { mergeRemoteIntoLocal } from '../services/syncService';
import type { DailyLog } from '../types/DailyLog';

const input = { workout: 'push' as const, cigarettes: 2, waterEnough: true, alcohol: false, healthyDiet: true, weight: 78.2 };

beforeEach(async () => {
  await db.dailyLogs.clear();
  await db.meta.clear();
});

describe('upsertLogForDate', () => {
  it('creates then updates the same date without duplicates', async () => {
    const created = await upsertLogForDate('2026-09-09', input);
    expect(created.syncStatus).toBe('pending');
    const updated = await upsertLogForDate('2026-09-09', { ...input, cigarettes: 5, weight: undefined });
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.weight).toBeUndefined();
    expect(await db.dailyLogs.count()).toBe(1);
    expect((await getLogByDate('2026-09-09'))?.cigarettes).toBe(5);
  });
  it('rejects a second row for the same date at the index level', async () => {
    await upsertLogForDate('2026-09-09', input);
    await expect(
      db.dailyLogs.add({
        id: 'dup',
        date: '2026-09-09',
        workout: 'none',
        cigarettes: 0,
        waterEnough: false,
        alcohol: false,
        healthyDiet: false,
        createdAt: 'x',
        updatedAt: 'x',
        syncStatus: 'pending',
      }),
    ).rejects.toThrow();
  });
  it('clamps negative cigarettes to zero', async () => {
    const r = await upsertLogForDate('2026-09-09', { ...input, cigarettes: -3 });
    expect(r.cigarettes).toBe(0);
  });
  it('survives concurrent saves for the same date', async () => {
    await Promise.all([
      upsertLogForDate('2026-09-09', input),
      upsertLogForDate('2026-09-09', { ...input, cigarettes: 1 }),
      upsertLogForDate('2026-09-09', { ...input, cigarettes: 7 }),
    ]);
    expect(await db.dailyLogs.count()).toBe(1);
  });
});

describe('mergeRemoteIntoLocal (last-write-wins)', () => {
  const remote = (over: Partial<DailyLog>): DailyLog => ({
    id: 'r1',
    date: '2026-09-09',
    workout: 'cardio',
    cigarettes: 9,
    waterEnough: false,
    alcohol: true,
    healthyDiet: false,
    createdAt: '2026-09-09T08:00:00.000Z',
    updatedAt: '2026-09-09T08:00:00.000Z',
    syncStatus: 'synced',
    ...over,
  });

  it('adds records that are missing locally', async () => {
    const n = await mergeRemoteIntoLocal([remote({})]);
    expect(n).toBe(1);
    expect((await getAllLogs())[0].syncStatus).toBe('synced');
  });
  it('keeps newer local pending records', async () => {
    const local = await upsertLogForDate('2026-09-09', input); // updatedAt = now (newer)
    const n = await mergeRemoteIntoLocal([remote({ updatedAt: '2020-01-01T00:00:00.000Z' })]);
    expect(n).toBe(0);
    const after = await getLogByDate('2026-09-09');
    expect(after?.cigarettes).toBe(2);
    expect(after?.syncStatus).toBe('pending');
    expect(after?.id).toBe(local.id);
  });
  it('overwrites older local records with newer remote ones', async () => {
    const local = await upsertLogForDate('2026-09-09', input);
    const n = await mergeRemoteIntoLocal([remote({ updatedAt: '2999-01-01T00:00:00.000Z' })]);
    expect(n).toBe(1);
    const after = await getLogByDate('2026-09-09');
    expect(after?.cigarettes).toBe(9);
    expect(after?.id).toBe(local.id);
    expect(after?.syncStatus).toBe('synced');
    expect(await db.dailyLogs.count()).toBe(1);
  });
});
