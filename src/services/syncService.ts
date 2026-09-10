/**
 * Offline-first sync engine.
 *
 *  1. Every save writes to IndexedDB first and marks the row `pending`.
 *  2. `syncNow()` pushes pending rows and pulls the full remote set, merging
 *     with last-write-wins on `updatedAt` (documented in README).
 *  3. Failures never block local usage: rows stay `pending`/`error` and are
 *     retried on app start, on reconnect, and on manual "Şimdi Senkronize Et".
 *
 * The backend is the Netlify Function in netlify/functions/logs.mts (Neon Postgres).
 */
import { META_KEYS, db, getMeta, getPendingLogs, setMeta, deleteMeta } from '../db/database';
import type { DailyLog } from '../types/DailyLog';
import { nowIso } from '../utils/dateUtils';
import { isCloudConfigured, onCloudSecretChange, setCloudSecret } from './config';
import { getDeviceId } from './deviceId';
import * as api from './cloudApi';

export type SyncPhase = 'idle' | 'syncing' | 'error' | 'unconfigured' | 'offline';

export interface SyncState {
  phase: SyncPhase;
  lastSyncAt: string | null;
  lastError: string | null;
  pendingCount: number;
  configured: boolean;
  online: boolean;
}

type Listener = (state: SyncState) => void;

const listeners = new Set<Listener>();
let state: SyncState = {
  phase: isCloudConfigured() ? 'idle' : 'unconfigured',
  lastSyncAt: null,
  lastError: null,
  pendingCount: 0,
  configured: isCloudConfigured(),
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
};
let inFlight: Promise<SyncResult> | null = null;
let queuedAgain = false;

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  error?: string;
}

function emit(): void {
  for (const l of listeners) l(state);
}

function patch(p: Partial<SyncState>): void {
  state = { ...state, ...p };
  emit();
}

export function getSyncState(): SyncState {
  return state;
}

export function subscribeSync(listener: Listener): () => void {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/** Refresh derived bits of state from the database (pending count, last sync). */
export async function refreshSyncState(): Promise<void> {
  try {
    const [pending, lastSyncAt, lastError] = await Promise.all([
      getPendingLogs(),
      getMeta(META_KEYS.lastSyncAt),
      getMeta(META_KEYS.lastSyncError),
    ]);
    patch({
      pendingCount: pending.length,
      lastSyncAt: lastSyncAt ?? null,
      lastError: lastError ?? null,
      phase: state.phase === 'syncing' ? 'syncing' : derivePhase(lastError ?? null),
    });
  } catch {
    /* IndexedDB unavailable: keep whatever we have */
  }
}

function derivePhase(lastError: string | null): SyncPhase {
  if (!isCloudConfigured()) return 'unconfigured';
  if (!state.online) return 'offline';
  return lastError ? 'error' : 'idle';
}

/**
 * Merge remote rows into the local database using last-write-wins on updatedAt.
 * Returns how many local rows were created/updated from remote data.
 */
export async function mergeRemoteIntoLocal(remote: DailyLog[]): Promise<number> {
  let changed = 0;
  await db.transaction('rw', db.dailyLogs, async () => {
    const localAll = await db.dailyLogs.toArray();
    const localByDate = new Map(localAll.map((l) => [l.date, l]));
    for (const r of remote) {
      const local = localByDate.get(r.date);
      if (!local) {
        await db.dailyLogs.add({ ...r, syncStatus: 'synced' });
        changed += 1;
        continue;
      }
      if (r.updatedAt > local.updatedAt) {
        // Remote is newer: overwrite local, keep local primary key.
        const merged: DailyLog = { ...r, id: local.id, syncStatus: 'synced' };
        if (merged.weight === undefined) delete merged.weight;
        await db.dailyLogs.put(merged);
        changed += 1;
      } else if (r.updatedAt === local.updatedAt && local.syncStatus !== 'synced') {
        // Same version already in the cloud: just mark it synced.
        await db.dailyLogs.update(local.id, { syncStatus: 'synced' });
      }
      // else: local is newer and pending -> it will be pushed.
    }
  });
  return changed;
}

async function runSync(): Promise<SyncResult> {
  if (!isCloudConfigured()) {
    patch({ phase: 'unconfigured' });
    return { ok: false, pushed: 0, pulled: 0, error: 'Bulut senkronizasyonu yapılandırılmadı.' };
  }
  if (!state.online) {
    patch({ phase: 'offline' });
    await refreshSyncState();
    return { ok: false, pushed: 0, pulled: 0, error: 'Çevrimdışı' };
  }

  patch({ phase: 'syncing' });
  const deviceId = await getDeviceId();
  let pushed = 0;
  let pulled = 0;
  try {
    // 1. Pull remote first so we know which local pending rows are actually stale.
    const remote = await api.getAll();
    pulled = await mergeRemoteIntoLocal(remote);

    // 2. Push whatever is still pending (local newer than remote, or never uploaded).
    const pending = await getPendingLogs();
    if (pending.length > 0) {
      await api.upsertMany(pending, deviceId);
      await db.dailyLogs.bulkPut(pending.map((p) => ({ ...p, syncStatus: 'synced' as const })));
      pushed = pending.length;
    }

    await setMeta(META_KEYS.lastSyncAt, nowIso());
    await deleteMeta(META_KEYS.lastSyncError);
    patch({ phase: 'idle', lastError: null });
    await refreshSyncState();
    return { ok: true, pushed, pulled };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Bilinmeyen senkronizasyon hatası.';
    try {
      // Mark pending rows as error so the UI can show it; they stay retryable.
      const pending = await getPendingLogs();
      if (pending.length > 0) {
        await db.dailyLogs.bulkPut(pending.map((p) => ({ ...p, syncStatus: 'error' as const })));
      }
      await setMeta(META_KEYS.lastSyncError, message);
    } catch {
      /* ignore secondary failures */
    }
    patch({ phase: 'error', lastError: message });
    await refreshSyncState();
    return { ok: false, pushed, pulled, error: message };
  }
}

/** Run a sync. Concurrent calls are coalesced into one (plus one follow-up). */
export function syncNow(): Promise<SyncResult> {
  if (inFlight) {
    queuedAgain = true;
    return inFlight;
  }
  inFlight = runSync().finally(() => {
    inFlight = null;
    if (queuedAgain) {
      queuedAgain = false;
      void syncNow();
    }
  });
  return inFlight;
}

/** Fire-and-forget background sync used after saves. Never throws. */
export function syncInBackground(): void {
  if (!isCloudConfigured() || !state.online) {
    void refreshSyncState();
    return;
  }
  void syncNow().catch(() => undefined);
}

/** Delete a date locally and, when configured, remotely. Local deletion never waits for the cloud. */
export async function deleteDateEverywhere(date: string): Promise<{ cloudOk: boolean }> {
  await db.dailyLogs.where('date').equals(date).delete();
  await refreshSyncState();
  if (!isCloudConfigured() || !state.online) return { cloudOk: false };
  try {
    await api.deleteByDate(date);
    return { cloudOk: true };
  } catch {
    return { cloudOk: false };
  }
}

export async function deleteAllCloudData(): Promise<void> {
  await api.deleteAll();
}

export async function testConnection(): Promise<boolean> {
  return api.ping();
}

/**
 * Store (or clear) the cloud secret and immediately try a sync with it.
 * Any previous sync error is cleared because it may have been caused by the old secret.
 */
export async function updateCloudSecret(secret: string): Promise<SyncResult | null> {
  setCloudSecret(secret);
  try {
    await deleteMeta(META_KEYS.lastSyncError);
  } catch {
    /* ignore */
  }
  patch({ configured: isCloudConfigured(), lastError: null, phase: derivePhase(null) });
  if (!isCloudConfigured()) return null;
  return syncNow();
}

let started = false;

/** Wire up online/offline listeners and run the initial sync. Idempotent. */
export function startSyncService(): void {
  if (started || typeof window === 'undefined') return;
  started = true;

  onCloudSecretChange(() => patch({ configured: isCloudConfigured(), phase: derivePhase(state.lastError) }));

  window.addEventListener('online', () => {
    patch({ online: true, phase: derivePhase(state.lastError) });
    syncInBackground();
  });
  window.addEventListener('offline', () => {
    patch({ online: false, phase: 'offline' });
  });
  // When the PWA returns to the foreground, retry if anything is pending.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.pendingCount > 0) syncInBackground();
  });

  void refreshSyncState().then(() => syncInBackground());
}
