import { useMemo, useState } from 'react';
import { LogForm } from '../components/LogForm';
import { PageHeader } from '../components/PageHeader';
import { Button, Card, EmptyState, Pill, Row } from '../components/ui';
import { cx } from '../utils/cx';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useAllLogs } from '../hooks/useLogs';
import { useToast } from '../hooks/useToast';
import { upsertLogForDate } from '../db/database';
import { deleteDateEverywhere, syncInBackground } from '../services/syncService';
import type { DailyLog, DailyLogInput } from '../types/DailyLog';
import {
  WEEKDAY_SHORT_TR,
  addDays,
  daysInMonth,
  formatLongDateTr,
  formatMonthTr,
  fromDateKey,
  mondayFirstIndex,
  monthRange,
  nextMonth,
  previousMonth,
  todayKey,
  toDateKey,
  weekdayNameTr,
} from '../utils/dateUtils';
import { WORKOUT_LABELS, formatWeight } from '../utils/labels';
import { monthCompletion } from '../utils/analytics';

export function HistoryPage() {
  const { logs, loading } = useAllLogs();
  const { show } = useToast();
  const today = todayKey();
  const t = fromDateKey(today);
  const [year, setYear] = useState(t.getFullYear());
  const [month, setMonth] = useState(t.getMonth());
  const [selected, setSelected] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const byDate = useMemo(() => new Map(logs.map((l) => [l.date, l])), [logs]);
  const selectedLog: DailyLog | null = selected ? (byDate.get(selected) ?? null) : null;
  const completion = monthCompletion(logs, year, month, today);

  const goPrev = () => {
    const p = previousMonth(year, month);
    setYear(p.year);
    setMonth(p.month);
    setSelected(null);
    setEditing(false);
  };
  const goNext = () => {
    const n = nextMonth(year, month);
    setYear(n.year);
    setMonth(n.month);
    setSelected(null);
    setEditing(false);
  };
  const goToday = () => {
    setYear(t.getFullYear());
    setMonth(t.getMonth());
    setSelected(today);
    setEditing(false);
  };

  const selectDay = (key: string) => {
    if (key > today) return;
    setSelected(key);
    setEditing(false);
    // Keep the calendar on the month of the selected day.
    const d = fromDateKey(key);
    setYear(d.getFullYear());
    setMonth(d.getMonth());
  };

  const step = (delta: number) => {
    if (!selected) return;
    const next = addDays(selected, delta);
    if (next > today) return;
    selectDay(next);
  };

  const onSave = async (input: DailyLogInput) => {
    if (!selected) return;
    setSaving(true);
    try {
      await upsertLogForDate(selected, input);
      setEditing(false);
      show('Kayıt güncellendi.', 'success');
      syncInBackground();
    } catch (e) {
      show(e instanceof Error ? `Kaydedilemedi: ${e.message}` : 'Kaydedilemedi.', 'error');
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!selected) return;
    const res = await deleteDateEverywhere(selected);
    setConfirmDelete(false);
    setEditing(false);
    show(res.cloudOk ? 'Kayıt silindi.' : 'Kayıt yerelde silindi.', 'success');
  };

  // Calendar grid
  const { start } = monthRange(year, month);
  const firstOffset = mondayFirstIndex(fromDateKey(start));
  const dim = daysInMonth(year, month);
  const cells: (string | null)[] = [...Array<null>(firstOffset).fill(null)];
  for (let d = 1; d <= dim; d += 1) cells.push(toDateKey(new Date(year, month, d)));
  while (cells.length % 7 !== 0) cells.push(null);
  const isCurrentMonthView = year === t.getFullYear() && month === t.getMonth();

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        eyebrow="Geçmiş"
        title={formatMonthTr(year, month)}
        subtitle={
          completion.elapsedDays > 0
            ? `${completion.recordedDays} / ${completion.elapsedDays} kayıtlı gün`
            : 'Gelecek ay'
        }
      />

      <Card>
        <div className="mb-3 flex items-center justify-between">
          <button type="button" onClick={goPrev} aria-label="Önceki ay" className="h-11 w-11 rounded-2xl bg-elevated text-ink text-xl">
            ‹
          </button>
          <button type="button" onClick={goToday} className="text-[14px] font-semibold text-accent" disabled={isCurrentMonthView && selected === today}>
            Bugün
          </button>
          <button type="button" onClick={goNext} aria-label="Sonraki ay" className="h-11 w-11 rounded-2xl bg-elevated text-ink text-xl" disabled={isCurrentMonthView}>
            ›
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1" role="grid" aria-label="Takvim">
          {WEEKDAY_SHORT_TR.map((w) => (
            <div key={w} role="columnheader" className="py-1 text-center text-[11px] font-semibold uppercase text-faint">
              {w}
            </div>
          ))}
          {cells.map((key, i) => {
            if (!key) return <div key={`e${i}`} role="gridcell" aria-hidden="true" />;
            const log = byDate.get(key);
            const isToday = key === today;
            const isFuture = key > today;
            const isSel = key === selected;
            return (
              <button
                key={key}
                type="button"
                role="gridcell"
                aria-selected={isSel}
                aria-label={`${formatLongDateTr(key)}${log ? ', kayıt var' : ''}`}
                disabled={isFuture}
                onClick={() => selectDay(key)}
                className={cx(
                  'relative flex aspect-square flex-col items-center justify-center rounded-xl text-[15px] font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
                  isSel ? 'bg-accent text-accent-ink' : isFuture ? 'text-faint/60' : 'text-ink hover:bg-elevated',
                  isToday && !isSel && 'ring-1 ring-accent',
                )}
              >
                {fromDateKey(key).getDate()}
                <span
                  aria-hidden="true"
                  className={cx(
                    'absolute bottom-1.5 h-1.5 w-1.5 rounded-full',
                    log ? (isSel ? 'bg-accent-ink' : log.workout !== 'none' ? 'bg-success' : 'bg-faint') : 'bg-transparent',
                  )}
                />
              </button>
            );
          })}
        </div>
      </Card>

      {loading && <p className="text-center text-[14px] text-muted">Yükleniyor…</p>}

      {!loading && logs.length === 0 && !selected && (
        <EmptyState icon="📅" title="Henüz kayıt yok" hint="Bugün sekmesinden ilk gününü kaydet; takvimde burada görünür." />
      )}

      {selected && (
        <Card
          title={weekdayNameTr(fromDateKey(selected))}
          action={
            <div className="flex gap-1">
              <button type="button" onClick={() => step(-1)} aria-label="Önceki gün" className="h-9 w-9 rounded-xl bg-elevated text-ink">
                ‹
              </button>
              <button type="button" onClick={() => step(1)} aria-label="Sonraki gün" disabled={selected >= today} className="h-9 w-9 rounded-xl bg-elevated text-ink disabled:opacity-40">
                ›
              </button>
            </div>
          }
        >
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-[20px] font-bold text-ink">{formatLongDateTr(selected)}</h3>
            {selectedLog && (
              <Pill tone={selectedLog.syncStatus === 'synced' ? 'good' : selectedLog.syncStatus === 'error' ? 'bad' : 'warn'}>
                {selectedLog.syncStatus === 'synced' ? 'Senkron' : selectedLog.syncStatus === 'error' ? 'Hata' : 'Bekliyor'}
              </Pill>
            )}
          </div>

          {editing ? (
            <LogForm
              key={selected}
              date={selected}
              existing={selectedLog}
              onSave={onSave}
              saving={saving}
              onCancel={() => setEditing(false)}
              saveLabel={selectedLog ? 'Kaydı Güncelle' : 'Günü Kaydet'}
            />
          ) : selectedLog ? (
            <>
              <Row label="Spor" value={WORKOUT_LABELS[selectedLog.workout]} />
              <Row label="Sigara" value={selectedLog.cigarettes} />
              <Row label="Yeterli su" value={selectedLog.waterEnough ? 'Evet' : 'Hayır'} />
              <Row label="Alkol" value={selectedLog.alcohol ? 'Evet' : 'Hayır'} />
              <Row label="Sağlıklı beslenme" value={selectedLog.healthyDiet ? 'Evet' : 'Hayır'} />
              <Row label="Kilo" value={typeof selectedLog.weight === 'number' ? formatWeight(selectedLog.weight) : 'Tartılmadı'} />
              <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
                <Button variant="secondary" onClick={() => setEditing(true)}>
                  Kaydı Düzenle
                </Button>
                <Button variant="danger-outline" onClick={() => setConfirmDelete(true)} aria-label="Kaydı sil">
                  Sil
                </Button>
              </div>
            </>
          ) : (
            <div className="py-2">
              <p className="text-[15px] text-muted">Bu gün için kayıt yok.</p>
              <Button className="mt-3" variant="secondary" fullWidth onClick={() => setEditing(true)}>
                Bu Gün İçin Kayıt Ekle
              </Button>
            </div>
          )}
        </Card>
      )}

      <ConfirmDialog
        open={confirmDelete}
        title="Kaydı sil"
        message={selected ? `${formatLongDateTr(selected)} kaydı yerel ve bulut verilerinden silinecek.` : ''}
        confirmLabel="Sil"
        danger
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(false)}
      />
    </div>
  );
}
