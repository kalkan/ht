import { Button } from './ui';

export function UpdateBanner({ onUpdate, onDismiss }: { onUpdate: () => void; onDismiss: () => void }) {
  return (
    <div
      role="status"
      className="fixed inset-x-0 top-0 z-50 flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] animate-toast-in"
    >
      <div className="flex w-full max-w-lg items-center justify-between gap-3 rounded-2xl border border-line bg-card px-4 py-3 shadow-lg">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">Yeni sürüm mevcut.</p>
          <p className="text-[12px] text-muted">Kaydedilmemiş değişiklikleriniz korunur.</p>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button size="sm" variant="ghost" onClick={onDismiss} aria-label="Daha sonra">
            Sonra
          </Button>
          <Button size="sm" onClick={onUpdate}>
            Güncelle
          </Button>
        </div>
      </div>
    </div>
  );
}
