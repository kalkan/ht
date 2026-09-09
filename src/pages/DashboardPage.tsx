import { useMemo, useState } from 'react';
import { CigaretteChart, WeightChart, WorkoutBars } from '../components/charts';
import { PageHeader } from '../components/PageHeader';
import { Card, EmptyState, Stat } from '../components/ui';
import { cx } from '../utils/cx';
import { useAllLogs } from '../hooks/useLogs';
import { WORKOUT_TYPES } from '../types/DailyLog';
import {
  PERIODS,
  alcoholFreeRatio,
  averageCigarettes,
  cigaretteMovingAverage,
  countWhere,
  currentStreak,
  filterByMonth,
  filterByPeriod,
  firstWeight,
  healthyDietCompliance,
  latestWeight,
  longestStreak,
  monthCompletion,
  previousMonthCigaretteComparison,
  totalCigarettes,
  totalWeightChange,
  waterCompliance,
  weightChangeLast30Days,
  weightSeries,
  workoutDays,
  workoutDistribution,
  type Period,
} from '../utils/analytics';
import { formatMonthTr, formatShortDateTr, fromDateKey, todayKey } from '../utils/dateUtils';
import { WORKOUT_LABELS, formatDecimal, formatPercent, formatSignedWeight, formatWeight } from '../utils/labels';

function PeriodPicker({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div role="tablist" aria-label="Dönem">
      <div className="flex flex-wrap gap-1.5">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={p.key === value}
            onClick={() => onChange(p.key)}
            className={cx(
              'min-h-[40px] rounded-full px-4 text-[14px] font-semibold transition-colors whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
              p.key === value ? 'bg-ink text-bg' : 'bg-elevated text-muted hover:text-ink',
            )}
          >
            {p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Ratio({ label, ratio, count, total, good }: { label: string; ratio: number | null; count: number; total: number; good?: boolean }) {
  const pct = ratio === null ? 0 : Math.round(ratio * 100);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between">
        <span className="text-[14px] font-medium text-ink">{label}</span>
        <span className={cx('text-[22px] font-semibold tabular-nums', good === undefined ? 'text-ink' : good ? 'text-success' : 'text-warning')}>
          {formatPercent(ratio)}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-elevated" aria-hidden="true">
        <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-[12px] text-muted">
        {total === 0 ? 'Kayıt yok' : `${count} / ${total} kayıtlı gün`}
      </span>
    </div>
  );
}

export function DashboardPage() {
  const { logs, loading } = useAllLogs();
  const [period, setPeriod] = useState<Period>('30d');
  const today = todayKey();
  const t = fromDateKey(today);

  const monthLogs = useMemo(() => filterByMonth(logs, t.getFullYear(), t.getMonth()), [logs, t]);
  const periodLogs = useMemo(() => filterByPeriod(logs, period, today), [logs, period, today]);

  const completion = monthCompletion(logs, t.getFullYear(), t.getMonth(), today);
  const dist = workoutDistribution(monthLogs);
  const comparison = previousMonthCigaretteComparison(logs, t.getFullYear(), t.getMonth());
  const streak = currentStreak(logs, today);
  const longest = longestStreak(logs);

  const ma = useMemo(() => cigaretteMovingAverage(periodLogs, 7), [periodLogs]);
  const weights = useMemo(() => weightSeries(periodLogs), [periodLogs]);
  const latestW = latestWeight(logs);
  const firstW = firstWeight(logs);
  const totalChange = totalWeightChange(logs);
  const change30 = weightChangeLast30Days(logs, today);

  const avgPeriod = averageCigarettes(periodLogs);

  if (!loading && logs.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <PageHeader eyebrow="İstatistik" title="Özet" />
        <Card>
          <EmptyState icon="📊" title="Henüz veri yok" hint="Birkaç gün kayıt girdikten sonra istatistikler burada oluşur." />
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <PageHeader
        eyebrow="İstatistik"
        title={formatMonthTr(t.getFullYear(), t.getMonth())}
        subtitle={`${completion.recordedDays} / ${completion.elapsedDays} kayıtlı gün`}
      />

      <div className="grid grid-cols-2 gap-3">
        <Card>
          <Stat label="Kayıt serisi" value={`${streak} gün`} sub={`En uzun: ${longest} gün`} />
        </Card>
        <Card>
          <Stat
            label="Bu ay tamamlama"
            value={completion.elapsedDays ? formatPercent(completion.recordedDays / completion.elapsedDays) : '—'}
            sub={`${completion.recordedDays} / ${completion.elapsedDays} gün`}
          />
        </Card>
      </div>

      <Card title="Spor · bu ay">
        <div className="mb-3 flex items-baseline gap-2">
          <span className="text-[32px] font-semibold tabular-nums text-ink">{workoutDays(monthLogs)}</span>
          <span className="text-[15px] text-muted">/ {monthLogs.length} kayıtlı gün</span>
        </div>
        <WorkoutBars data={WORKOUT_TYPES.map((k) => ({ label: WORKOUT_LABELS[k], value: dist[k] }))} />
      </Card>

      <Card title="Sigara · bu ay">
        <div className="grid grid-cols-2 gap-4">
          <Stat
            label="Günlük ortalama"
            value={comparison.currentAverage === null ? '—' : `${formatDecimal(comparison.currentAverage)} / gün`}
            sub={`Toplam ${comparison.currentTotal} · ${comparison.currentDays} gün`}
          />
          <Stat
            label="Geçen ay"
            value={comparison.previousAverage === null ? '—' : formatDecimal(comparison.previousAverage)}
            sub={
              comparison.change === null ? (
                comparison.previousDays === 0 ? 'Geçen ay kayıt yok' : '—'
              ) : (
                <span className={comparison.change <= 0 ? 'text-success font-semibold' : 'text-danger font-semibold'}>
                  {comparison.change <= 0 ? '↓' : '↑'} %{Math.abs(Math.round(comparison.change * 100))}
                </span>
              )
            }
          />
        </div>
      </Card>

      <Card title="Dönem">
        <PeriodPicker value={period} onChange={setPeriod} />
        <p className="mt-2 text-[13px] text-muted">
          {periodLogs.length} kayıtlı gün
          {periodLogs.length > 0 && ` · ${formatShortDateTr(periodLogs[0].date)} – ${formatShortDateTr(periodLogs[periodLogs.length - 1].date)}`}
        </p>
      </Card>

      <Card title="Sigara trendi">
        <div className="mb-3 grid grid-cols-2 gap-4">
          <Stat label="Ortalama" value={avgPeriod === null ? '—' : `${formatDecimal(avgPeriod)} / gün`} />
          <Stat label="Toplam" value={totalCigarettes(periodLogs)} />
        </div>
        <CigaretteChart data={ma} />
        {ma.length > 0 && <p className="mt-2 text-[12px] text-faint">Kalın çizgi: son 7 kayıtlı günün hareketli ortalaması.</p>}
      </Card>

      <Card title="Alışkanlıklar">
        <div className="flex flex-col gap-5">
          <Ratio label="Yeterli su" ratio={waterCompliance(periodLogs)} count={countWhere(periodLogs, (l) => l.waterEnough)} total={periodLogs.length} good />
          <Ratio label="Alkolsüz gün" ratio={alcoholFreeRatio(periodLogs)} count={countWhere(periodLogs, (l) => !l.alcohol)} total={periodLogs.length} good />
          <Ratio label="Sağlıklı beslenme" ratio={healthyDietCompliance(periodLogs)} count={countWhere(periodLogs, (l) => l.healthyDiet)} total={periodLogs.length} good />
        </div>
      </Card>

      <Card title="Kilo">
        {latestW ? (
          <>
            <div className="mb-3 grid grid-cols-2 gap-4">
              <Stat label="Son ölçüm" value={formatWeight(latestW.weight)} sub={formatShortDateTr(latestW.date)} />
              <Stat label="İlk ölçüm" value={firstW ? formatWeight(firstW.weight) : '—'} sub={firstW ? formatShortDateTr(firstW.date) : undefined} />
              <Stat
                label="Toplam değişim"
                value={totalChange === null ? '—' : formatSignedWeight(totalChange)}
                tone={totalChange === null ? 'default' : totalChange <= 0 ? 'good' : 'bad'}
              />
              <Stat
                label="Son 30 gün"
                value={change30 === null ? '—' : formatSignedWeight(change30)}
                sub={change30 === null ? 'Yeterli ölçüm yok' : undefined}
                tone={change30 === null ? 'default' : change30 <= 0 ? 'good' : 'bad'}
              />
            </div>
            <WeightChart data={weights} />
            <p className="mt-2 text-[12px] text-faint">Yalnızca gerçek ölçümler çizilir; tartılmayan günler doldurulmaz.</p>
          </>
        ) : (
          <EmptyState title="Kilo kaydı yok" hint="Bugün sekmesinde kilonu girdiğinde trend burada görünür." />
        )}
      </Card>
    </div>
  );
}
