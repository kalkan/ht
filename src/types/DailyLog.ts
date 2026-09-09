/** Internal workout values. UI labels live in `utils/labels.ts`. */
export type WorkoutType = 'push' | 'pull' | 'legs_core' | 'cardio' | 'none';

export const WORKOUT_TYPES: readonly WorkoutType[] = [
  'push',
  'pull',
  'legs_core',
  'cardio',
  'none',
] as const;

export type SyncStatus = 'synced' | 'pending' | 'error';

/**
 * One record per calendar day. `date` (YYYY-MM-DD, local time) is the logical
 * primary key across IndexedDB and Google Sheets. `id` is a UUID generated on
 * the device that first created the record.
 */
export interface DailyLog {
  id: string;
  /** YYYY-MM-DD in the user's local timezone. Unique. */
  date: string;
  workout: WorkoutType;
  /** Never negative. */
  cigarettes: number;
  waterEnough: boolean;
  alcohol: boolean;
  healthyDiet: boolean;
  /** Kilograms. Undefined when the user did not weigh themselves. Never 0 as a placeholder. */
  weight?: number;
  /** ISO 8601 timestamp. */
  createdAt: string;
  /** ISO 8601 timestamp. Drives last-write-wins conflict resolution. */
  updatedAt: string;
  syncStatus: SyncStatus;
}

/** The subset of a DailyLog the user edits in the form. */
export type DailyLogInput = Pick<
  DailyLog,
  'workout' | 'cigarettes' | 'waterEnough' | 'alcohol' | 'healthyDiet' | 'weight'
>;

/** Row shape exchanged with the Apps Script backend (snake_case, matches sheet columns). */
export interface RemoteDailyLog {
  id: string;
  date: string;
  workout: WorkoutType;
  cigarettes: number;
  water_enough: boolean;
  alcohol: boolean;
  healthy_diet: boolean;
  weight: number | null;
  created_at: string;
  updated_at: string;
  device_id: string;
}

export function isWorkoutType(value: unknown): value is WorkoutType {
  return typeof value === 'string' && (WORKOUT_TYPES as readonly string[]).includes(value);
}
