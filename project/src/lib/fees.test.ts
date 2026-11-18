import { describe, expect, it } from 'vitest';
import { buildMonthlyFeeTally, sumFeeTally, fyStartYear, fyLabel, fyMonths, buildFySummary } from './fees';

describe('monthly fee tally', () => {
  const tally = buildMonthlyFeeTally({
    upTo: '2026-11-12',
    patients: [
      { hospital_id: 'A', fees: 1000, created_at: '2026-09-10T06:00:00Z' },
      { hospital_id: 'A', fees: 500, created_at: '2026-10-03T06:00:00Z' },
    ],
    payments: [
      { hospital_id: 'A', amount: 600, payment_date: '2026-09-20' },
      { hospital_id: 'A', amount: 900, payment_date: '2026-10-15' },
    ],
    monthlyEntries: [
      { hospital_id: 'B', entry_date: '2026-11-05', month: '2026-11-01', fees_generated: 2000, fees_received: 2000 },
      { hospital_id: 'B', entry_date: '2026-11-20', month: '2026-11-01', fees_generated: 999, fees_received: 0 },
    ],
    revenueTransactions: [{ hospital_id: 'B', entry_date: '2026-10-01', amount_generated: 300, amount_received: 0 }],
  });

  it('tallies each hospital-month on its own and ignores future entries', () => {
    expect(tally.map((t) => `${t.hospitalId} ${t.month} ${t.generated}/${t.received} p${t.pending} x${t.excess}`).sort()).toEqual([
      'A 2026-09 1000/600 p400 x0',
      'A 2026-10 500/900 p0 x400',
      'B 2026-10 300/0 p300 x0',
      'B 2026-11 2000/2000 p0 x0',
    ]);
  });

  it('never nets pending against excess', () => {
    expect(sumFeeTally(tally)).toEqual({ generated: 3800, received: 3500, pending: 700, excess: 400 });
  });
});

describe('financial year', () => {
  it('runs April to March', () => {
    expect(fyStartYear('2026-04-01')).toBe(2026);
    expect(fyStartYear('2027-03-31')).toBe(2026);
    expect(fyStartYear('2026-03')).toBe(2025);
    expect(fyLabel(2026)).toBe('FY 2026–27');
    expect(fyLabel(2099)).toBe('FY 2099–00');
    const months = fyMonths(2026);
    expect([months[0], months[8], months[11], months.length]).toEqual(['2026-04', '2026-12', '2027-03', 12]);
  });

  it('rolls up months and hospitals', () => {
    const t = (hospitalId: string, month: string, generated: number, received: number) =>
      ({ hospitalId, month, generated, received, pending: Math.max(0, generated - received), excess: Math.max(0, received - generated) });
    const fy = buildFySummary([t('a', '2026-03', 999, 999), t('a', '2026-04', 1000, 600), t('b', '2027-03', 500, 700), t('a', '2027-04', 5, 5)], 2026);
    expect(fy.totals).toEqual({ generated: 1500, received: 1300, pending: 400, excess: 200 });
    expect(fy.byHospital.map((h) => h.hospitalId)).toEqual(['b', 'a']);
    expect(fy.byMonth[0].totals.received).toBe(600);
    expect(fy.byMonth[11].totals.received).toBe(700);
  });
});
