import type { SyncStatus, WorkoutType } from '../types/DailyLog';

export const WORKOUT_LABELS: Record<WorkoutType, string> = {
  push: 'Push',
  pull: 'Pull',
  legs_core: 'Bacak + Core',
  cardio: 'Kardiyo',
  none: 'Yapmadım',
};

export const SYNC_STATUS_LABELS: Record<SyncStatus, string> = {
  synced: 'Bulut ile senkronize',
  pending: 'Senkronizasyon bekliyor',
  error: 'Senkronizasyon hatası',
};

export function formatWeight(kg: number | undefined | null): string {
  if (kg === undefined || kg === null || Number.isNaN(kg)) return '—';
  return `${kg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function formatSignedWeight(kg: number): string {
  const sign = kg > 0 ? '+' : '';
  return `${sign}${kg.toLocaleString('tr-TR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} kg`;
}

export function formatPercent(ratio: number | null): string {
  if (ratio === null || Number.isNaN(ratio)) return '—';
  return `%${Math.round(ratio * 100)}`;
}

export function formatDecimal(n: number | null, digits = 1): string {
  if (n === null || Number.isNaN(n)) return '—';
  return n.toLocaleString('tr-TR', { minimumFractionDigits: 0, maximumFractionDigits: digits });
}
