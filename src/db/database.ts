import Dexie, { type EntityTable } from 'dexie';
import type { DailyLog, DailyLogInput } from '../types/DailyLog';
import { nowIso } from '../utils/dateUtils';

/** Simple key/value store for app metadata (device id, last sync, etc.). */
export interface MetaEntry {
  key: string;
  value: string;
}

export class DailyDatabase extends Dexie {
  dailyLogs!: EntityTable<DailyLog, 'id'>;
  meta!: EntityTable<MetaEntry, 'key'>;

  constructor() {
    super('daily-tracker');
    // `&date` = unique index. Exactly one log per calendar day.
    this.version(1).stores({
      dailyLogs: 'id, &date, syncStatus, updatedAt',
      meta: 'key',
    });
  }
}

export const db = new DailyDatabase();

export const META_KEYS = {
  deviceId: 'deviceId',
  lastSyncAt: 'lastSyncAt',
  lastSyncError: 'lastSyncError',
  lastBackupAt: 'lastBackupAt',
  seeded: 'devSeeded',
} as const;

// ---------- meta helpers ----------

export async function getMeta(key: string): Promise<string | undefined> {
  const entry = await db.meta.get(key);
  return entry?.value;
}

export async function setMeta(key: string, value: string): Promise<void> {
  await db.meta.put({ key, value });
}

export async function deleteMeta(key: string): Promise<void> {
  await db.meta.delete(key);
}

// ---------- daily log helpers ----------

export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Extremely old browsers only; still unique enough for a single user.
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getLogByDate(date: string): Promise<DailyLog | undefined> {
  return db.dailyLogs.where('date').equals(date).first();
}

export function getAllLogs(): Promise<DailyLog[]> {
  return db.dailyLogs.orderBy('date').toArray();
}

export function getPendingLogs(): Promise<DailyLog[]> {
  return db.dailyLogs.where('syncStatus').anyOf('pending', 'error').toArray();
}

export function sanitizeInput(input: DailyLogInput): DailyLogInput {
  const cigarettes = Number.isFinite(input.cigarettes) ? Math.max(0, Math.round(input.cigarettes)) : 0;
  let weight: number | undefined;
  if (typeof input.weight === 'number' && Number.isFinite(input.weight) && input.weight > 0) {
    weight = Math.round(input.weight * 10) / 10;
  }
  return {
    workout: input.workout,
    cigarettes,
    waterEnough: Boolean(input.waterEnough),
    alcohol: Boolean(input.alcohol),
    healthyDiet: Boolean(input.healthyDiet),
    weight,
  };
}

/**
 * Create or update the single record for `date`. Runs in a transaction so a
 * double-tap on Save can never produce two rows for the same day.
 */
export async function upsertLogForDate(date: string, input: DailyLogInput): Promise<DailyLog> {
  const clean = sanitizeInput(input);
  return db.transaction('rw', db.dailyLogs, async () => {
    const existing = await db.dailyLogs.where('date').equals(date).first();
    const now = nowIso();
    if (existing) {
      const updated: DailyLog = {
        ...existing,
        ...clean,
        updatedAt: now,
        syncStatus: 'pending',
      };
      // Keep the key `weight` absent instead of `undefined` for cleaner storage.
      if (updated.weight === undefined) delete updated.weight;
      await db.dailyLogs.put(updated);
      return updated;
    }
    const created: DailyLog = {
      id: newId(),
      date,
      ...clean,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'pending',
    };
    if (created.weight === undefined) delete created.weight;
    await db.dailyLogs.add(created);
    return created;
  });
}

export async function deleteLogByDate(date: string): Promise<void> {
  await db.dailyLogs.where('date').equals(date).delete();
}

export async function clearAllLocalData(): Promise<void> {
  await db.transaction('rw', db.dailyLogs, db.meta, async () => {
    await db.dailyLogs.clear();
    // Keep the device id so the same device keeps its identity after a wipe.
    const deviceId = await db.meta.get(META_KEYS.deviceId);
    await db.meta.clear();
    if (deviceId) await db.meta.put(deviceId);
  });
}

/** The most recent record (by date) that has a weight, optionally before a date. */
export async function getLastWeightBefore(date: string): Promise<DailyLog | undefined> {
  const logs = await db.dailyLogs.where('date').below(date).reverse().toArray();
  return logs.find((l) => typeof l.weight === 'number');
}
