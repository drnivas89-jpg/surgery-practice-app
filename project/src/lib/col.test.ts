import { describe, expect, it } from 'vitest';
import { colExpiryDate, getColSummary, redeemableOn } from './col';
import { buildColContext, isSecondSaturday, secondSaturdaysOfYear } from './holidays';
import { attendanceToChoiceState, buildAttendanceFields, defaultAttendanceChoiceState } from './attendance';
import type { Attendance, GovHoliday } from './types';

const hol = (d: string, name: string, cancelled = false): GovHoliday => ({ id: d, user_id: 'u', holiday_date: d, name, is_cancelled: cancelled, created_at: '' });

let n = 0;
const att = (hospital: string, date: string, fields: Partial<Attendance> = {}): Attendance => ({
  id: `a${++n}`, user_id: 'u', hospital_id: hospital, attendance_date: date, status: 'present', duty_type: 'normal', duty_subtype: null,
  compensated_working_date: null, leave_type: null, extra_duty_type: null, col_reason: null, notes: '', created_at: '', ...fields,
});

describe('COL validity', () => {
  it('lasts 6 months minus a day, clamped to month end', () => {
    expect(colExpiryDate('2026-01-15')).toBe('2026-07-14');
    expect(colExpiryDate('2025-08-31')).toBe('2026-02-27');
    expect(colExpiryDate('2026-12-01')).toBe('2027-05-31');
  });
});

describe('government holidays', () => {
  it('finds every second Saturday', () => {
    expect(secondSaturdaysOfYear(2026)).toEqual([
      '2026-01-10', '2026-02-14', '2026-03-14', '2026-04-11', '2026-05-09', '2026-06-13',
      '2026-07-11', '2026-08-08', '2026-09-12', '2026-10-10', '2026-11-14', '2026-12-12',
    ]);
    expect(isSecondSaturday('2026-11-14')).toBe(true);
    expect(isSecondSaturday('2026-11-07')).toBe(false);
  });

  it('named holidays override, cancellations switch off', () => {
    const ctx = buildColContext([hol('2026-01-15', 'Pongal'), hol('2026-03-14', 'Second Saturday', true), hol('2026-08-08', 'Varalakshmi')], []);
    expect(ctx.holidayNameOn('2026-01-15')).toBe('Pongal');
    expect(ctx.holidayNameOn('2026-02-14')).toBe('Second Saturday');
    expect(ctx.holidayNameOn('2026-03-14')).toBeNull();
    expect(ctx.holidayNameOn('2026-08-08')).toBe('Varalakshmi');
    expect(ctx.holidayNameOn('2026-02-16')).toBeNull();
  });
});

describe('getColSummary', () => {
  const ctx = buildColContext(
    [hol('2026-01-15', 'Pongal'), hol('2026-03-14', 'Second Saturday', true)],
    [{ id: 'nmch', is_government: true }, { id: 'pvt', is_government: false }]
  );
  const rows: Attendance[] = [
    att('nmch', '2026-01-15'),
    att('nmch', '2026-02-14', { duty_type: 'duty' }),
    att('nmch', '2026-03-14'),
    att('nmch', '2026-02-16'),
    att('nmch', '2026-04-20', { status: 'extra_duty', extra_duty_type: 'col', col_reason: 'Camp' }),
    att('nmch', '2026-04-11', { status: 'leave', leave_type: 'week_off' }),
    att('pvt', '2026-02-14'),
    att('nmch', '2026-05-04', { status: 'leave', leave_type: 'col', compensated_working_date: '2026-02-14' }),
  ];

  it('credits holiday duty at government hospitals and manual COL duty only', () => {
    const s = getColSummary(rows, undefined, { context: ctx, asOf: '2026-11-12' });
    expect(s.creditDates.map((c) => `${c.hospitalId}:${c.date}:${c.source}:${c.reason}`)).toEqual([
      'nmch:2026-01-15:holiday:Pongal', 'nmch:2026-02-14:holiday:Second Saturday', 'nmch:2026-04-20:col_duty:Camp',
    ]);
    expect(s.usage.map((u) => u.compensatedWorkingDate)).toEqual(['2026-02-14']);
    expect(s.wastedDates.map((c) => c.date)).toEqual(['2026-01-15', '2026-04-20']);
    expect(s.availableDates).toEqual([]);
  });

  it('judges availability as of a given date', () => {
    const s = getColSummary(rows, 'nmch', { context: ctx, asOf: '2026-06-01' });
    expect(s.availableDates.map((c) => c.date)).toEqual(['2026-01-15', '2026-04-20']);
    expect(redeemableOn(s, '2026-03-01').map((c) => c.date)).toEqual(['2026-01-15']);
  });
});

describe('attendance picker mapping', () => {
  const base = defaultAttendanceChoiceState();
  it('maps duty kinds to the stored shape', () => {
    expect(buildAttendanceFields(base)).toMatchObject({ status: 'present', duty_type: 'normal' });
    expect(buildAttendanceFields({ ...base, dutyKind: 'col', colReason: ' X ' })).toMatchObject({ status: 'extra_duty', extra_duty_type: 'col', col_reason: 'X' });
    expect(buildAttendanceFields({ ...base, dutyKind: 'extra', extraDutyDetails: 'COL' }).extra_duty_type).toBe('extra');
  });
  it('keeps legacy extra-duty text as details', () => {
    expect(attendanceToChoiceState(att('x', '2026-01-01', { status: 'extra_duty', extra_duty_type: 'VIP duty' })).extraDutyDetails).toBe('VIP duty');
  });
});
