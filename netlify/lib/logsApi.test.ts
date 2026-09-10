import { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { extractSecret, handleRequest, resetSchemaCache, safeEqual, type Db } from './logsApi';

let pg: PGlite;
let db: Db;

beforeAll(async () => {
  pg = new PGlite();
  db = {
    query: async (text, params) => (await pg.query(text, params as never[])).rows as never[],
  };
});
afterAll(async () => {
  await pg.close();
});
beforeEach(async () => {
  await pg.exec('DROP TABLE IF EXISTS daily_logs');
  resetSchemaCache();
});

const rec = (over: Record<string, unknown> = {}) => ({
  id: 'a1',
  date: '2026-09-09',
  workout: 'push',
  cigarettes: 3,
  water_enough: true,
  alcohol: false,
  healthy_diet: true,
  weight: 78.2,
  created_at: '2026-09-09T10:00:00.000Z',
  updated_at: '2026-09-09T10:00:00.000Z',
  device_id: 'dev-1',
  ...over,
});

describe('handleRequest', () => {
  it('ping does not need the database', async () => {
    expect(await handleRequest({ action: 'ping' }, db)).toEqual({ ok: true });
  });

  it('creates the table and inserts, then getAll returns the row', async () => {
    const r = (await handleRequest({ action: 'upsert', data: rec() }, db)) as { action: string };
    expect(r.action).toBe('inserted');
    const all = (await handleRequest({ action: 'getAll' }, db)) as Record<string, unknown>[];
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: 'a1', date: '2026-09-09', workout: 'push', cigarettes: 3, weight: 78.2, water_enough: true });
  });

  it('never creates a second row for the same date', async () => {
    await handleRequest({ action: 'upsert', data: rec() }, db);
    const r = (await handleRequest({ action: 'upsert', data: rec({ id: 'other', cigarettes: 5, updated_at: '2026-09-09T11:00:00.000Z' }) }, db)) as { action: string; record: { id: string; cigarettes: number } };
    expect(r.action).toBe('updated');
    expect(r.record.id).toBe('a1'); // original id preserved
    expect(r.record.cigarettes).toBe(5);
    const all = (await handleRequest({ action: 'getAll' }, db)) as unknown[];
    expect(all).toHaveLength(1);
  });

  it('last-write-wins: older update is skipped', async () => {
    await handleRequest({ action: 'upsert', data: rec({ updated_at: '2026-09-09T12:00:00.000Z', cigarettes: 9 }) }, db);
    const r = (await handleRequest({ action: 'upsert', data: rec({ updated_at: '2026-09-09T11:00:00.000Z', cigarettes: 1 }) }, db)) as { action: string; record: { cigarettes: number } };
    expect(r.action).toBe('skipped');
    expect(r.record.cigarettes).toBe(9);
  });

  it('stores missing weight as null, never zero', async () => {
    await handleRequest({ action: 'upsert', data: rec({ weight: null }) }, db);
    const row = (await handleRequest({ action: 'getByDate', date: '2026-09-09' }, db)) as { weight: unknown };
    expect(row.weight).toBeNull();
    await expect(handleRequest({ action: 'upsert', data: rec({ weight: 0 }) }, db)).rejects.toThrow('Invalid weight');
  });

  it('upsertMany handles a batch and reports actions', async () => {
    const r = (await handleRequest(
      { action: 'upsertMany', data: [rec(), rec({ id: 'b', date: '2026-09-10' }), rec({ id: 'c', date: '2026-09-10', updated_at: '2026-09-10T10:00:00.000Z' })] },
      db,
    )) as { count: number; results: string[] };
    expect(r.count).toBe(3);
    expect(r.results).toEqual(['inserted', 'inserted', 'updated']);
    expect((await handleRequest({ action: 'getAll' }, db)) as unknown[]).toHaveLength(2);
  });

  it('rejects malformed input with clear errors', async () => {
    await expect(handleRequest({ action: 'upsert', data: rec({ date: '2026-13-40' }) }, db)).rejects.toThrow('Invalid date');
    await expect(handleRequest({ action: 'upsert', data: rec({ workout: 'yoga' }) }, db)).rejects.toThrow('Invalid workout');
    await expect(handleRequest({ action: 'upsert', data: rec({ cigarettes: -1 }) }, db)).rejects.toThrow('Invalid cigarettes');
    await expect(handleRequest({ action: 'nope' }, db)).rejects.toThrow('Unknown action');
    await expect(handleRequest({ action: 'deleteAll' }, db)).rejects.toThrow('Confirmation missing');
    await expect(handleRequest('x', db)).rejects.toThrow('Invalid JSON body');
  });

  it('delete and deleteAll', async () => {
    await handleRequest({ action: 'upsertMany', data: [rec(), rec({ id: 'b', date: '2026-09-10' })] }, db);
    expect(await handleRequest({ action: 'delete', date: '2026-09-09' }, db)).toEqual({ deleted: 1 });
    expect(await handleRequest({ action: 'delete', date: '2026-09-09' }, db)).toEqual({ deleted: 0 });
    expect(await handleRequest({ action: 'deleteAll', confirm: 'DELETE_ALL' }, db)).toEqual({ deleted: 1 });
    expect((await handleRequest({ action: 'getAll' }, db)) as unknown[]).toHaveLength(0);
  });

  it('getByDate returns null for unknown dates', async () => {
    expect(await handleRequest({ action: 'getByDate', date: '2020-01-01' }, db)).toBeNull();
  });
});

describe('auth helpers', () => {
  it('safeEqual compares strictly', () => {
    expect(safeEqual('abc', 'abc')).toBe(true);
    expect(safeEqual('abc', 'abd')).toBe(false);
    expect(safeEqual('abc', 'ab')).toBe(false);
  });
  it('extractSecret prefers the bearer header, falls back to body', () => {
    const h = new Headers({ authorization: 'Bearer  s3cret ' });
    expect(extractSecret(h, {})).toBe('s3cret');
    expect(extractSecret(new Headers(), { secret: 'body' })).toBe('body');
    expect(extractSecret(new Headers(), {})).toBe('');
  });
});
