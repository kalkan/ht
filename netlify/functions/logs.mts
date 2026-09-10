/**
 * Netlify Function: POST /api/logs
 *
 * Environment variables (Netlify → Site configuration → Environment variables):
 *   APP_SECRET             the PIN/secret the app sends as "Authorization: Bearer …"
 *   NETLIFY_DATABASE_URL   set automatically by Netlify DB (Neon), or
 *   DATABASE_URL           a Neon connection string you paste yourself
 */
import type { Config, Context } from '@netlify/functions';
import { neon } from '@neondatabase/serverless';
import { ApiError, extractSecret, handleRequest, safeEqual, type ApiResponse, type Db } from '../lib/logsApi';

let cachedDb: Db | null = null;

function getDb(): Db {
  if (cachedDb) return cachedDb;
  const url = process.env.NETLIFY_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new ApiError('Database is not configured (DATABASE_URL missing)', 500);
  const sql = neon(url);
  cachedDb = {
    async query<T>(text: string, params?: unknown[]): Promise<T[]> {
      const rows = await sql.query(text, params ?? []);
      return rows as T[];
    },
  };
  return cachedDb;
}

function json(body: ApiResponse, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });
}

export default async function handler(req: Request, _context: Context): Promise<Response> {
  if (req.method === 'GET') {
    return json({ success: true, data: { ok: true, message: 'Daily Tracker API. Use POST.' } });
  }
  if (req.method !== 'POST') return json({ success: false, error: 'Method not allowed' }, 405);

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json({ success: false, error: 'Invalid JSON body' }, 400);
  }

  const secret = process.env.APP_SECRET ?? '';
  if (secret.length < 6) return json({ success: false, error: 'Server APP_SECRET is not configured' }, 500);
  const provided = extractSecret(req.headers, body);
  if (!safeEqual(provided, secret)) {
    // Small delay to make brute-forcing the PIN slower.
    await new Promise((r) => setTimeout(r, 400));
    return json({ success: false, error: 'Unauthorized' }, 401);
  }

  try {
    const data = await handleRequest(body, getDb());
    return json({ success: true, data });
  } catch (err) {
    if (err instanceof ApiError) return json({ success: false, error: err.message }, err.status);
    console.error('logs function error', err);
    // Never leak stack traces or connection details to the client.
    return json({ success: false, error: 'Internal error' }, 500);
  }
}

export const config: Config = {
  path: '/api/logs',
};
