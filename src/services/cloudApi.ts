/**
 * Firestore client using the REST API (no SDK). Documents live at
 *   users/{uid}/dailyLogs/{date}
 * and are protected by firestore.rules (owner-only, last-write-wins on updatedAt).
 */
import type { DailyLog } from '../types/DailyLog';
import { isWorkoutType } from '../types/DailyLog';
import { isValidDateKey } from '../utils/dateUtils';
import { CLOUD_CONFIGURED, FIREBASE_PROJECT_ID, FIRESTORE_URL } from './config';
import { AuthError, getIdToken, getSession } from './firebaseAuth';

const REQUEST_TIMEOUT_MS = 20_000;
const PAGE_SIZE = 300;
const BATCH_SIZE = 400; // Firestore allows 500 writes per commit

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly kind: 'network' | 'timeout' | 'http' | 'invalid' | 'rejected' | 'unauthorized' | 'unconfigured' | 'signedOut',
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// ---------- Firestore value mapping ----------

type FsValue =
  | { stringValue: string }
  | { integerValue: string | number }
  | { doubleValue: number }
  | { booleanValue: boolean }
  | { nullValue: null };

export interface FsDocument {
  name?: string;
  fields?: Record<string, FsValue>;
  updateTime?: string;
}

const docsRoot = () => `projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents`;
const collectionPath = (uid: string) => `users/${encodeURIComponent(uid)}/dailyLogs`;
const docName = (uid: string, date: string) => `${docsRoot()}/users/${uid}/dailyLogs/${date}`;

export function toFirestoreFields(log: DailyLog, deviceId: string): Record<string, FsValue> {
  return {
    id: { stringValue: log.id },
    date: { stringValue: log.date },
    workout: { stringValue: log.workout },
    cigarettes: { integerValue: String(log.cigarettes) },
    waterEnough: { booleanValue: log.waterEnough },
    alcohol: { booleanValue: log.alcohol },
    healthyDiet: { booleanValue: log.healthyDiet },
    weight: typeof log.weight === 'number' ? { doubleValue: log.weight } : { nullValue: null },
    createdAt: { stringValue: log.createdAt },
    updatedAt: { stringValue: log.updatedAt },
    deviceId: { stringValue: deviceId },
  };
}

function str(v: FsValue | undefined): string | null {
  return v && 'stringValue' in v ? v.stringValue : null;
}
function bool(v: FsValue | undefined): boolean | null {
  return v && 'booleanValue' in v ? v.booleanValue : null;
}
function num(v: FsValue | undefined): number | null {
  if (!v) return null;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return Number(v.doubleValue);
  return null;
}
function isoOrNull(v: string | null): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Convert a Firestore document into a DailyLog; null for malformed docs so one bad doc never breaks sync. */
export function fromFirestoreDoc(doc: FsDocument): DailyLog | null {
  const f = doc.fields;
  if (!f) return null;
  const date = str(f.date) ?? doc.name?.split('/').pop() ?? null;
  if (!isValidDateKey(date)) return null;
  const workout = str(f.workout);
  if (!isWorkoutType(workout)) return null;
  const cigarettes = num(f.cigarettes);
  if (cigarettes === null || !Number.isFinite(cigarettes) || cigarettes < 0) return null;
  const waterEnough = bool(f.waterEnough);
  const alcohol = bool(f.alcohol);
  const healthyDiet = bool(f.healthyDiet);
  if (waterEnough === null || alcohol === null || healthyDiet === null) return null;
  const createdAt = isoOrNull(str(f.createdAt));
  const updatedAt = isoOrNull(str(f.updatedAt)) ?? createdAt;
  if (!createdAt || !updatedAt) return null;
  const id = str(f.id);
  if (!id) return null;
  const log: DailyLog = {
    id,
    date,
    workout,
    cigarettes: Math.round(cigarettes),
    waterEnough,
    alcohol,
    healthyDiet,
    createdAt,
    updatedAt,
    syncStatus: 'synced',
  };
  const w = num(f.weight);
  if (w !== null && Number.isFinite(w) && w > 0) log.weight = Math.round(w * 10) / 10;
  return log;
}

// ---------- HTTP ----------

async function request<T>(method: 'GET' | 'POST' | 'DELETE', path: string, body?: unknown, retry = true): Promise<T> {
  if (!CLOUD_CONFIGURED) throw new ApiError('Bulut senkronizasyonu yapılandırılmadı.', 'unconfigured');
  if (!getSession()) throw new ApiError('Giriş yapılmadı.', 'signedOut');

  let token: string;
  try {
    token = await getIdToken();
  } catch (err) {
    if (err instanceof AuthError && (err.code === 'NETWORK' || err.code === 'TIMEOUT')) throw new ApiError(err.message, 'network');
    throw new ApiError(err instanceof Error ? err.message : 'Oturum geçersiz.', 'unauthorized');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${FIRESTORE_URL}/${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
      cache: 'no-store',
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw new ApiError('Bulut isteği zaman aşımına uğradı.', 'timeout');
    throw new ApiError('Firestore sunucusuna ulaşılamadı.', 'network');
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  try {
    json = res.status === 204 ? {} : await res.json();
  } catch {
    throw new ApiError(`Geçersiz sunucu yanıtı (HTTP ${res.status}).`, 'invalid');
  }
  if (!res.ok) {
    const err = (json as { error?: { status?: string; message?: string } } | null)?.error;
    if (res.status === 401 && retry) {
      // ID token rejected: refresh once and retry.
      await getIdToken(true).catch(() => undefined);
      return request<T>(method, path, body, false);
    }
    if (res.status === 401) throw new ApiError('Oturum geçersiz. Lütfen tekrar giriş yapın.', 'unauthorized');
    if (res.status === 403) throw new ApiError('Erişim reddedildi. Firestore kurallarını kontrol edin.', 'rejected');
    throw new ApiError(`Firestore hatası: ${err?.message ?? `HTTP ${res.status}`}`, 'http');
  }
  return json as T;
}

// ---------- API surface ----------

export async function ping(): Promise<boolean> {
  const uid = getSession()?.uid ?? '';
  await request<{ documents?: FsDocument[] }>('GET', `${docsRoot()}/${collectionPath(uid)}?pageSize=1`);
  return true;
}

export async function getAll(): Promise<DailyLog[]> {
  const uid = getSession()?.uid ?? '';
  const out: DailyLog[] = [];
  let pageToken: string | undefined;
  do {
    const qs = new URLSearchParams({ pageSize: String(PAGE_SIZE) });
    if (pageToken) qs.set('pageToken', pageToken);
    const page = await request<{ documents?: FsDocument[]; nextPageToken?: string }>(
      'GET',
      `${docsRoot()}/${collectionPath(uid)}?${qs.toString()}`,
    );
    for (const doc of page.documents ?? []) {
      const log = fromFirestoreDoc(doc);
      if (log) out.push(log);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  return out;
}

export async function getByDate(date: string): Promise<DailyLog | null> {
  const uid = getSession()?.uid ?? '';
  try {
    const doc = await request<FsDocument>('GET', docName(uid, date));
    return fromFirestoreDoc(doc);
  } catch (err) {
    if (err instanceof ApiError && err.kind === 'http' && /NOT_FOUND|404/.test(err.message)) return null;
    throw err;
  }
}

/** Write many rows in commits of up to BATCH_SIZE. The rules enforce one doc per date and last-write-wins. */
export async function upsertMany(logs: DailyLog[], deviceId: string): Promise<void> {
  const uid = getSession()?.uid ?? '';
  for (let i = 0; i < logs.length; i += BATCH_SIZE) {
    const writes = logs.slice(i, i + BATCH_SIZE).map((log) => ({
      update: { name: docName(uid, log.date), fields: toFirestoreFields(log, deviceId) },
    }));
    await request('POST', `${docsRoot()}:commit`, { writes });
  }
}

export async function upsert(log: DailyLog, deviceId: string): Promise<void> {
  await upsertMany([log], deviceId);
}

export async function deleteByDate(date: string): Promise<void> {
  const uid = getSession()?.uid ?? '';
  await request('DELETE', docName(uid, date));
}

export async function deleteAll(): Promise<void> {
  const uid = getSession()?.uid ?? '';
  const all = await getAll();
  for (let i = 0; i < all.length; i += BATCH_SIZE) {
    const writes = all.slice(i, i + BATCH_SIZE).map((log) => ({ delete: docName(uid, log.date) }));
    await request('POST', `${docsRoot()}:commit`, { writes });
  }
}
