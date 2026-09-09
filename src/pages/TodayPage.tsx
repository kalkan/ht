import { useEffect, useState } from 'react';
import { LogForm } from '../components/LogForm';
import { PageHeader } from '../components/PageHeader';
import { Card, Pill } from '../components/ui';
import { useAllLogs, useLogByDate } from '../hooks/useLogs';
import { useToast } from '../hooks/useToast';
import { upsertLogForDate } from '../db/database';
import { syncInBackground } from '../services/syncService';
import type { DailyLogInput } from '../types/DailyLog';
import { currentStreak } from '../utils/analytics';
import { formatLongDateTr, fromDateKey, todayKey, weekdayNameTr } from '../utils/dateUtils';
import { useInstallHint } from '../hooks/useInstallHint';

/** Re-evaluates "today" when the app is reopened after midnight. */
function useToday(): string {
  const [today, setToday] = useState(todayKey);
  useEffect(() => {
    const check = () => setToday((t) => (t === todayKey() ? t : todayKey()));
    const id = setInterval(check, 60_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return today;
}

export function TodayPage() {
  const today = useToday();
  const { log } = useLogByDate(today);
  const { logs } = useAllLogs();
  const { show } = useToast();
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const install = useInstallHint();

  const streak = currentStreak(logs, today);

  const onSave = async (input: DailyLogInput) => {
    setSaving(true);
    try {
      await upsertLogForDate(today, input);
      setSavedAt(Date.now());
      show('Bugünün kaydı kaydedildi.', 'success');
      syncInBackground();
    } catch (e) {
      show(e instanceof Error ? `Kaydedilemedi: ${e.message}` : 'Kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        eyebrow="Daily"
        title={formatLongDateTr(today)}
        subtitle={weekdayNameTr(fromDateKey(today))}
        right={
          log ? <Pill tone="good">Bugün kaydedildi</Pill> : <Pill>Henüz kaydedilmedi</Pill>
        }
      />

      {streak > 0 && (
        <div className="flex items-center gap-2 rounded-2xl bg-accent/10 px-4 py-2.5 text-[14px] font-medium text-accent">
          <span aria-hidden="true">🔥</span>
          {streak} günlük kayıt serisi
        </div>
      )}

      {install.show && (
        <Card className="border-accent/30">
          <p className="text-[15px] font-semibold text-ink">Ana ekrana ekle</p>
          <p className="mt-1 text-[13px] text-muted">
            Safari'de <strong>Paylaş</strong> → <strong>Ana Ekrana Ekle</strong> ile Daily'yi uygulama gibi kullanabilirsin.
          </p>
          <button type="button" onClick={install.dismiss} className="mt-2 text-[13px] font-semibold text-accent">
            Anladım
          </button>
        </Card>
      )}

      {savedAt && log && (
        <p role="status" className="rounded-2xl bg-success/10 px-4 py-2.5 text-[14px] font-medium text-success animate-fade-in">
          Bugünün kaydı kaydedildi.
        </p>
      )}

      {log === undefined ? (
        <p className="py-10 text-center text-[14px] text-muted">Yükleniyor…</p>
      ) : (
        <LogForm key={today} date={today} existing={log} onSave={onSave} saving={saving} />
      )}
    </div>
  );
}
