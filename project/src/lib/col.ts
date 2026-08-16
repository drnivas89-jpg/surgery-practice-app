import { Attendance } from './types';

export interface ColCreditDate {
  date: string;
  hospitalName: string;
  attendanceId: string;
}

export interface ColUsageEntry {
  leaveDate: string;
  compensatedWorkingDate: string;
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
// Dashboard, COLDashboard and SurgicalLogbook so they can never disagree.
//
// A COL credit is earned by a `status='extra_duty'` row with
// `extra_duty_type='col'`. It's redeemed by a `status='leave'` row.
// Redemption prefers the explicit `compensated_working_date` link (set by
// the Attendance form going forward); leave rows recorded before that
// column existed have no link, so they fall back to the app's original
// greedy date-order pairing so historical data keeps displaying sensibly.
export function getColSummary(attendance: Attendance[]): ColSummary {
  const colEntries = attendance
    .filter((a) => a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const leaveEntries = attendance
    .filter((a) => a.status === 'leave')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const usage: ColUsageEntry[] = [];
  const claimedDates = new Set<string>();

  // Pass 1: explicit, persisted links.
  for (const leave of leaveEntries) {
    if (!leave.compensated_working_date) continue;
    const col = colEntries.find((c) => c.attendance_date === leave.compensated_working_date);
    if (!col || claimedDates.has(col.attendance_date)) continue;
    claimedDates.add(col.attendance_date);
    usage.push({
      leaveDate: leave.attendance_date,
      compensatedWorkingDate: col.attendance_date,
      hospitalName: leave.hospital?.name || '—',
      inferred: false,
    });
  }

  // Pass 2: legacy fallback for leave rows with no explicit link yet.
  for (const leave of leaveEntries) {
    if (leave.compensated_working_date) continue;
    const colBefore = colEntries
      .filter((c) => c.attendance_date <= leave.attendance_date)
      .map((c) => c.attendance_date);
    for (const d of colBefore) {
      if (!claimedDates.has(d)) {
        claimedDates.add(d);
        usage.push({
          leaveDate: leave.attendance_date,
          compensatedWorkingDate: d,
          hospitalName: leave.hospital?.name || '—',
          inferred: true,
        });
        break;
      }
    }
  }

  const creditDates: ColCreditDate[] = colEntries.map((c) => ({
    date: c.attendance_date,
    hospitalName: c.hospital?.name || '—',
    attendanceId: c.id,
  }));
  const availableDates = creditDates.filter((c) => !claimedDates.has(c.date));

  return {
    accrued: colEntries.length,
    redeemed: claimedDates.size,
    available: availableDates.length,
    creditDates,
    availableDates,
    usage: usage.sort((a, b) => a.leaveDate.localeCompare(b.leaveDate)),
  };
}
