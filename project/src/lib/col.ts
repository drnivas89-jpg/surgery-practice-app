import { Attendance } from './types';
import { ColContext, EMPTY_COL_CONTEXT } from './holidays';
import { todayLocalDateStr } from './helpers';

export const COL_VALIDITY_MONTHS = 6;

export type ColCreditSource = 'col_duty' | 'holiday';

export interface ColCreditDate {
  date: string;
  hospitalId: string;
  hospitalName: string;
  attendanceId: string;
  reason: string | null;
  // Last date the credit can be redeemed on (inclusive).
  expiryDate: string;
  // 'col_duty' = marked Duty -> COL by hand; 'holiday' = any duty worked
  // at a government hospital on a government holiday.
  source: ColCreditSource;
}

export interface ColUsageEntry {
  leaveAttendanceId: string;
  leaveDate: string;
  compensatedWorkingDate: string;
  hospitalId: string;
  hospitalName: string;
  inferred: boolean; // true = guessed via legacy pairing, not an explicit saved link
}

export interface ColSummary {
  accrued: number;
  redeemed: number;
  available: number;
  wasted: number;
  creditDates: ColCreditDate[];
  availableDates: ColCreditDate[];
  wastedDates: ColCreditDate[];
  usage: ColUsageEntry[];
}

export interface ColSummaryOptions {
  context?: ColContext;
  // Availability/wastage is judged as of this date (yyyy-mm-dd) — today by
  // default; attendance forms pass the date being entered.
  asOf?: string;
}

// Credit date + 6 months, minus one day (a credit earned 15 Jan is usable
// up to and including 14 Jul). Day overflow is clamped to month end.
export function colExpiryDate(date: string): string {
  const [y, m, d] = date.substring(0, 10).split('-').map(Number);
  const targetMonthIndex = m - 1 + COL_VALIDITY_MONTHS;
  const lastDay = new Date(y, targetMonthIndex + 1, 0).getDate();
  const expiry = new Date(y, targetMonthIndex, Math.min(d, lastDay));
  expiry.setDate(expiry.getDate() - 1);
  return todayLocalDateStr(expiry);
}

// A row earns a COL credit when it's Duty -> COL, or when it's any kind of
// duty (not leave) at a government hospital on a government holiday.
function creditFor(a: Attendance, context: ColContext): { source: ColCreditSource; reason: string | null } | null {
  if (a.status === 'leave') return null;
  if (a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col') {
    return { source: 'col_duty', reason: a.col_reason || context.holidayNameOn(a.attendance_date) };
  }
  if (context.governmentHospitalIds.has(a.hospital_id)) {
    const holiday = context.holidayNameOn(a.attendance_date);
    if (holiday) return { source: 'holiday', reason: a.col_reason || holiday };
  }
  return null;
}

// Single source of truth for COL (Compensatory Off) accounting, shared by
// Dashboard, COLDashboard, Reports and every attendance form so they can
// never disagree.
//
// COL is strictly hospital-scoped: a credit earned at hospital A can only
// ever be matched against a leave taken at that same hospital A — matching
// is keyed on (hospital_id, date).
//
// Redemption prefers the explicit `compensated_working_date` link; COL
// leave rows recorded before that column existed fall back to greedy
// date-order pairing so historical data keeps displaying sensibly.
//
// Validity: a credit is usable for 6 months (see colExpiryDate). An unused
// credit past its expiry is 'wasted'.
export function getColSummary(attendance: Attendance[], hospitalId?: string, options: ColSummaryOptions = {}): ColSummary {
  const context = options.context || EMPTY_COL_CONTEXT;
  const asOf = options.asOf || todayLocalDateStr();
  const scoped = hospitalId ? attendance.filter((a) => a.hospital_id === hospitalId) : attendance;

  const colEntries = scoped
    .map((a) => ({ row: a, credit: creditFor(a, context) }))
    .filter((e): e is { row: Attendance; credit: NonNullable<ReturnType<typeof creditFor>> } => !!e.credit)
    .sort((a, b) => a.row.attendance_date.localeCompare(b.row.attendance_date));

  const leaveEntries = scoped
    .filter((a) => a.status === 'leave')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const claimKey = (hospId: string, date: string) => `${hospId}::${date}`;

  const usage: ColUsageEntry[] = [];
  const claimed = new Set<string>();

  // Pass 1: explicit, persisted links (hospital-scoped).
  for (const leave of leaveEntries) {
    if (!leave.compensated_working_date) continue;
    const col = colEntries.find(
      (c) => c.row.attendance_date === leave.compensated_working_date && c.row.hospital_id === leave.hospital_id
    );
    if (!col || claimed.has(claimKey(col.row.hospital_id, col.row.attendance_date))) continue;
    claimed.add(claimKey(col.row.hospital_id, col.row.attendance_date));
    usage.push({
      leaveAttendanceId: leave.id,
      leaveDate: leave.attendance_date,
      compensatedWorkingDate: col.row.attendance_date,
      hospitalId: leave.hospital_id,
      hospitalName: leave.hospital?.name || '—',
      inferred: false,
    });
  }

  // Pass 2: legacy fallback, only for leave rows typed as COL that predate
  // the explicit link. Never matches Casual/Medical/etc. leave.
  for (const leave of leaveEntries) {
    if (leave.compensated_working_date) continue;
    if ((leave.leave_type || '').toLowerCase() !== 'col') continue;
    const colBefore = colEntries.filter(
      (c) => c.row.hospital_id === leave.hospital_id && c.row.attendance_date <= leave.attendance_date
    );
    for (const c of colBefore) {
      const key = claimKey(c.row.hospital_id, c.row.attendance_date);
      if (!claimed.has(key)) {
        claimed.add(key);
        usage.push({
          leaveAttendanceId: leave.id,
          leaveDate: leave.attendance_date,
          compensatedWorkingDate: c.row.attendance_date,
          hospitalId: leave.hospital_id,
          hospitalName: leave.hospital?.name || '—',
          inferred: true,
        });
        break;
      }
    }
  }

  const creditDates: ColCreditDate[] = colEntries.map(({ row, credit }) => ({
    date: row.attendance_date,
    hospitalId: row.hospital_id,
    hospitalName: row.hospital?.name || '—',
    attendanceId: row.id,
    reason: credit.reason,
    expiryDate: colExpiryDate(row.attendance_date),
    source: credit.source,
  }));
  const unclaimed = creditDates.filter((c) => !claimed.has(claimKey(c.hospitalId, c.date)));
  const availableDates = unclaimed.filter((c) => asOf <= c.expiryDate);
  const wastedDates = unclaimed.filter((c) => asOf > c.expiryDate);

  return {
    accrued: colEntries.length,
    redeemed: claimed.size,
    available: availableDates.length,
    wasted: wastedDates.length,
    creditDates,
    availableDates,
    wastedDates,
    usage: usage.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate)),
  };
}

// Credits a leave on `leaveDate` may redeem: available as of that date and
// already earned by then.
export function redeemableOn(summary: ColSummary, leaveDate: string): ColCreditDate[] {
  return summary.availableDates.filter((c) => c.date <= leaveDate);
}

export type ColCreditStatus = 'available' | 'used' | 'wasted';

export interface ColYearBucket {
  year: number;
  creditedCount: number;
  usedCount: number;
  wastedCount: number;
  creditDates: (ColCreditDate & { status: ColCreditStatus })[];
}

export function creditStatus(summary: ColSummary, credit: ColCreditDate): ColCreditStatus {
  if (summary.availableDates.some((d) => d.attendanceId === credit.attendanceId)) return 'available';
  if (summary.wastedDates.some((d) => d.attendanceId === credit.attendanceId)) return 'wasted';
  return 'used';
}

// Pure reshaping of an already-computed ColSummary into year-grouped
// buckets — grouping only, so it can never disagree with getColSummary.
export function groupColByYear(summary: ColSummary): ColYearBucket[] {
  const byYear = new Map<number, ColYearBucket>();
  const ensure = (year: number) => {
    let bucket = byYear.get(year);
    if (!bucket) {
      bucket = { year, creditedCount: 0, usedCount: 0, wastedCount: 0, creditDates: [] };
      byYear.set(year, bucket);
    }
    return bucket;
  };

  summary.creditDates.forEach((c) => {
    const bucket = ensure(Number(c.date.substring(0, 4)));
    bucket.creditedCount++;
    const status = creditStatus(summary, c);
    if (status === 'wasted') bucket.wastedCount++;
    bucket.creditDates.push({ ...c, status });
  });
  summary.usage.forEach((u) => {
    ensure(Number(u.leaveDate.substring(0, 4))).usedCount++;
  });

  return Array.from(byYear.values()).sort((a, b) => b.year - a.year);
}
