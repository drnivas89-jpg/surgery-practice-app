import { MonthlyEntry, Patient, Payment, RevenueTransaction } from './types';
import { todayLocalDateStr } from './helpers';

// One hospital's fees for one calendar month. Each month is tallied on its
// own: a shortfall is `pending`, an overpayment is `excess`, and the two
// are never netted against other months.
export interface MonthFeeTally {
  hospitalId: string;
  month: string; // yyyy-mm
  generated: number;
  received: number;
  pending: number;
  excess: number;
}

export interface FeeTotals {
  generated: number;
  received: number;
  pending: number;
  excess: number;
}

export interface FeeSources {
  patients: Pick<Patient, 'hospital_id' | 'fees' | 'created_at'>[];
  payments: Pick<Payment, 'hospital_id' | 'amount' | 'payment_date'>[];
  monthlyEntries: Pick<MonthlyEntry, 'hospital_id' | 'entry_date' | 'month' | 'fees_generated' | 'fees_received'>[];
  revenueTransactions: Pick<RevenueTransaction, 'hospital_id' | 'entry_date' | 'amount_generated' | 'amount_received'>[];
  /** yyyy-mm-dd — items dated after this are ignored (default: today). */
  upTo?: string;
}

// A patient's fee is billed in the month the patient was registered.
const patientFeeDate = (p: Pick<Patient, 'created_at'>) => todayLocalDateStr(new Date(p.created_at));

export function buildMonthlyFeeTally(src: FeeSources): MonthFeeTally[] {
  const upTo = src.upTo || todayLocalDateStr();
  const map = new Map<string, MonthFeeTally>();
  const add = (hospitalId: string, date: string, generated: number, received: number) => {
    if (!hospitalId || !date || date > upTo || (!generated && !received)) return;
    const month = date.substring(0, 7);
    const key = `${hospitalId}::${month}`;
    let row = map.get(key);
    if (!row) {
      row = { hospitalId, month, generated: 0, received: 0, pending: 0, excess: 0 };
      map.set(key, row);
    }
    row.generated += generated;
    row.received += received;
  };

  src.patients.forEach((p) => { if (p.created_at) add(p.hospital_id, patientFeeDate(p), p.fees || 0, 0); });
  src.payments.forEach((p) => add(p.hospital_id, (p.payment_date || '').substring(0, 10), 0, p.amount || 0));
  src.monthlyEntries.forEach((me) => add(me.hospital_id, (me.entry_date || me.month).substring(0, 10), me.fees_generated || 0, me.fees_received || 0));
  src.revenueTransactions.forEach((rt) => add(rt.hospital_id, rt.entry_date, rt.amount_generated || 0, rt.amount_received || 0));

  return Array.from(map.values())
    .map((r) => ({ ...r, pending: Math.max(0, r.generated - r.received), excess: Math.max(0, r.received - r.generated) }))
    .sort((a, b) => b.month.localeCompare(a.month));
}

export function sumFeeTally(rows: MonthFeeTally[]): FeeTotals {
  return rows.reduce(
    (acc, r) => ({
      generated: acc.generated + r.generated,
      received: acc.received + r.received,
      pending: acc.pending + r.pending,
      excess: acc.excess + r.excess,
    }),
    { generated: 0, received: 0, pending: 0, excess: 0 }
  );
}

export function formatMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' });
}
