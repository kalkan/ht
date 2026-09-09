/**
 * DEVELOPMENT-ONLY sample data. Never runs automatically and is tree-shaken
 * out of production builds because every call site is guarded by IS_DEV.
 */
import { META_KEYS, db, deleteMeta, getMeta, newId, setMeta } from '../db/database';
import type { DailyLog, WorkoutType } from '../types/DailyLog';
import { addDays, todayKey } from '../utils/dateUtils';

const SEED_PREFIX = 'seed-';

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const CYCLE: WorkoutType[] = ['push', 'pull', 'legs_core', 'cardio', 'none', 'push', 'none'];

export function generateSeedLogs(days = 75, today: string = todayKey()): DailyLog[] {
  const rand = mulberry32(20260909);
  const logs: DailyLog[] = [];
  let weight = 81.4;
  for (let i = days - 1; i >= 0; i -= 1) {
    // Leave ~12% of days unlogged so charts/empty states get exercised.
    if (rand() < 0.12 && i !== 0) continue;
    const date = addDays(today, -i);
    const workout = CYCLE[(days - i) % CYCLE.length];
    // Cigarettes trend downwards over time with noise.
    const base = 6 - (4 * (days - i)) / days;
    const cigarettes = Math.max(0, Math.round(base + (rand() - 0.5) * 4));
    weight += (rand() - 0.55) * 0.4;
    const weighed = rand() < 0.6;
    const ts = new Date(`${date}T20:${String(Math.floor(rand() * 60)).padStart(2, '0')}:00`).toISOString();
    const log: DailyLog = {
      id: `${SEED_PREFIX}${newId()}`,
      date,
      workout,
      cigarettes,
      waterEnough: rand() < 0.75,
      alcohol: rand() < 0.15,
      healthyDiet: rand() < 0.7,
      createdAt: ts,
      updatedAt: ts,
      syncStatus: 'synced',
    };
    if (weighed) log.weight = Math.round(weight * 10) / 10;
    logs.push(log);
  }
  return logs;
}

/** Inserts seed data for dates that don't already have a record. */
export async function seedDatabase(): Promise<number> {
  const logs = generateSeedLogs();
  let inserted = 0;
  await db.transaction('rw', db.dailyLogs, db.meta, async () => {
    for (const log of logs) {
      const exists = await db.dailyLogs.where('date').equals(log.date).count();
      if (exists === 0) {
        await db.dailyLogs.add(log);
        inserted += 1;
      }
    }
    await setMeta(META_KEYS.seeded, 'true');
  });
  return inserted;
}

export async function removeSeedData(): Promise<number> {
  const all = await db.dailyLogs.toArray();
  const ids = all.filter((l) => l.id.startsWith(SEED_PREFIX)).map((l) => l.id);
  await db.dailyLogs.bulkDelete(ids);
  await deleteMeta(META_KEYS.seeded);
  return ids.length;
}

export async function isSeeded(): Promise<boolean> {
  return (await getMeta(META_KEYS.seeded)) === 'true';
}
