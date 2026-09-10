import { describe, expect, it } from 'vitest';
import type { DailyLog } from '../types/DailyLog';
import { fromFirestoreDoc, toFirestoreFields } from './cloudApi';

const log: DailyLog = {
  id: 'abc',
  date: '2026-09-09',
  workout: 'push',
  cigarettes: 3,
  waterEnough: true,
  alcohol: false,
  healthyDiet: true,
  weight: 78.2,
  createdAt: '2026-09-09T18:00:00.000Z',
  updatedAt: '2026-09-09T18:30:00.000Z',
  syncStatus: 'pending',
};

describe('Firestore mapping', () => {
  it('round-trips a log through Firestore field format', () => {
    const fields = toFirestoreFields(log, 'dev-1');
    expect(fields.cigarettes).toEqual({ integerValue: '3' });
    expect(fields.weight).toEqual({ doubleValue: 78.2 });
    expect(fields.deviceId).toEqual({ stringValue: 'dev-1' });
    const back = fromFirestoreDoc({ name: 'projects/p/databases/(default)/documents/users/u/dailyLogs/2026-09-09', fields });
    expect(back).toEqual({ ...log, syncStatus: 'synced' });
  });

  it('writes null for a missing weight and reads it back as absent', () => {
    const fields = toFirestoreFields({ ...log, weight: undefined }, 'dev');
    expect(fields.weight).toEqual({ nullValue: null });
    const back = fromFirestoreDoc({ fields });
    expect(back).not.toBeNull();
    expect(back && 'weight' in back).toBe(false);
  });

  it('accepts integerValue returned as a number and doubles for cigarettes', () => {
    const fields = toFirestoreFields(log, 'dev');
    const back = fromFirestoreDoc({ fields: { ...fields, cigarettes: { integerValue: 5 } } });
    expect(back?.cigarettes).toBe(5);
  });

  it('rejects malformed documents instead of throwing', () => {
    const fields = toFirestoreFields(log, 'dev');
    expect(fromFirestoreDoc({})).toBeNull();
    expect(fromFirestoreDoc({ fields: { ...fields, workout: { stringValue: 'yoga' } } })).toBeNull();
    expect(fromFirestoreDoc({ fields: { ...fields, date: { stringValue: '2026-13-01' } } })).toBeNull();
    expect(fromFirestoreDoc({ fields: { ...fields, waterEnough: { stringValue: 'yes' } } })).toBeNull();
    expect(fromFirestoreDoc({ fields: { ...fields, updatedAt: { stringValue: 'not a date' }, createdAt: { stringValue: 'nope' } } })).toBeNull();
  });

  it('falls back to the document name for the date', () => {
    const fields = toFirestoreFields(log, 'dev');
    delete (fields as Record<string, unknown>).date;
    const back = fromFirestoreDoc({ name: 'projects/p/databases/(default)/documents/users/u/dailyLogs/2026-09-09', fields });
    expect(back?.date).toBe('2026-09-09');
  });
});
