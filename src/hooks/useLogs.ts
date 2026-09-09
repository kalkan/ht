import { useLiveQuery } from 'dexie-react-hooks';
import { useEffect, useState } from 'react';
import { db, getLastWeightBefore, getLogByDate } from '../db/database';
import type { DailyLog } from '../types/DailyLog';

export interface LogsQuery {
  logs: DailyLog[];
  loading: boolean;
  error: string | null;
}

/** Live, sorted list of every log. Re-renders automatically when IndexedDB changes. */
export function useAllLogs(): LogsQuery {
  const [error, setError] = useState<string | null>(null);
  const logs = useLiveQuery(
    async () => {
      try {
        const rows = await db.dailyLogs.orderBy('date').toArray();
        setError(null);
        return rows;
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Veritabanı okunamadı.');
        return [] as DailyLog[];
      }
    },
    [],
    undefined,
  );
  return { logs: logs ?? [], loading: logs === undefined, error };
}

export function useLogByDate(date: string): { log: DailyLog | null | undefined } {
  const log = useLiveQuery(() => getLogByDate(date).then((l) => l ?? null), [date], undefined);
  return { log };
}

/** The most recent weight recorded strictly before `date`. */
export function useLastWeightBefore(date: string): DailyLog | null {
  const [last, setLast] = useState<DailyLog | null>(null);
  const all = useLiveQuery(() => db.dailyLogs.where('date').below(date).count(), [date]);
  useEffect(() => {
    let cancelled = false;
    getLastWeightBefore(date)
      .then((l) => {
        if (!cancelled) setLast(l ?? null);
      })
      .catch(() => {
        if (!cancelled) setLast(null);
      });
    return () => {
      cancelled = true;
    };
  }, [date, all]);
  return last;
}
