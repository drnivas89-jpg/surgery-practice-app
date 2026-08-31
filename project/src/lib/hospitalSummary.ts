import { Attendance, Hospital, MonthlyEntry, Patient, Payment, Surgery } from './types';
import { getColSummary } from './col';

export const SURGERY_CATEGORIES = ['Major', 'Minor', 'Bedside', 'Endoscopy', 'Others'] as const;
export type SurgeryCategory = typeof SURGERY_CATEGORIES[number];

// Prefers the explicit procedure_category column; falls back to matching
// the legacy free-text surgery_type against the category names, for
// surgery rows saved before procedure_category existed.
export function categorizeSurgery(surgery: { procedure_category?: string | null; surgery_type: string | null | undefined }): SurgeryCategory {
  if (surgery.procedure_category && (SURGERY_CATEGORIES as readonly string[]).includes(surgery.procedure_category)) {
    return surgery.procedure_category as SurgeryCategory;
  }
  const t = (surgery.surgery_type || '').trim().toLowerCase();
  const match = SURGERY_CATEGORIES.find((c) => c.toLowerCase() === t);
  return match || 'Others';
}

function emptyCategoryCounts(): Record<SurgeryCategory, number> {
  return SURGERY_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<SurgeryCategory, number>);
}

export interface LeaveBreakdown { cl: number; weekOff: number; medical: number; pdo: number; col: number; other: number; }

export const LEAVE_BREAKDOWN_KEYS: { key: keyof LeaveBreakdown; label: string }[] = [
  { key: 'cl', label: 'CL' },
  { key: 'weekOff', label: 'Week Off' },
  { key: 'medical', label: 'Medical' },
  { key: 'pdo', label: 'PDO' },
  { key: 'col', label: 'COL' },
  { key: 'other', label: 'Other' },
];

// A leave row is COL if it redeemed a compensated_working_date or its
// leave_type is the 'col' slug; otherwise matched against the fixed
// leave-type slugs written going forward (casual/week_off/medical/pdo),
// with substring fallbacks so legacy free text (e.g. "Sick", "Casual")
// still lands in a sensible bucket instead of always falling to Other.
export function classifyLeave(a: Attendance): keyof LeaveBreakdown {
  if (a.compensated_working_date) return 'col';
  const t = (a.leave_type || '').toLowerCase();
  if (t === 'col') return 'col';
  if (t === 'casual' || t.includes('casual')) return 'cl';
  if (t === 'week_off' || t.includes('week off') || t.includes('weekoff') || t.includes('week-off')) return 'weekOff';
  if (t === 'medical' || t.includes('medical') || t.includes('sick')) return 'medical';
  if (t === 'pdo') return 'pdo';
  return 'other';
}

export interface DailyRow {
  date: string;
  hospitalName: string;
  attendanceStatusLabel: string | null;
  opCount: number;
  ipCount: number;
  opinionCount: number;
  surgeriesCount: number;
  feesGenerated: number;
  feesReceived: number;
  pendingFees: number;
  isMissing: boolean;
  isZeroActivity: boolean;
  hasAnyRecord: boolean;
}

export interface HospitalSummary {
  hospital: Hospital;
  opCount: number; ipCount: number; opinionCount: number;
  surgeriesCount: number;
  surgeryCategories: Record<SurgeryCategory, number>;
  feesGenerated: number; feesReceived: number; overallPending: number;
  present: number;
  dutyCount: number;
  dutyDates: string[];
  leaveBreakdown: LeaveBreakdown;
  leaveDates: { date: string; type: keyof LeaveBreakdown }[];
  colAccrued: number;
  colRedeemed: number;
  colAvailable: number;
  missingEntryDates: string[];
  days: DailyRow[];
  hasActivity: boolean;
}

// Every calendar date from `start` to `end` (inclusive), capped so an
// unbounded "all time" range can't blow up into thousands of enumerated
// rows — beyond the cap, only dates that actually have a record are
// included (no exhaustive gap-filling, so no red "missing" rows for very
// wide ranges, which is an acceptable trade-off for practicality).
const MAX_ENUMERATED_DAYS = 400;

function enumerateDates(start: string, end: string): string[] | null {
  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const dayCount = Math.round((endMs - startMs) / 86400000) + 1;
  if (dayCount <= 0 || dayCount > MAX_ENUMERATED_DAYS) return null;
  const dates: string[] = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startMs + i * 86400000);
    dates.push(d.toISOString().substring(0, 10));
  }
  return dates;
}

export interface BuildHospitalSummariesParams {
  hospitals: Hospital[];
  patients: Patient[];
  payments: Payment[];
  surgeries: Surgery[];
  monthlyEntries: MonthlyEntry[];
  attendance: Attendance[];
  rangeStart: string; // yyyy-mm-dd, inclusive
  rangeEnd: string;   // yyyy-mm-dd, inclusive
  /** All-time-to-date fields (pending fees, COL) ignore the range and use these full datasets directly. */
  todayStr: string;
}

// Single source of truth for per-hospital, per-date aggregation — powers
// the Hospitals page card grid + date-wise drill-down, and the Reports
// page's hierarchy. Every date in [rangeStart, rangeEnd] gets a row (when
// under MAX_ENUMERATED_DAYS), even with zero activity, so red "missing"
// rows are possible in the date-wise table.
export function buildHospitalSummaries(params: BuildHospitalSummariesParams): HospitalSummary[] {
  const { hospitals, patients, payments, surgeries, monthlyEntries, attendance, rangeStart, rangeEnd, todayStr } = params;

  const patientById = new Map(patients.map((p) => [p.id, p]));

  const rangePatients = patients.filter((p) => {
    const dates = [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at].filter(Boolean) as string[];
    return dates.some((d) => d.substring(0, 10) >= rangeStart && d.substring(0, 10) <= rangeEnd);
  });
  const rangeSurgeries = surgeries.filter((s) => {
    if (!s.surgery_date) return false;
    const d = s.surgery_date.substring(0, 10);
    return d >= rangeStart && d <= rangeEnd;
  });
  const rangePayments = payments.filter((pay) => {
    if (!pay.payment_date) return false;
    const d = pay.payment_date.substring(0, 10);
    return d >= rangeStart && d <= rangeEnd;
  });
  const rangeEntries = monthlyEntries.filter((me) => {
    const d = (me.entry_date || me.month).substring(0, 10);
    return d >= rangeStart && d <= rangeEnd;
  });
  const rangeAttendance = attendance.filter((a) => a.attendance_date >= rangeStart && a.attendance_date <= rangeEnd);

  const elapsedDates = enumerateDates(rangeStart, rangeEnd < todayStr ? rangeEnd : todayStr);

  return hospitals.map((h) => {
    const hospEntries = rangeEntries.filter((me) => me.hospital_id === h.id);
    const hospPatients = rangePatients.filter((p) => p.hospital_id === h.id);
    const hospPayments = rangePayments.filter((pay) => pay.hospital_id === h.id);
    const hospSurgeries = rangeSurgeries.filter((s) => patientById.get(s.patient_id)?.hospital_id === h.id);

    const opCount = hospEntries.reduce((s, me) => s + me.op_patients, 0);
    const ipCount = hospPatients.filter((p) => p.patient_type === 'ip').length;
    const opinionCount = hospEntries.reduce((s, me) => s + me.opinion_patients, 0);

    const surgeryCategories = emptyCategoryCounts();
    hospSurgeries.forEach((s) => { surgeryCategories[categorizeSurgery(s)]++; });

    const feesGenerated =
      hospPatients.reduce((s, p) => s + (p.fees || 0), 0) +
      hospEntries.reduce((s, me) => s + me.fees_generated, 0);
    const feesReceived =
      hospPayments.reduce((s, p) => s + p.amount, 0) +
      hospEntries.reduce((s, me) => s + me.fees_received, 0);

    // Pending is all-time-to-date, not limited to the selected range — an
    // outstanding balance doesn't reset when you change the filter.
    const allHospPatients = patients.filter((p) => p.hospital_id === h.id);
    const allHospPayments = payments.filter((pay) => pay.hospital_id === h.id);
    const allHospEntries = monthlyEntries.filter(
      (me) => me.hospital_id === h.id && (me.entry_date || me.month).substring(0, 10) <= todayStr
    );
    const overallFees =
      allHospPatients.reduce((s, p) => s + (p.fees || 0), 0) +
      allHospEntries.reduce((s, me) => s + me.fees_generated, 0);
    const overallReceived =
      allHospPayments.reduce((s, p) => s + p.amount, 0) +
      allHospEntries.reduce((s, me) => s + me.fees_received, 0);
    const overallPending = overallFees - overallReceived;

    const hospAtt = rangeAttendance.filter((a) => a.hospital_id === h.id);
    const present = hospAtt.filter((a) => a.status === 'present').length;
    const duties = hospAtt.filter((a) => a.status === 'present' && a.duty_type === 'duty');
    const leaves = hospAtt.filter((a) => a.status === 'leave');
    const extraDuties = hospAtt.filter((a) => a.status === 'extra_duty');

    const leaveBreakdown: LeaveBreakdown = { cl: 0, weekOff: 0, medical: 0, pdo: 0, col: 0, other: 0 };
    leaves.forEach((l) => { leaveBreakdown[classifyLeave(l)]++; });

    // COL is a running balance, not reset by the range filter — scoped to
    // this hospital only, since COL is hospital-strict.
    const hospColSummary = getColSummary(attendance, h.id);

    const dayMap = new Map<string, { date: string; attendance: Attendance[]; patients: Patient[]; surgeries: Surgery[]; payments: Payment[]; entry: MonthlyEntry | null }>();
    const ensureDay = (date: string) => {
      if (!dayMap.has(date)) dayMap.set(date, { date, attendance: [], patients: [], surgeries: [], payments: [], entry: null });
      return dayMap.get(date)!;
    };
    (elapsedDates || []).forEach((d) => ensureDay(d));
    hospAtt.forEach((a) => ensureDay(a.attendance_date).attendance.push(a));
    hospEntries.forEach((me) => { ensureDay((me.entry_date || me.month).substring(0, 10)).entry = me; });
    hospPatients.forEach((p) => {
      const d = [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at].find(Boolean);
      if (d) ensureDay(d.substring(0, 10)).patients.push(p);
    });
    hospSurgeries.forEach((s) => { if (s.surgery_date) ensureDay(s.surgery_date.substring(0, 10)).surgeries.push(s); });
    hospPayments.forEach((pay) => { if (pay.payment_date) ensureDay(pay.payment_date.substring(0, 10)).payments.push(pay); });

    const days: DailyRow[] = Array.from(dayMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((d) => {
        const attRow = d.attendance[0] || null;
        const attendanceStatusLabel = attRow
          ? attRow.status === 'present'
            ? (attRow.duty_type === 'duty' ? '24 Hrs Duty' : 'Present')
            : attRow.status === 'leave'
            ? `Leave (${LEAVE_BREAKDOWN_KEYS.find((k) => k.key === classifyLeave(attRow))?.label || 'Other'})`
            : 'Extra Duty'
          : null;
        const dayOp = d.entry?.op_patients || 0;
        const dayIp = d.patients.filter((p) => p.patient_type === 'ip').length;
        const dayOpinion = d.entry?.opinion_patients || 0;
        const daySurgeries = d.surgeries.length;
        const dayFeesGenerated = (d.entry?.fees_generated || 0) + d.patients.reduce((s, p) => s + (p.fees || 0), 0);
        const dayFeesReceived = (d.entry?.fees_received || 0) + d.payments.reduce((s, p) => s + p.amount, 0);
        const hasAnyRecord = d.attendance.length > 0 || !!d.entry || d.patients.length > 0 || d.surgeries.length > 0 || d.payments.length > 0;
        const isZeroActivity = attendanceStatusLabel === 'Present' && dayOp === 0 && dayIp === 0 && dayOpinion === 0;
        return {
          date: d.date,
          hospitalName: h.name,
          attendanceStatusLabel,
          opCount: dayOp,
          ipCount: dayIp,
          opinionCount: dayOpinion,
          surgeriesCount: daySurgeries,
          feesGenerated: dayFeesGenerated,
          feesReceived: dayFeesReceived,
          pendingFees: dayFeesGenerated - dayFeesReceived,
          isMissing: !hasAnyRecord,
          isZeroActivity,
          hasAnyRecord,
        };
      });

    const missingEntryDates = days.filter((d) => d.isMissing).map((d) => d.date);

    return {
      hospital: h,
      opCount, ipCount, opinionCount,
      surgeriesCount: hospSurgeries.length,
      surgeryCategories,
      feesGenerated, feesReceived, overallPending,
      present,
      dutyCount: duties.length,
      dutyDates: duties.map((d) => d.attendance_date),
      leaveBreakdown,
      leaveDates: leaves.map((l) => ({ date: l.attendance_date, type: classifyLeave(l) })),
      colAccrued: hospColSummary.accrued,
      colRedeemed: hospColSummary.redeemed,
      colAvailable: hospColSummary.available,
      missingEntryDates,
      days,
      hasActivity:
        opCount > 0 || ipCount > 0 || opinionCount > 0 || hospSurgeries.length > 0 || feesGenerated > 0 ||
        present > 0 || leaves.length > 0 || extraDuties.length > 0 || overallPending !== 0,
    };
  });
}
