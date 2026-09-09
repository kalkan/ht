import { describe, expect, it } from 'vitest';
import type { DailyLog } from '../types/DailyLog';
import { createBackup, parseBackup, serializeBackup, toCsv, validateRecord } from './backup';

const sample: DailyLog = {
  id: 'abc',
  date: '2026-09-09',
  workout: 'push',
  cigarettes: 3,
  waterEnough: true,
  alcohol: false,
  healthyDiet: true,
  weight: 78.2,
  createdAt: '2026-09-09T18:00:00.000Z',
  updatedAt: '2026-09-09T18:00:00.000Z',
  syncStatus: 'synced',
};

describe('backup round-trip', () => {
  it('serializes and parses back', () => {
    const text = serializeBackup(createBackup([sample], '2026-09-09T19:00:00.000Z'));
    const parsed = parseBackup(text);
    expect(parsed.version).toBe(1);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0]).toMatchObject({ ...sample, syncStatus: 'pending' });
  });
  it('rejects malformed records but keeps good ones', () => {
    const text = JSON.stringify({ version: 1, records: [sample, { date: 'nope' }, { ...sample, workout: 'yoga' }] });
    const parsed = parseBackup(text);
    expect(parsed.records).toHaveLength(1);
    expect(parsed.rejected).toHaveLength(2);
  });
  it('collapses duplicate dates keeping the newest', () => {
    const older = { ...sample, cigarettes: 9, updatedAt: '2026-09-09T10:00:00.000Z' };
    const parsed = parseBackup(JSON.stringify({ version: 1, records: [older, sample] }));
    expect(parsed.records).toHaveLength(1);
    expect(parsed.records[0].cigarettes).toBe(3);
  });
  it('throws on invalid JSON and unknown structure', () => {
    expect(() => parseBackup('{')).toThrow();
    expect(() => parseBackup('{"foo":1}')).toThrow();
    expect(() => parseBackup(JSON.stringify({ version: 99, records: [] }))).toThrow();
  });
  it('accepts snake_case keys from the sheet', () => {
    const r = validateRecord({
      id: 'x',
      date: '2026-09-01',
      workout: 'none',
      cigarettes: '2',
      water_enough: 'TRUE',
      alcohol: false,
      healthy_diet: 1,
      weight: '77,5',
      created_at: '2026-09-01T10:00:00Z',
      updated_at: '2026-09-01T10:00:00Z',
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.record.weight).toBe(77.5);
      expect(r.record.waterEnough).toBe(true);
    }
  });
  it('treats an empty weight as no measurement, never zero', () => {
    const r = validateRecord({ ...sample, weight: '' });
    expect(r.ok && r.record.weight).toBeUndefined();
    const zero = validateRecord({ ...sample, weight: 0 });
    expect(zero.ok).toBe(false);
  });
});

describe('csv', () => {
  it('starts with a BOM and has the right columns', () => {
    const csv = toCsv([sample, { ...sample, id: 'b', date: '2026-09-08', weight: undefined }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    const lines = csv.slice(1).trim().split('\r\n');
    expect(lines[0]).toBe('date,workout,cigarettes,water_enough,alcohol,healthy_diet,weight,created_at,updated_at');
    expect(lines[1]).toBe('2026-09-08,push,3,true,false,true,,2026-09-09T18:00:00.000Z,2026-09-09T18:00:00.000Z');
    expect(lines[2]).toContain('78.2');
  });
});
