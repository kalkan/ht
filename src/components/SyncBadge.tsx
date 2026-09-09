import { useSyncState } from '../hooks/useSyncState';
import { cx } from '../utils/cx';

/** Subtle sync indicator shown in page headers. */
export function SyncBadge({ className }: { className?: string }) {
  const s = useSyncState();
  let label: string;
  let dot: string;
  if (!s.configured) {
    label = 'Yalnızca yerel';
    dot = 'bg-faint';
  } else if (s.phase === 'syncing') {
    label = 'Senkronize ediliyor…';
    dot = 'bg-accent animate-pulse';
  } else if (s.phase === 'offline') {
    label = s.pendingCount > 0 ? 'Çevrimdışı · bekliyor' : 'Çevrimdışı';
    dot = 'bg-faint';
  } else if (s.phase === 'error') {
    label = 'Senkronizasyon hatası';
    dot = 'bg-danger';
  } else if (s.pendingCount > 0) {
    label = 'Senkronizasyon bekliyor';
    dot = 'bg-warning';
  } else {
    label = 'Bulut ile senkronize';
    dot = 'bg-success';
  }
  return (
    <span className={cx('inline-flex items-center gap-1.5 text-[12px] font-medium text-muted', className)} aria-live="polite">
      <span className={cx('h-2 w-2 rounded-full', dot)} aria-hidden="true" />
      {label}
    </span>
  );
}
