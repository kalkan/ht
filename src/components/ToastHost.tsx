import { useToast } from '../hooks/useToast';
import { cx } from '../utils/cx';

export function ToastHost() {
  const { toasts, dismiss } = useToast();
  if (toasts.length === 0) return null;
  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-[calc(72px+env(safe-area-inset-bottom))] z-50 flex flex-col items-center gap-2 px-4"
      aria-live="polite"
    >
      {toasts.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => dismiss(t.id)}
          className={cx(
            'pointer-events-auto max-w-sm rounded-2xl px-4 py-3 text-[14px] font-medium shadow-lg animate-toast-in border',
            t.kind === 'success' && 'bg-success text-white border-success',
            t.kind === 'error' && 'bg-danger text-white border-danger',
            t.kind === 'info' && 'bg-ink text-bg border-ink',
          )}
        >
          {t.message}
        </button>
      ))}
    </div>
  );
}
