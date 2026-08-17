import { Attendance } from './types';

export interface ColCreditDate {
  date: string;
  hospitalId: string;
  hospitalName: string;
  attendanceId: string;
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
  creditDates: ColCreditDate[];
  availableDates: ColCreditDate[];
  usage: ColUsageEntry[];
}

// Single source of truth for COL (Compensatory Off) accounting, shared by
// Dashboard, COLDashboard and the Attendance form so they can never disagree.
//
// A COL credit is earned by a `status='extra_duty'` row with
// `extra_duty_type='col'`. It's redeemed by a `status='leave'` row.
// COL is strictly hospital-scoped: a credit earned at hospital A can only
// ever be matched against a leave taken at that same hospital A — matching
// is keyed on (hospital_id, date), not date alone (two different hospitals
// can otherwise coincidentally share a calendar date).
//
// Redemption prefers the explicit `compensated_working_date` link (set by
// the Attendance form going forward); leave rows recorded before that
// column existed have no link, so they fall back to the app's original
// greedy date-order pairing (also now hospital-scoped) so historical data
// keeps displaying sensibly.
//
// Pass `hospitalId` to get the summary for just one hospital (e.g. to
// populate a "compensates COL credit" picker that must not leak other
// hospitals' credits).
export function getColSummary(attendance: Attendance[], hospitalId?: string): ColSummary {
  const scoped = hospitalId ? attendance.filter((a) => a.hospital_id === hospitalId) : attendance;

  const colEntries = scoped
    .filter((a) => a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const leaveEntries = scoped
    .filter((a) => a.status === 'leave')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const claimKey = (hospId: string, date: string) => `${hospId}::${date}`;

  const usage: ColUsageEntry[] = [];
  const claimed = new Set<string>();

  // Pass 1: explicit, persisted links (still hospital-scoped — a link
  // pointing at a different hospital's date, e.g. from stale data, is
  // simply not honoured).
  for (const leave of leaveEntries) {
    if (!leave.compensated_working_date) continue;
    const col = colEntries.find(
      (c) => c.attendance_date === leave.compensated_working_date && c.hospital_id === leave.hospital_id
    );
    if (!col || claimed.has(claimKey(col.hospital_id, col.attendance_date))) continue;
    claimed.add(claimKey(col.hospital_id, col.attendance_date));
    usage.push({
      leaveAttendanceId: leave.id,
      leaveDate: leave.attendance_date,
      compensatedWorkingDate: col.attendance_date,
      hospitalId: leave.hospital_id,
      hospitalName: leave.hospital?.name || '—',
      inferred: false,
    });
  }

  // Pass 2: legacy fallback for leave rows with no explicit link yet —
  // only matches COL credits earned at the SAME hospital as the leave.
  for (const leave of leaveEntries) {
    if (leave.compensated_working_date) continue;
    const colBefore = colEntries.filter(
      (c) => c.hospital_id === leave.hospital_id && c.attendance_date <= leave.attendance_date
    );
    for (const c of colBefore) {
      const key = claimKey(c.hospital_id, c.attendance_date);
      if (!claimed.has(key)) {
        claimed.add(key);
        usage.push({
          leaveAttendanceId: leave.id,
          leaveDate: leave.attendance_date,
          compensatedWorkingDate: c.attendance_date,
          hospitalId: leave.hospital_id,
          hospitalName: leave.hospital?.name || '—',
          inferred: true,
        });
        break;
      }
    }
  }

  const creditDates: ColCreditDate[] = colEntries.map((c) => ({
    date: c.attendance_date,
    hospitalId: c.hospital_id,
    hospitalName: c.hospital?.name || '—',
    attendanceId: c.id,
  }));
  const availableDates = creditDates.filter((c) => !claimed.has(claimKey(c.hospitalId, c.date)));

  return {
    accrued: colEntries.length,
    redeemed: claimed.size,
    available: availableDates.length,
    creditDates,
    availableDates,
    usage: usage.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate)),
  };
}
