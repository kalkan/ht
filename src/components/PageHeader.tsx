import type { ReactNode } from 'react';
import { SyncBadge } from './SyncBadge';

export function PageHeader({
  eyebrow,
  title,
  subtitle,
  right,
}: {
  eyebrow: string;
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
}) {
  return (
    <header className="mb-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-bold uppercase tracking-[0.18em] text-accent">{eyebrow}</p>
        <SyncBadge />
      </div>
      <h1 className="mt-1 text-[30px] font-bold leading-tight tracking-tight text-ink">{title}</h1>
      <div className="mt-0.5 flex items-center justify-between gap-3">
        {subtitle ? <p className="text-[16px] text-muted">{subtitle}</p> : <span />}
        {right}
      </div>
    </header>
  );
}
