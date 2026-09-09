import { useEffect, useId, useRef, useState } from 'react';
import { Button } from './ui';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  /** When set, the user must type this word before confirming. */
  typeToConfirm?: string;
  danger?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  typeToConfirm,
  danger,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const descId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      setBusy(false);
      return;
    }
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;
  const canConfirm = !typeToConfirm || typed.trim().toLocaleUpperCase('tr-TR') === typeToConfirm.toLocaleUpperCase('tr-TR');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] animate-fade-in"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-xl3 bg-card p-5 shadow-xl border border-line animate-toast-in"
      >
        <h2 id={titleId} className="text-[19px] font-semibold text-ink">
          {title}
        </h2>
        <p id={descId} className="mt-2 text-[15px] leading-relaxed text-muted whitespace-pre-line">
          {message}
        </p>
        {typeToConfirm && (
          <label className="mt-4 block">
            <span className="text-[13px] text-muted">
              Onaylamak için <strong className="text-ink">{typeToConfirm}</strong> yazın
            </span>
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              autoCapitalize="characters"
              autoComplete="off"
              className="mt-1.5 w-full rounded-2xl border border-line bg-elevated px-4 py-3 text-[16px] text-ink focus:outline-none focus:ring-2 focus:ring-accent/60"
            />
          </label>
        )}
        <div className="mt-5 grid grid-cols-2 gap-2">
          <Button ref={cancelRef} variant="secondary" onClick={onCancel}>
            Vazgeç
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            disabled={!canConfirm}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onConfirm();
              } finally {
                setBusy(false);
              }
            }}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
