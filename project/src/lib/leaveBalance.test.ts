import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: {} }));
const { leaveBalance } = await import('./leaveBalance');

const leave = (date: string, type: string, hospital = 'h1') => ({
  hospital_id: hospital, status: 'leave' as const, attendance_date: date, leave_type: type, compensated_working_date: null,
});

describe('leave balance', () => {
  const att = [
    leave('2026-01-05', 'casual'), leave('2026-03-10', 'Casual'), leave('2026-07-01', 'medical'),
    leave('2025-12-30', 'casual'), // previous year
    leave('2026-02-02', 'casual', 'h2'), // other hospital
    { ...leave('2026-04-04', 'col'), compensated_working_date: '2026-03-14' }, // COL, no quota
    { ...leave('2026-05-05', 'casual'), status: 'present' as const },
  ];

  it('counts this year and this hospital only, against the quota', () => {
    expect(leaveBalance(att, 'h1', 2026, { cl: 12, medical: 1, pdo: 0 })).toEqual([
      { key: 'cl', label: 'CL', quota: 12, used: 2, left: 10 },
      { key: 'medical', label: 'Medical', quota: 1, used: 1, left: 0 },
    ]);
  });

  it('shows overuse as a negative balance', () => {
    expect(leaveBalance(att, 'h1', 2026, { cl: 1 })[0].left).toBe(-1);
  });

  it('is empty with no quota set', () => {
    expect(leaveBalance(att, 'h1', 2026, undefined)).toEqual([]);
  });
});
