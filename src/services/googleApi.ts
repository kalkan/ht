/**
 * Thin client for the Google Apps Script Web App (see apps-script/Code.gs).
 *
 * Notes on Apps Script + fetch():
 *  - Web Apps redirect (302) to a googleusercontent.com URL. fetch follows it.
 *  - A CORS preflight (OPTIONS) is NOT handled by Apps Script, so we must send a
 *    "simple request": method POST with Content-Type text/plain and no custom
 *    headers. The secret therefore travels inside the JSON body, not a header.
 */
import type { DailyLog, RemoteDailyLog } from '../types/DailyLog';
import { isWorkoutType } from '../types/DailyLog';
import { isValidDateKey } from '../utils/dateUtils';
import { APPS_SCRIPT_URL, APP_SECRET, CLOUD_SYNC_CONFIGURED } from './config';

const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'unconfigured',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!CLOUD_SYNC_CONFIGURED) throw new ApiError('Bulut senkronizasyonu yapılandırılmadı.', 'unconfigured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(APPS_SCRIPT_URL, {
      method: 'POST',
      // text/plain keeps this a CORS "simple request" (no preflight).
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action, secret: APP_SECRET, ...payload }),
      signal: controller.signal,
      redirect: 'follow',
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Google isteği zaman aşımına uğradı.', 'timeout');
    }
    throw new ApiError('Google Apps Script\'e ulaşılamadı.', 'network');
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) throw new ApiError(`Sunucu hatası (HTTP ${res.status}).`, 'http');

  let json: unknown;
  try {
    json = await res.json();
  } catch {
    throw new ApiError('Geçersiz sunucu yanıtı (JSON değil). Web App URL\'sini kontrol edin.', 'invalid');
  }
  if (!json || typeof json !== 'object' || typeof (json as ApiResponse<T>).success !== 'boolean') {
    throw new ApiError('Beklenmeyen sunucu yanıtı.', 'invalid');
  }
  const body = json as ApiResponse<T>;
  if (!body.success) throw new ApiError(body.error || 'Sunucu isteği reddetti.', 'rejected');
  return body.data;
}

// ---------- mapping ----------

export function toRemote(log: DailyLog, deviceId: string): RemoteDailyLog {
  return {
    id: log.id,
    date: log.date,
    workout: log.workout,
    cigarettes: log.cigarettes,
    water_enough: log.waterEnough,
    alcohol: log.alcohol,
    healthy_diet: log.healthyDiet,
    weight: typeof log.weight === 'number' ? log.weight : null,
    created_at: log.createdAt,
    updated_at: log.updatedAt,
    device_id: deviceId,
  };
}

function toBool(v: unknown): boolean | null {
  if (typeof v === 'boolean') return v;
  if (v === 'TRUE' || v === 'true' || v === 1 || v === '1') return true;
  if (v === 'FALSE' || v === 'false' || v === 0 || v === '0' || v === '') return false;
  return null;
}

function toIso(v: unknown): string | null {
  if (typeof v !== 'string' && !(v instanceof Date) && typeof v !== 'number') return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/**
 * Convert a raw sheet row into a DailyLog. Returns null for malformed rows so
 * a single bad row in the sheet can never break the whole sync.
 */
export function fromRemote(raw: unknown): DailyLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  let date = r.date;
  // Sheets may hand back a Date object serialized as ISO; normalise to YYYY-MM-DD.
  if (typeof date === 'string' && date.length > 10 && !Number.isNaN(new Date(date).getTime())) {
    const d = new Date(date);
    date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  if (!isValidDateKey(date)) return null;
  if (!isWorkoutType(r.workout)) return null;
  const cigarettes = Number(r.cigarettes);
  if (!Number.isFinite(cigarettes) || cigarettes < 0) return null;
  const waterEnough = toBool(r.water_enough);
  const alcohol = toBool(r.alcohol);
  const healthyDiet = toBool(r.healthy_diet);
  if (waterEnough === null || alcohol === null || healthyDiet === null) return null;
  const createdAt = toIso(r.created_at);
  const updatedAt = toIso(r.updated_at) ?? createdAt;
  if (!createdAt || !updatedAt) return null;
  const id = typeof r.id === 'string' && r.id.length > 0 ? r.id : null;
  if (!id) return null;

  const log: DailyLog = {
    id,
    date,
    workout: r.workout,
    cigarettes: Math.round(cigarettes),
    waterEnough,
    alcohol,
    healthyDiet,
    createdAt,
    updatedAt,
    syncStatus: 'synced',
  };
  const w = r.weight;
  if (w !== null && w !== undefined && w !== '') {
    const n = typeof w === 'string' ? Number(w.replace(',', '.')) : Number(w);
    if (Number.isFinite(n) && n > 0) log.weight = Math.round(n * 10) / 10;
  }
  return log;
}

// ---------- API surface ----------

export async function ping(): Promise<boolean> {
  const data = await call<{ ok: boolean }>('ping');
  return Boolean(data && data.ok);
}

export async function getAll(): Promise<DailyLog[]> {
  const rows = await call<unknown[]>('getAll');
  if (!Array.isArray(rows)) throw new ApiError('Sunucu liste döndürmedi.', 'invalid');
  return rows.map(fromRemote).filter((l): l is DailyLog => l !== null);
}

export async function getByDate(date: string): Promise<DailyLog | null> {
  const row = await call<unknown>('getByDate', { date });
  return row ? fromRemote(row) : null;
}

export async function upsert(log: DailyLog, deviceId: string): Promise<void> {
  await call('upsert', { data: toRemote(log, deviceId) });
}

/** Upsert many rows in a single request (the backend still enforces one row per date). */
export async function upsertMany(logs: DailyLog[], deviceId: string): Promise<void> {
  if (logs.length === 0) return;
  await call('upsertMany', { data: logs.map((l) => toRemote(l, deviceId)) });
}

export async function deleteByDate(date: string): Promise<void> {
  await call('delete', { date });
}

export async function deleteAll(): Promise<void> {
  await call('deleteAll', { confirm: 'DELETE_ALL' });
}
