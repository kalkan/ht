/**
 * JSON backup / restore and CSV export. Pure functions: they take arrays and
 * return strings/objects, so they can be unit-tested without a browser.
 */
import type { DailyLog } from '../types/DailyLog';
import { isWorkoutType } from '../types/DailyLog';
import { isValidDateKey } from './dateUtils';

export const BACKUP_VERSION = 1;

export interface BackupFile {
  version: number;
  exportedAt: string;
  app: 'daily-tracker';
  records: DailyLog[];
}

export function createBackup(records: DailyLog[], exportedAt: string = new Date().toISOString()): BackupFile {
  return {
    version: BACKUP_VERSION,
    exportedAt,
    app: 'daily-tracker',
    records: records.map(stripForExport),
  };
}

/** Export a stable, minimal shape (no local-only sync state). */
function stripForExport(log: DailyLog): DailyLog {
  const out: DailyLog = {
    id: log.id,
    date: log.date,
    workout: log.workout,
    cigarettes: log.cigarettes,
    waterEnough: log.waterEnough,
    alcohol: log.alcohol,
    healthyDiet: log.healthyDiet,
    createdAt: log.createdAt,
    updatedAt: log.updatedAt,
    syncStatus: log.syncStatus,
  };
  if (typeof log.weight === 'number') out.weight = log.weight;
  return out;
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export interface ParsedBackup {
  version: number;
  records: DailyLog[];
  /** Records that were rejected during validation, with a reason. */
  rejected: { index: number; reason: string }[];
}

function isIsoTimestamp(v: unknown): v is string {
  return typeof v === 'string' && v.length >= 10 && !Number.isNaN(new Date(v).getTime());
}

/**
 * Validate a single raw record. Returns a clean DailyLog or a rejection reason.
 * Tolerates a few legacy/alternative field names so exports from other
 * versions (or from the Google Sheet) can be imported.
 */
export function validateRecord(raw: unknown): { ok: true; record: DailyLog } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Kayıt bir nesne değil' };
  const r = raw as Record<string, unknown>;

  const date = r.date;
  if (!isValidDateKey(date)) return { ok: false, reason: 'Geçersiz tarih' };

  const workout = r.workout;
  if (!isWorkoutType(workout)) return { ok: false, reason: `Geçersiz spor değeri (${String(workout)})` };

  const cigarettesRaw = r.cigarettes;
  const cigarettes = typeof cigarettesRaw === 'string' ? Number(cigarettesRaw) : cigarettesRaw;
  if (typeof cigarettes !== 'number' || !Number.isFinite(cigarettes) || cigarettes < 0) {
    return { ok: false, reason: 'Geçersiz sigara sayısı' };
  }

  const bool = (v: unknown): boolean | null => {
    if (typeof v === 'boolean') return v;
    if (v === 'true' || v === 1 || v === '1' || v === 'TRUE') return true;
    if (v === 'false' || v === 0 || v === '0' || v === 'FALSE') return false;
    return null;
  };
  const waterEnough = bool(r.waterEnough ?? r.water_enough);
  const alcohol = bool(r.alcohol);
  const healthyDiet = bool(r.healthyDiet ?? r.healthy_diet);
  if (waterEnough === null || alcohol === null || healthyDiet === null) {
    return { ok: false, reason: 'Evet/Hayır alanları eksik' };
  }

  let weight: number | undefined;
  const weightRaw = r.weight;
  if (weightRaw !== undefined && weightRaw !== null && weightRaw !== '') {
    const w = typeof weightRaw === 'string' ? Number(weightRaw.replace(',', '.')) : weightRaw;
    if (typeof w !== 'number' || !Number.isFinite(w) || w <= 0 || w > 500) {
      return { ok: false, reason: 'Geçersiz kilo' };
    }
    weight = Math.round(w * 10) / 10;
  }

  const createdAtRaw = r.createdAt ?? r.created_at;
  const updatedAtRaw = r.updatedAt ?? r.updated_at;
  const createdAt = isIsoTimestamp(createdAtRaw) ? new Date(createdAtRaw).toISOString() : null;
  const updatedAt = isIsoTimestamp(updatedAtRaw) ? new Date(updatedAtRaw).toISOString() : createdAt;
  if (!createdAt || !updatedAt) return { ok: false, reason: 'Zaman damgası eksik' };

  const id = typeof r.id === 'string' && r.id.trim().length > 0 ? r.id.trim() : null;
  if (!id) return { ok: false, reason: 'Kimlik (id) eksik' };

  const record: DailyLog = {
    id,
    date,
    workout,
    cigarettes: Math.round(cigarettes),
    waterEnough,
    alcohol,
    healthyDiet,
    createdAt,
    updatedAt,
    // Imported records are treated as new local changes so they get pushed to the cloud.
    syncStatus: 'pending',
  };
  if (weight !== undefined) record.weight = weight;
  return { ok: true, record };
}

/**
 * Parse and validate a backup JSON string. Throws on structurally invalid
 * files; individual malformed records are dropped and reported.
 * Duplicate dates inside the file are resolved by keeping the newest updatedAt.
 */
export function parseBackup(text: string): ParsedBackup {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil.');
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Yedek dosyası tanınmadı.');
  const obj = parsed as Record<string, unknown>;

  // Accept both {version, records:[...]} and a bare array of records.
  const rawRecords = Array.isArray(parsed) ? parsed : obj.records;
  if (!Array.isArray(rawRecords)) throw new Error('Yedek dosyasında "records" listesi bulunamadı.');

  const version = typeof obj.version === 'number' ? obj.version : BACKUP_VERSION;
  if (version > BACKUP_VERSION) {
    throw new Error(`Bu yedek daha yeni bir sürümle oluşturulmuş (v${version}). Uygulamayı güncelleyin.`);
  }

  const byDate = new Map<string, DailyLog>();
  const rejected: ParsedBackup['rejected'] = [];
  rawRecords.forEach((raw, index) => {
    const result = validateRecord(migrateRecord(raw, version));
    if (!result.ok) {
      rejected.push({ index, reason: result.reason });
      return;
    }
    const existing = byDate.get(result.record.date);
    if (!existing || existing.updatedAt < result.record.updatedAt) byDate.set(result.record.date, result.record);
  });

  return { version, records: Array.from(byDate.values()), rejected };
}

/** Hook for future schema migrations. Version 1 is the current shape. */
function migrateRecord(raw: unknown, fromVersion: number): unknown {
  // Version 1 is the current shape; add `if (fromVersion < N) {...}` steps here later.
  void fromVersion;
  return raw;
}

// ---------- CSV ----------

export const CSV_COLUMNS = [
  'date',
  'workout',
  'cigarettes',
  'water_enough',
  'alcohol',
  'healthy_diet',
  'weight',
  'created_at',
  'updated_at',
] as const;

function csvCell(value: string | number | boolean | undefined | null): string {
  if (value === undefined || value === null) return '';
  const s = String(value);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * UTF-8 CSV with BOM so Excel detects Turkish characters correctly.
 * Uses comma separator and CRLF line endings (Excel-friendly).
 */
export function toCsv(records: DailyLog[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const r of [...records].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push(
      [
        r.date,
        r.workout,
        r.cigarettes,
        r.waterEnough,
        r.alcohol,
        r.healthyDiet,
        typeof r.weight === 'number' ? r.weight : '',
        r.createdAt,
        r.updatedAt,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}
