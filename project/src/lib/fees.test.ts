import { describe, expect, it } from 'vitest';
import { buildMonthlyFeeTally, sumFeeTally } from './fees';

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
