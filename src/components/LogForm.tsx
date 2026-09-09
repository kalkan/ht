import { useEffect, useMemo, useState } from 'react';
import { useLastWeightBefore } from '../hooks/useLogs';
import type { DailyLog, DailyLogInput } from '../types/DailyLog';
import { WORKOUT_TYPES } from '../types/DailyLog';
import { WORKOUT_LABELS, formatWeight } from '../utils/labels';
import { formatShortDateTr } from '../utils/dateUtils';
import { Button, Card, SegmentedControl, Stepper, YesNo } from './ui';
import { cx } from '../utils/cx';
import { stateFromLog, validate, type LogFormState } from '../utils/logForm';

const WORKOUT_OPTIONS = WORKOUT_TYPES.map((v) => ({ value: v, label: WORKOUT_LABELS[v] }));

export function LogForm({
  date,
  existing,
  onSave,
  saving,
  saveLabel,
  onCancel,
}: {
  date: string;
  existing: DailyLog | null | undefined;
  onSave: (input: DailyLogInput) => Promise<void> | void;
  saving?: boolean;
  saveLabel?: string;
  onCancel?: () => void;
}) {
  const [state, setState] = useState<LogFormState>(() => stateFromLog(existing));
  const [error, setError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const lastWeight = useLastWeightBefore(date);

  // When the underlying record changes (initial load, sync from cloud), reset the form
  // unless the user has already started editing.
  useEffect(() => {
    if (!dirty) setState(stateFromLog(existing));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [existing?.id, existing?.updatedAt, date]);

  const update = (patch: Partial<LogFormState>) => {
    setDirty(true);
    setError(null);
    setState((s) => ({ ...s, ...patch }));
  };

  const completed = useMemo(() => {
    const total = 5;
    let n = 0;
    if (state.workout) n += 1;
    if (state.waterEnough !== null) n += 1;
    if (state.alcohol !== null) n += 1;
    if (state.healthyDiet !== null) n += 1;
    if (state.notWeighed || state.weightText.trim() !== '') n += 1;
    return { n, total };
  }, [state]);

  const submit = async () => {
    const result = validate(state);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    await onSave(result.input);
    setDirty(false);
  };

  const label = saveLabel ?? (existing ? 'Kaydı Güncelle' : 'Günü Kaydet');

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      noValidate
    >
      <Card title="Spor">
        <p className="mb-3 text-[17px] font-semibold text-ink">Bugün spor yaptın mı?</p>
        <SegmentedControl label="Spor" options={WORKOUT_OPTIONS} value={state.workout} onChange={(v) => update({ workout: v })} />
      </Card>

      <Card title="Sigara">
        <p className="mb-3 text-[17px] font-semibold text-ink">Bugün kaç sigara içtin?</p>
        <Stepper label="Sigara sayısı" value={state.cigarettes} onChange={(v) => update({ cigarettes: v })} />
      </Card>

      <Card title="Su">
        <p className="mb-3 text-[17px] font-semibold text-ink">Yeterli su içtin mi?</p>
        <YesNo label="Yeterli su" value={state.waterEnough} onChange={(v) => update({ waterEnough: v })} />
      </Card>

      <Card title="Alkol">
        <p className="mb-3 text-[17px] font-semibold text-ink">Bugün alkol aldın mı?</p>
        <YesNo label="Alkol" value={state.alcohol} onChange={(v) => update({ alcohol: v })} positiveIsGood={false} />
      </Card>

      <Card title="Beslenme">
        <p className="mb-3 text-[17px] font-semibold text-ink">Sağlıklı beslenme rutinine uydun mu?</p>
        <YesNo label="Sağlıklı beslenme" value={state.healthyDiet} onChange={(v) => update({ healthyDiet: v })} />
      </Card>

      <Card title="Kilo">
        <p className="mb-1 text-[17px] font-semibold text-ink">Bugünkü kilon?</p>
        {lastWeight && (
          <p className="mb-3 text-[13px] text-muted">
            Son kayıt: <span className="font-semibold text-ink">{formatWeight(lastWeight.weight)}</span>{' '}
            <span className="text-faint">({formatShortDateTr(lastWeight.date)})</span>
          </p>
        )}
        <div className="flex items-center gap-2">
          <label className="relative flex-1">
            <span className="sr-only">Kilo (kg)</span>
            <input
              type="text"
              inputMode="decimal"
              placeholder={lastWeight ? String(lastWeight.weight).replace('.', ',') : '78,2'}
              value={state.weightText}
              disabled={state.notWeighed}
              onChange={(e) => update({ weightText: e.target.value, notWeighed: false })}
              className={cx(
                'w-full rounded-2xl border border-line bg-elevated px-4 py-3.5 pr-12 text-[22px] font-semibold tabular-nums text-ink',
                'placeholder:text-faint focus:outline-none focus:ring-2 focus:ring-accent/60 disabled:opacity-40',
              )}
            />
            <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-[15px] font-medium text-muted">
              kg
            </span>
          </label>
        </div>
        <button
          type="button"
          role="checkbox"
          aria-checked={state.notWeighed}
          onClick={() => update({ notWeighed: !state.notWeighed, weightText: state.notWeighed ? state.weightText : '' })}
          className={cx(
            'mt-2 flex min-h-[48px] w-full items-center gap-3 rounded-2xl px-4 text-left text-[15px] font-medium transition-colors',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60',
            state.notWeighed ? 'bg-accent/10 text-accent' : 'bg-elevated text-ink',
          )}
        >
          <span
            aria-hidden="true"
            className={cx(
              'flex h-5 w-5 items-center justify-center rounded-md border text-[12px]',
              state.notWeighed ? 'border-accent bg-accent text-accent-ink' : 'border-faint',
            )}
          >
            {state.notWeighed ? '✓' : ''}
          </span>
          Bugün tartılmadım
        </button>
      </Card>

      {error && (
        <p role="alert" className="rounded-2xl bg-danger/10 px-4 py-3 text-[14px] font-medium text-danger">
          {error}
        </p>
      )}

      <div className="mt-1 flex flex-col gap-2">
        <Button type="submit" size="lg" fullWidth loading={saving}>
          {label}
        </Button>
        {onCancel && (
          <Button variant="ghost" fullWidth onClick={onCancel}>
            Vazgeç
          </Button>
        )}
        <p className="text-center text-[12px] text-faint">
          {completed.n} / {completed.total} soru yanıtlandı
        </p>
      </div>
    </form>
  );
}
