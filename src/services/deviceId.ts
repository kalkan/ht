import { META_KEYS, getMeta, newId, setMeta } from '../db/database';

const LS_KEY = 'daily-tracker:deviceId';
let cached: string | null = null;

/**
 * A random, informational device identifier. Generated once, persisted in
 * both localStorage and IndexedDB (so it survives either being cleared).
 * No hardware identifiers are ever read.
 */
export async function getDeviceId(): Promise<string> {
  if (cached) return cached;

  let fromLs: string | null = null;
  try {
    fromLs = localStorage.getItem(LS_KEY);
  } catch {
    /* localStorage may be unavailable in private mode */
  }

  let fromDb: string | undefined;
  try {
    fromDb = await getMeta(META_KEYS.deviceId);
  } catch {
    /* IndexedDB failure: fall back to localStorage */
  }

  const id = fromDb ?? fromLs ?? newId();
  cached = id;

  try {
    if (fromLs !== id) localStorage.setItem(LS_KEY, id);
  } catch {
    /* ignore */
  }
  try {
    if (fromDb !== id) await setMeta(META_KEYS.deviceId, id);
  } catch {
    /* ignore */
  }
  return id;
}
