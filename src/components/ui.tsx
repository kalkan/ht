import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

import { cx } from '../utils/cx';

// ---------- Card ----------

export function Card({
  title,
  children,
  className,
  action,
}: {
  title?: string;
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  return (
    <section
      className={cx(
        'rounded-xl2 bg-card border border-line shadow-card dark:shadow-card-dark p-4 sm:p-5 animate-fade-in',
        className,
      )}
    >
      {(title || action) && (
        <header className="mb-3 flex items-center justify-between gap-3">
          {title && (
            <h2 className="text-[13px] font-semibold uppercase tracking-wider text-muted">{title}</h2>
          )}
          {action}
        </header>
      )}
      {children}
    </section>
  );
}

// ---------- Buttons ----------

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'danger-outline';

const VARIANT_CLASS: Record<Variant, string> = {
  primary: 'bg-accent text-accent-ink hover:opacity-95 active:opacity-90 shadow-sm',
  secondary: 'bg-elevated text-ink hover:bg-line/60 active:bg-line',
  ghost: 'bg-transparent text-accent hover:bg-elevated active:bg-line',
  danger: 'bg-danger text-white hover:opacity-95 active:opacity-90',
  'danger-outline': 'bg-transparent text-danger border border-danger/40 hover:bg-danger/5 active:bg-danger/10',
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: Variant;
    size?: 'sm' | 'md' | 'lg';
    fullWidth?: boolean;
    loading?: boolean;
  }
>(function Button({ variant = 'primary', size = 'md', fullWidth, className, children, loading, ...rest }, ref) {
  const sizeClass =
    size === 'lg'
      ? 'min-h-[56px] px-6 text-[17px]'
      : size === 'sm'
        ? 'min-h-[40px] px-3.5 text-[14px]'
        : 'min-h-[48px] px-4 text-[15px]';
  return (
    <button
      type="button"
      {...rest}
      ref={ref}
      disabled={rest.disabled || loading}
      className={cx(
        'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition-all duration-150 select-none',
        'disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
        VARIANT_CLASS[variant],
        sizeClass,
        fullWidth && 'w-full',
        className,
      )}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin', className)}
    />
  );
}

// ---------- Segmented control ----------

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  columns,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
  label: string;
  columns?: 2 | 3;
}) {
  const grid = columns === 3 ? 'grid-cols-3' : 'grid-cols-2';
  return (
    <div role="radiogroup" aria-label={label} className={cx('grid gap-2', grid)}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o.value)}
            className={cx(
              'min-h-[52px] rounded-2xl px-3 text-[15px] font-semibold transition-all duration-150 active:scale-[0.97]',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              selected
                ? 'bg-accent text-accent-ink shadow-sm'
                : 'bg-elevated text-ink hover:bg-line/60',
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------- Yes / No ----------

export function YesNo({
  value,
  onChange,
  label,
  positiveIsGood = true,
}: {
  value: boolean | null;
  onChange: (v: boolean) => void;
  label: string;
  /** When false, "Evet" is the undesirable answer (e.g. alcohol). Only affects the tint. */
  positiveIsGood?: boolean;
}) {
  const yesSelected = value === true;
  const noSelected = value === false;
  const yesTint = positiveIsGood ? 'bg-success text-white' : 'bg-warning text-white';
  const noTint = positiveIsGood ? 'bg-warning text-white' : 'bg-success text-white';
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-2 gap-2">
      <button
        type="button"
        role="radio"
        aria-checked={yesSelected}
        onClick={() => onChange(true)}
        className={cx(
          'min-h-[52px] rounded-2xl text-[16px] font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          yesSelected ? yesTint + ' shadow-sm' : 'bg-elevated text-ink hover:bg-line/60',
        )}
      >
        Evet
      </button>
      <button
        type="button"
        role="radio"
        aria-checked={noSelected}
        onClick={() => onChange(false)}
        className={cx(
          'min-h-[52px] rounded-2xl text-[16px] font-semibold transition-all duration-150 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
          noSelected ? noTint + ' shadow-sm' : 'bg-elevated text-ink hover:bg-line/60',
        )}
      >
        Hayır
      </button>
    </div>
  );
}

// ---------- Stepper ----------

export function Stepper({
  value,
  onChange,
  min = 0,
  max = 200,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const dec = () => onChange(Math.max(min, value - 1));
  const inc = () => onChange(Math.min(max, value + 1));
  const btn =
    'h-14 w-14 rounded-2xl bg-elevated text-ink text-2xl font-semibold leading-none transition-all duration-150 active:scale-95 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60';
  return (
    <div className="flex items-center justify-between" role="group" aria-label={label}>
      <button type="button" onClick={dec} disabled={value <= min} aria-label="Azalt" className={btn}>
        −
      </button>
      <output className="text-4xl font-semibold tabular-nums text-ink" aria-live="polite" aria-label={`${label}: ${value}`}>
        {value}
      </output>
      <button type="button" onClick={inc} disabled={value >= max} aria-label="Artır" className={btn}>
        +
      </button>
    </div>
  );
}

// ---------- Misc ----------

export function EmptyState({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center animate-fade-in">
      {icon && <div className="text-4xl opacity-60" aria-hidden="true">{icon}</div>}
      <p className="text-[16px] font-semibold text-ink">{title}</p>
      {hint && <p className="max-w-xs text-[14px] text-muted">{hint}</p>}
    </div>
  );
}

export function Stat({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  tone?: 'default' | 'good' | 'bad';
}) {
  const toneClass = tone === 'good' ? 'text-success' : tone === 'bad' ? 'text-danger' : 'text-ink';
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cx('text-[28px] font-semibold leading-tight tabular-nums', toneClass)}>{value}</span>
      {sub && <span className="text-[13px] text-muted">{sub}</span>}
    </div>
  );
}

export function Pill({ children, tone = 'default' }: { children: ReactNode; tone?: 'default' | 'good' | 'warn' | 'bad' }) {
  const cls =
    tone === 'good'
      ? 'bg-success/12 text-success'
      : tone === 'warn'
        ? 'bg-warning/15 text-warning'
        : tone === 'bad'
          ? 'bg-danger/12 text-danger'
          : 'bg-elevated text-muted';
  return <span className={cx('inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold', cls)}>{children}</span>;
}

export function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-line last:border-b-0">
      <span className="text-[15px] text-muted">{label}</span>
      <span className="text-[15px] font-semibold text-ink text-right">{value}</span>
    </div>
  );
}
