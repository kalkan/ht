/** Form state and validation for the daily log form. Pure, UI-independent. */
import type { DailyLog, DailyLogInput, WorkoutType } from '../types/DailyLog';

export interface LogFormState {
  workout: WorkoutType | null;
  cigarettes: number;
  waterEnough: boolean | null;
  alcohol: boolean | null;
  healthyDiet: boolean | null;
  /** Raw text so the user can type "78,2" or "78." freely. */
  weightText: string;
  notWeighed: boolean;
}

export function stateFromLog(log: DailyLog | null | undefined): LogFormState {
  if (!log) {
    return {
      workout: null,
      cigarettes: 0,
      waterEnough: null,
      alcohol: null,
      healthyDiet: null,
      weightText: '',
      notWeighed: false,
    };
  }
  return {
    workout: log.workout,
    cigarettes: log.cigarettes,
    waterEnough: log.waterEnough,
    alcohol: log.alcohol,
    healthyDiet: log.healthyDiet,
    weightText: typeof log.weight === 'number' ? String(log.weight).replace('.', ',') : '',
    notWeighed: typeof log.weight !== 'number',
  };
}

export function parseWeight(text: string): number | null | undefined {
  const t = text.trim().replace(',', '.');
  if (t === '') return undefined;
  const n = Number(t);
  if (!Number.isFinite(n) || n <= 0 || n > 500) return null; // invalid
  return Math.round(n * 10) / 10;
}

export function validate(s: LogFormState): { ok: true; input: DailyLogInput } | { ok: false; error: string } {
  if (!s.workout) return { ok: false, error: 'Spor sorusunu yanıtlayın.' };
  if (s.waterEnough === null) return { ok: false, error: 'Su sorusunu yanıtlayın.' };
  if (s.alcohol === null) return { ok: false, error: 'Alkol sorusunu yanıtlayın.' };
  if (s.healthyDiet === null) return { ok: false, error: 'Beslenme sorusunu yanıtlayın.' };
  let weight: number | undefined;
  if (!s.notWeighed) {
    const w = parseWeight(s.weightText);
    if (w === null) return { ok: false, error: 'Kilo değeri geçersiz. Örn: 78,2' };
    weight = w;
  }
  return {
    ok: true,
    input: {
      workout: s.workout,
      cigarettes: Math.max(0, s.cigarettes),
      waterEnough: s.waterEnough,
      alcohol: s.alcohol,
      healthyDiet: s.healthyDiet,
      weight,
    },
  };
}

