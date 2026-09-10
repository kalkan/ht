/**
 * Client for the Netlify Function backend (netlify/functions/logs.mts).
 * JSON over POST, authenticated with "Authorization: Bearer <secret>".
 */
import type { DailyLog, RemoteDailyLog } from '../types/DailyLog';
import { isWorkoutType } from '../types/DailyLog';
import { isValidDateKey } from '../utils/dateUtils';
import { CLOUD_API_URL, getCloudSecret, isCloudConfigured } from './config';

const REQUEST_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'unauthorized' | 'unconfigured',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

type ApiResponse<T> = { success: true; data: T } | { success: false; error: string };

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!isCloudConfigured()) throw new ApiError('Bulut senkronizasyonu yapılandırılmadı.', 'unconfigured');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(CLOUD_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${getCloudSecret()}`,
      },
      body: JSON.stringify({ action, ...payload }),
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new ApiError('Bulut isteği zaman aşımına uğradı.', 'timeout');
    }
    throw new ApiError('Bulut sunucusuna ulaşılamadı.', 'network');
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    if (res.status === 401) throw new ApiError('Bulut anahtarı hatalı.', 'unauthorized');
    throw new ApiError(`Geçersiz sunucu yanıtı (HTTP ${res.status}).`, 'invalid');
  }
  if (!json || typeof json !== 'object' || typeof (json as ApiResponse<T>).success !== 'boolean') {
    throw new ApiError('Beklenmeyen sunucu yanıtı.', 'invalid');
  }
  const body = json as ApiResponse<T>;
  if (!body.success) {
    if (res.status === 401) throw new ApiError('Bulut anahtarı hatalı.', 'unauthorized');
    if (res.status >= 500) throw new ApiError(`Sunucu hatası: ${body.error}`, 'http');
    throw new ApiError(body.error || 'Sunucu isteği reddetti.', 'rejected');
  }
  if (!res.ok) throw new ApiError(`Sunucu hatası (HTTP ${res.status}).`, 'http');
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
  if (v === 1 || v === 0) return v === 1;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (s === 'true' || s === '1') return true;
    if (s === 'false' || s === '0') return false;
  }
  return null;
}

function toIso(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Convert a server row into a DailyLog; null for malformed rows so one bad row never breaks sync. */
export function fromRemote(raw: unknown): DailyLog | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (!isValidDateKey(r.date)) return null;
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
    date: r.date,
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
    const n = Number(typeof w === 'string' ? w.replace(',', '.') : w);
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

/** Upsert many rows in one request; the server enforces one row per date. */
export async function upsertMany(logs: DailyLog[], deviceId: string): Promise<void> {
  for (let i = 0; i < logs.length; i += 200) {
    const chunk = logs.slice(i, i + 200);
    await call('upsertMany', { data: chunk.map((l) => toRemote(l, deviceId)) });
  }
}

export async function deleteByDate(date: string): Promise<void> {
  await call('delete', { date });
}

export async function deleteAll(): Promise<void> {
  await call('deleteAll', { confirm: 'DELETE_ALL' });
}
