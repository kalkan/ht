/**
 * Daily Tracker cloud API — framework-agnostic core.
 *
 * `handleRequest` takes a parsed JSON body and a tiny `Db` adapter and returns
 * a JSON-serialisable response. The Netlify Function in ../functions/logs.mts
 * wires it to Neon Postgres; the unit tests wire it to PGlite.
 *
 * Contract (same as the old Apps Script backend, so the frontend sync layer
 * stays untouched):
 *   { action: "ping" | "getAll" | "getByDate" | "upsert" | "upsertMany" | "delete" | "deleteAll", ... }
 *   → { success: true, data } | { success: false, error }
 */

export interface Db {
  /** Run a parameterised query and return the rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export const WORKOUTS = ['push', 'pull', 'legs_core', 'cardio', 'none'] as const;
export type Workout = (typeof WORKOUTS)[number];

/** Row shape exchanged with the client (snake_case). */
export interface LogRecord {
  id: string;
  date: string;
  workout: Workout;
  cigarettes: number;
  water_enough: boolean;
  alcohol: boolean;
  healthy_diet: boolean;
  weight: number | null;
  created_at: string;
  updated_at: string;
  device_id: string;
}

export type ApiResponse = { success: true; data: unknown } | { success: false; error: string };

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number = 400,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS daily_logs (
  date          TEXT PRIMARY KEY,
  id            TEXT NOT NULL,
  workout       TEXT NOT NULL,
  cigarettes    INTEGER NOT NULL DEFAULT 0,
  water_enough  BOOLEAN NOT NULL DEFAULT FALSE,
  alcohol       BOOLEAN NOT NULL DEFAULT FALSE,
  healthy_diet  BOOLEAN NOT NULL DEFAULT FALSE,
  weight        NUMERIC(5,1),
  created_at    TIMESTAMPTZ NOT NULL,
  updated_at    TIMESTAMPTZ NOT NULL,
  device_id     TEXT NOT NULL DEFAULT ''
)`;

let schemaReady: WeakMap<Db, Promise<void>> = new WeakMap();

export async function ensureSchema(db: Db): Promise<void> {
  let p = schemaReady.get(db);
  if (!p) {
    p = db.query(SCHEMA_SQL).then(() => undefined);
    schemaReady.set(db, p);
    p.catch(() => schemaReady.delete(db));
  }
  await p;
}

/** For tests only. */
export function resetSchemaCache(): void {
  schemaReady = new WeakMap();
}

// ---------- validation ----------

function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const [y, m, d] = v.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function toBool(v: unknown): boolean {
  if (typeof v === 'boolean') return v;
  const s = String(v).toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function toIso(v: unknown): string | null {
  if (v instanceof Date) return v.toISOString();
  if (typeof v !== 'string' && typeof v !== 'number') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function validateRecord(raw: unknown): LogRecord {
  if (!raw || typeof raw !== 'object') throw new ApiError('Record missing');
  const r = raw as Record<string, unknown>;
  if (!isDate(r.date)) throw new ApiError('Invalid date');
  const workout = String(r.workout ?? '');
  if (!(WORKOUTS as readonly string[]).includes(workout)) throw new ApiError('Invalid workout');
  const cigarettes = Number(r.cigarettes);
  if (!Number.isFinite(cigarettes) || cigarettes < 0) throw new ApiError('Invalid cigarettes');
  let weight: number | null = null;
  if (r.weight !== null && r.weight !== undefined && r.weight !== '') {
    weight = Number(typeof r.weight === 'string' ? r.weight.replace(',', '.') : r.weight);
    if (!Number.isFinite(weight) || weight <= 0 || weight > 500) throw new ApiError('Invalid weight');
    weight = Math.round(weight * 10) / 10;
  }
  const now = new Date().toISOString();
  const id = typeof r.id === 'string' && r.id.trim() ? r.id.trim() : globalThis.crypto.randomUUID();
  return {
    id,
    date: r.date,
    workout: workout as Workout,
    cigarettes: Math.round(cigarettes),
    water_enough: toBool(r.water_enough),
    alcohol: toBool(r.alcohol),
    healthy_diet: toBool(r.healthy_diet),
    weight,
    created_at: toIso(r.created_at) ?? now,
    updated_at: toIso(r.updated_at) ?? now,
    device_id: typeof r.device_id === 'string' ? r.device_id.slice(0, 100) : '',
  };
}

function rowToRecord(row: Record<string, unknown>): LogRecord {
  return {
    id: String(row.id),
    date: String(row.date),
    workout: String(row.workout) as Workout,
    cigarettes: Number(row.cigarettes),
    water_enough: Boolean(row.water_enough),
    alcohol: Boolean(row.alcohol),
    healthy_diet: Boolean(row.healthy_diet),
    weight: row.weight === null || row.weight === undefined ? null : Number(row.weight),
    created_at: toIso(row.created_at) ?? '',
    updated_at: toIso(row.updated_at) ?? '',
    device_id: String(row.device_id ?? ''),
  };
}

// ---------- operations ----------

const COLUMNS =
  'date, id, workout, cigarettes, water_enough, alcohol, healthy_diet, weight, created_at, updated_at, device_id';

export async function getAll(db: Db): Promise<LogRecord[]> {
  const rows = await db.query(`SELECT ${COLUMNS} FROM daily_logs ORDER BY date`);
  return rows.map(rowToRecord);
}

export async function getByDate(db: Db, date: unknown): Promise<LogRecord | null> {
  if (!isDate(date)) throw new ApiError('Invalid date');
  const rows = await db.query(`SELECT ${COLUMNS} FROM daily_logs WHERE date = $1`, [date]);
  return rows.length ? rowToRecord(rows[0]) : null;
}

/**
 * Insert or update the row for rec.date with last-write-wins on updated_at.
 * The original id and created_at are preserved so every device agrees on them.
 */
export async function upsertOne(db: Db, rec: LogRecord): Promise<{ action: 'inserted' | 'updated' | 'skipped'; record: LogRecord }> {
  const rows = await db.query<{ action: string } & Record<string, unknown>>(
    `INSERT INTO daily_logs (${COLUMNS})
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     ON CONFLICT (date) DO UPDATE SET
       workout = EXCLUDED.workout,
       cigarettes = EXCLUDED.cigarettes,
       water_enough = EXCLUDED.water_enough,
       alcohol = EXCLUDED.alcohol,
       healthy_diet = EXCLUDED.healthy_diet,
       weight = EXCLUDED.weight,
       updated_at = EXCLUDED.updated_at,
       device_id = EXCLUDED.device_id
     WHERE EXCLUDED.updated_at > daily_logs.updated_at
     RETURNING ${COLUMNS}, (xmax = 0) AS inserted`,
    [
      rec.date,
      rec.id,
      rec.workout,
      rec.cigarettes,
      rec.water_enough,
      rec.alcohol,
      rec.healthy_diet,
      rec.weight,
      rec.created_at,
      rec.updated_at,
      rec.device_id,
    ],
  );
  if (rows.length === 0) {
    // Conflict row was newer: nothing written.
    const current = await getByDate(db, rec.date);
    return { action: 'skipped', record: current ?? rec };
  }
  return { action: rows[0].inserted ? 'inserted' : 'updated', record: rowToRecord(rows[0]) };
}

export async function deleteByDate(db: Db, date: unknown): Promise<{ deleted: number }> {
  if (!isDate(date)) throw new ApiError('Invalid date');
  const rows = await db.query('DELETE FROM daily_logs WHERE date = $1 RETURNING date', [date]);
  return { deleted: rows.length };
}

export async function deleteAll(db: Db): Promise<{ deleted: number }> {
  const rows = await db.query('DELETE FROM daily_logs RETURNING date');
  return { deleted: rows.length };
}

// ---------- dispatcher ----------

export async function handleRequest(body: unknown, db: Db): Promise<unknown> {
  if (!body || typeof body !== 'object') throw new ApiError('Invalid JSON body');
  const b = body as Record<string, unknown>;
  const action = String(b.action ?? '');
  if (action === 'ping') return { ok: true };

  await ensureSchema(db);
  switch (action) {
    case 'getAll':
      return getAll(db);
    case 'getByDate':
      return getByDate(db, b.date);
    case 'upsert':
      return upsertOne(db, validateRecord(b.data));
    case 'upsertMany': {
      if (!Array.isArray(b.data)) throw new ApiError('Expected an array');
      if (b.data.length > 500) throw new ApiError('Too many records (max 500)');
      const records = b.data.map(validateRecord);
      const results: string[] = [];
      for (const rec of records) results.push((await upsertOne(db, rec)).action);
      return { count: results.length, results };
    }
    case 'delete':
      return deleteByDate(db, b.date);
    case 'deleteAll':
      if (b.confirm !== 'DELETE_ALL') throw new ApiError('Confirmation missing');
      return deleteAll(db);
    default:
      throw new ApiError(`Unknown action: ${action.slice(0, 40)}`);
  }
}

/** Constant-time string comparison so response timing does not leak the secret. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function extractSecret(headers: { get(name: string): string | null }, body: unknown): string {
  const auth = headers.get('authorization') ?? '';
  if (auth.toLowerCase().startsWith('bearer ')) return auth.slice(7).trim();
  if (body && typeof body === 'object' && typeof (body as Record<string, unknown>).secret === 'string') {
    return (body as Record<string, string>).secret;
  }
  return '';
}
