import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Payment, Surgery, MonthlyEntry, Attendance } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { View } from './Layout';
import {
  Calendar, AlertTriangle, Clock, Zap, IndianRupee, Users, Building2, Activity,
  Search, ChevronLeft, ChevronRight, ArrowLeft, Stethoscope, MessageCircleQuestion, Award, X,
} from 'lucide-react';

const SURGERY_CATEGORIES = ['Major', 'Minor', 'Bedside', 'Endoscopy', 'Others'] as const;
type SurgeryCategory = typeof SURGERY_CATEGORIES[number];

function categorize(surgeryType: string | null | undefined): SurgeryCategory {
  const t = (surgeryType || '').trim().toLowerCase();
  const match = SURGERY_CATEGORIES.find((c) => c.toLowerCase() === t);
  return match || 'Others';
}

function emptyCategoryCounts(): Record<SurgeryCategory, number> {
  return SURGERY_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<SurgeryCategory, number>);
}

interface LeaveBreakdown { cl: number; col: number; other: number; }

// A leave row is COL if it redeemed a compensated_working_date, CL if its
// free-text leave_type says "casual", otherwise Other.
function classifyLeave(a: Attendance): keyof LeaveBreakdown {
  if (a.compensated_working_date) return 'col';
  if ((a.leave_type || '').toLowerCase().includes('casual')) return 'cl';
  return 'other';
}

interface DateListRow {
  date: string;
  hospitalName: string;
  detail?: string;
}

function DateListModal({ title, rows, onClose }: { title: string; rows: DateListRow[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5 max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-slate-700">{title}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-4 h-4" /></button>
        </div>
        <div className="space-y-1.5">
          {rows.map((r, i) => (
            <div key={i} className="flex justify-between text-sm border-b border-slate-50 last:border-0 py-1.5">
              <span className="text-slate-700">{formatDate(r.date)}</span>
              <span className="text-slate-400">{r.hospitalName}{r.detail ? ` · ${r.detail}` : ''}</span>
            </div>
          ))}
          {rows.length === 0 && <p className="text-sm text-slate-400 py-2">No dates to show.</p>}
        </div>
      </div>
    </div>
  );
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface DashboardProps {
  onNavigate: (view: View) => void;
}

interface SurgeryAlert {
  patient: Patient;
  daysLeft: number | null;
  type: 'surgery' | 'followup';
}

type Level = 'global' | 'hospitals' | 'detail';

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateListModal, setDateListModal] = useState<{ title: string; rows: DateListRow[] } | null>(null);

  const [level, setLevel] = useState<Level>('global');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: h }, { data: pay }, { data: sur }, { data: me }, { data: att }] = await Promise.all([
        supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
        supabase.from('hospitals').select('*').order('name'),
        supabase.from('payments').select('*, patient:patients(*)'),
        supabase.from('surgeries').select('*').order('surgery_date', { ascending: false }),
        supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
        supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
      ]);
      setPatients(p || []);
      setHospitals(h || []);
      setPayments(pay || []);
      setSurgeries(sur || []);
      setMonthlyEntries(me || []);
      setAttendance(att || []);
      setLoading(false);
    })();
  }, [user]);

  const selectedMonthStart = new Date(selectedYear, selectedMonth, 1).toISOString().substring(0, 10);
  const selectedMonthEnd = new Date(selectedYear, selectedMonth + 1, 0).toISOString().substring(0, 10);
  const selectedMonthKey = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;

  const isCurrentMonth = useMemo(() => {
    return selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  }, [selectedYear, selectedMonth, now]);

  // Patients in the selected month (by admission, surgery, follow-up, or creation date)
  const monthPatients = patients.filter((p) => {
    const dates = [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at].filter(Boolean) as string[];
    return dates.some((d) => d.substring(0, 10) >= selectedMonthStart && d.substring(0, 10) <= selectedMonthEnd);
  });

  const monthSurgeries = surgeries.filter((s) => {
    if (!s.surgery_date) return false;
    const d = s.surgery_date.substring(0, 10);
    return d >= selectedMonthStart && d <= selectedMonthEnd;
  });

  const monthPayments = payments.filter((pay) => {
    if (!pay.payment_date) return false;
    return pay.payment_date.substring(0, 7) === selectedMonthKey;
  });

  const monthEntries = monthlyEntries.filter((me) => {
    const meMonth = (me.entry_date || me.month).substring(0, 7);
    return meMonth === selectedMonthKey;
  });

  const filteredMonthPatients = monthPatients.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.patient_name.toLowerCase().includes(q) ||
      p.unique_id.toLowerCase().includes(q) ||
      (p.hospital?.name || '').toLowerCase().includes(q)
    );
  });

  // Alerts (only shown for the current month)
  const surgeryAlerts: SurgeryAlert[] = patients
    .filter((p) => p.surgery_date)
    .map((p) => ({ patient: p, daysLeft: daysUntil(p.surgery_date), type: 'surgery' as const }));
  const followupAlerts: SurgeryAlert[] = patients
    .filter((p) => p.follow_up_date)
    .map((p) => ({ patient: p, daysLeft: daysUntil(p.follow_up_date), type: 'followup' as const }));
  const allAlerts = [...surgeryAlerts, ...followupAlerts].sort((a, b) => {
    if (a.daysLeft === null) return 1;
    if (b.daysLeft === null) return -1;
    return a.daysLeft - b.daysLeft;
  });

  const patientById = new Map(patients.map((p) => [p.id, p]));
  const todayStr = now.toISOString().substring(0, 10);

  const monthAttendance = attendance.filter((a) => a.attendance_date.substring(0, 7) === selectedMonthKey);

  // Every calendar date in the selected month, up to today if it's the
  // current month (future dates can't be "missing" yet).
  const elapsedDates: string[] = [];
  {
    const lastDay = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${selectedMonthKey}-${String(d).padStart(2, '0')}`;
      if (dateStr > todayStr) break;
      elapsedDates.push(dateStr);
    }
  }

  // One row per hospital, with every Level 1/2/3 metric pre-computed —
  // nothing here needs a new query, everything is already loaded above.
  const hospitalSummary = hospitals.map((h) => {
    const hospMonthEntries = monthEntries.filter((me) => me.hospital_id === h.id);
    const hospMonthPatients = monthPatients.filter((p) => p.hospital_id === h.id);
    const hospMonthPayments = monthPayments.filter((pay) => pay.hospital_id === h.id);
    const hospMonthSurgeries = monthSurgeries.filter((s) => patientById.get(s.patient_id)?.hospital_id === h.id);

    const opCount = hospMonthEntries.reduce((s, me) => s + me.op_patients, 0);
    const ipCount = hospMonthEntries.reduce((s, me) => s + me.ip_patients, 0);
    const opinionCount = hospMonthEntries.reduce((s, me) => s + me.opinion_patients, 0);

    const surgeryCategories = emptyCategoryCounts();
    hospMonthSurgeries.forEach((s) => { surgeryCategories[categorize(s.surgery_type)]++; });

    const feesGenerated =
      hospMonthPatients.reduce((s, p) => s + (p.fees || 0), 0) +
      hospMonthEntries.reduce((s, me) => s + me.fees_generated, 0);
    const feesReceived =
      hospMonthPayments.reduce((s, p) => s + p.amount, 0) +
      hospMonthEntries.reduce((s, me) => s + me.fees_received, 0);

    // Pending is all-time-to-date, not limited to the selected month —
    // an outstanding balance doesn't reset every month.
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

    const hospAtt = monthAttendance.filter((a) => a.hospital_id === h.id);
    const present = hospAtt.filter((a) => a.status === 'present').length;
    const duties = hospAtt.filter((a) => a.status === 'present' && a.duty_type === 'duty');
    const leaves = hospAtt.filter((a) => a.status === 'leave');
    const extraDuties = hospAtt.filter((a) => a.status === 'extra_duty');

    const leaveBreakdown: LeaveBreakdown = { cl: 0, col: 0, other: 0 };
    leaves.forEach((l) => { leaveBreakdown[classifyLeave(l)]++; });

    // COL is a running balance, not reset monthly — scoped to this hospital
    // only, since COL is hospital-strict.
    const hospColSummary = getColSummary(attendance, h.id);

    const datesWithEntry = new Set<string>([
      ...hospMonthEntries.map((me) => (me.entry_date || me.month).substring(0, 10)),
      ...hospAtt.map((a) => a.attendance_date),
    ]);
    const missingEntryDates = elapsedDates.filter((d) => !datesWithEntry.has(d));

    // Date-wise breakdown for Level 3 — built once here so drilling into a
    // hospital needs no extra query.
    const dayMap = new Map<string, { date: string; attendance: Attendance[]; patients: Patient[]; surgeries: Surgery[]; entry: MonthlyEntry | null }>();
    const ensureDay = (date: string) => {
      if (!dayMap.has(date)) dayMap.set(date, { date, attendance: [], patients: [], surgeries: [], entry: null });
      return dayMap.get(date)!;
    };
    hospAtt.forEach((a) => ensureDay(a.attendance_date).attendance.push(a));
    hospMonthEntries.forEach((me) => { ensureDay((me.entry_date || me.month).substring(0, 10)).entry = me; });
    hospMonthPatients.forEach((p) => {
      const d = [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at].find(Boolean);
      if (d) ensureDay(d.substring(0, 10)).patients.push(p);
    });
    hospMonthSurgeries.forEach((s) => { if (s.surgery_date) ensureDay(s.surgery_date.substring(0, 10)).surgeries.push(s); });
    const days = Array.from(dayMap.values()).sort((a, b) => b.date.localeCompare(a.date));

    return {
      hospital: h,
      opCount, ipCount, opinionCount,
      surgeriesCount: hospMonthSurgeries.length,
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
        opCount > 0 || ipCount > 0 || opinionCount > 0 || hospMonthSurgeries.length > 0 || feesGenerated > 0 ||
        present > 0 || leaves.length > 0 || extraDuties.length > 0 || overallPending !== 0,
    };
  }).filter((hs) => hs.hasActivity);

  const selectedHospital = hospitalSummary.find((hs) => hs.hospital.id === selectedHospitalId) || null;

  // ---- Level 1 (global) aggregates ----
  const globalCensus = hospitalSummary.reduce((acc, hs) => ({
    op: acc.op + hs.opCount, ip: acc.ip + hs.ipCount, opinion: acc.opinion + hs.opinionCount,
  }), { op: 0, ip: 0, opinion: 0 });

  const globalSurgeryCategories = emptyCategoryCounts();
  hospitalSummary.forEach((hs) => SURGERY_CATEGORIES.forEach((c) => { globalSurgeryCategories[c] += hs.surgeryCategories[c]; }));

  const globalLeave = hospitalSummary.reduce((acc, hs) => ({
    cl: acc.cl + hs.leaveBreakdown.cl, col: acc.col + hs.leaveBreakdown.col, other: acc.other + hs.leaveBreakdown.other,
  }), { cl: 0, col: 0, other: 0 });

  const globalCol = getColSummary(attendance); // all hospitals, all-time
  const globalFees = hospitalSummary.reduce((acc, hs) => ({
    generated: acc.generated + hs.feesGenerated, received: acc.received + hs.feesReceived, pending: acc.pending + hs.overallPending,
  }), { generated: 0, received: 0, pending: 0 });

  const goToPrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); }
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); }
  };
  const goToCurrentMonth = () => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); };

  const availableYears = Array.from(
    new Set(
      patients
        .flatMap((p) => [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at])
        .filter((d): d is string => !!d)
        .map((d) => new Date(d).getFullYear())
    )
  ).sort((a, b) => b - a);
  if (!availableYears.includes(now.getFullYear())) availableYears.unshift(now.getFullYear());

  const openDutyDrilldown = (hs: typeof hospitalSummary[number]) => {
    setDateListModal({ title: `Duty Dates — ${hs.hospital.name}`, rows: hs.dutyDates.map((date) => ({ date, hospitalName: hs.hospital.name })) });
  };

  const openHospital = (hospitalId: string) => { setSelectedHospitalId(hospitalId); setLevel('detail'); };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {level !== 'global' && (
            <button
              onClick={() => { if (level === 'detail') { setLevel('hospitals'); setSelectedHospitalId(null); } else { setLevel('global'); } }}
              className="p-2 rounded-lg hover:bg-slate-100 transition"
            >
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {level === 'global' ? 'Dashboard' : level === 'hospitals' ? 'Hospitals' : selectedHospital?.hospital.name || 'Hospital'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {level === 'global' ? 'Monthly overview of your surgical practice' : level === 'hospitals' ? 'All five categories, per hospital' : `Date-wise log — ${MONTHS[selectedMonth]} ${selectedYear}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <button onClick={goToPrevMonth} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={goToNextMonth} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
          {!isCurrentMonth && (
            <button onClick={goToCurrentMonth} className="ml-1 text-xs font-medium text-sky-600 hover:text-sky-700 px-2 py-1 rounded-lg hover:bg-sky-50 transition">Today</button>
          )}
        </div>
      </div>

      {patients.length === 0 && hospitals.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-3">Welcome! Start by adding a hospital, then create your first patient.</p>
          <button onClick={() => onNavigate('hospitals')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition">Add Your First Hospital</button>
        </div>
      )}

      {level === 'global' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <button onClick={() => setLevel('hospitals')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-sky-500" /><h2 className="font-semibold text-slate-700">Census</h2></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xl font-bold text-sky-700">{globalCensus.op}</p><p className="text-[11px] text-slate-400">OP</p></div>
                <div><p className="text-xl font-bold text-violet-700">{globalCensus.ip}</p><p className="text-[11px] text-slate-400">IP</p></div>
                <div><p className="text-xl font-bold text-amber-700">{globalCensus.opinion}</p><p className="text-[11px] text-slate-400">Opinion</p></div>
              </div>
            </button>

            <button onClick={() => setLevel('hospitals')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-700">Surgery</h2></div>
              <div className="grid grid-cols-5 gap-1 text-center">
                {SURGERY_CATEGORIES.map((c) => (
                  <div key={c}><p className="text-lg font-bold text-slate-800">{globalSurgeryCategories[c]}</p><p className="text-[9px] text-slate-400">{c}</p></div>
                ))}
              </div>
            </button>

            <button onClick={() => setLevel('hospitals')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-red-500" /><h2 className="font-semibold text-slate-700">Leave</h2></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-xl font-bold text-red-700">{globalLeave.cl}</p><p className="text-[11px] text-slate-400">CL</p></div>
                <div><p className="text-xl font-bold text-amber-700">{globalLeave.col}</p><p className="text-[11px] text-slate-400">COL</p></div>
                <div><p className="text-xl font-bold text-slate-600">{globalLeave.other}</p><p className="text-[11px] text-slate-400">Other</p></div>
              </div>
            </button>

            <button onClick={() => onNavigate('col')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
              <div className="flex items-center gap-2 mb-3"><Zap className="w-4 h-4 text-amber-500" /><h2 className="font-semibold text-slate-700">COL</h2></div>
              <div className="grid grid-cols-2 gap-2 text-center">
                <div><p className="text-xl font-bold text-amber-700">{globalCol.accrued}</p><p className="text-[11px] text-slate-400">Earned</p></div>
                <div><p className="text-xl font-bold text-slate-600">{globalCol.redeemed}</p><p className="text-[11px] text-slate-400">Used</p></div>
              </div>
            </button>

            <button onClick={() => onNavigate('revenue')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition sm:col-span-2 lg:col-span-1">
              <div className="flex items-center gap-2 mb-3"><IndianRupee className="w-4 h-4 text-emerald-500" /><h2 className="font-semibold text-slate-700">Fees</h2></div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div><p className="text-lg font-bold text-slate-700">{formatCurrency(globalFees.generated)}</p><p className="text-[11px] text-slate-400">Generated</p></div>
                <div><p className="text-lg font-bold text-emerald-600">{formatCurrency(globalFees.received)}</p><p className="text-[11px] text-slate-400">Received</p></div>
                <div><p className={`text-lg font-bold ${globalFees.pending > 0 ? 'text-red-600' : 'text-slate-500'}`}>{formatCurrency(globalFees.pending)}</p><p className="text-[11px] text-slate-400">Pending</p></div>
              </div>
            </button>
          </div>

          {/* Alerts */}
          {isCurrentMonth && (
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4"><Clock className="w-4 h-4 text-amber-500" /><h2 className="font-semibold text-slate-700">Surgery & Follow-up Alerts</h2></div>
              {allAlerts.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No upcoming surgery or follow-up dates</p>
              ) : (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {allAlerts.slice(0, 10).map((alert, i) => {
                    const isSurgery = alert.type === 'surgery';
                    const overdue = alert.daysLeft !== null && alert.daysLeft < 0;
                    const soon = alert.daysLeft !== null && alert.daysLeft >= 0 && alert.daysLeft <= 7;
                    return (
                      <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${overdue ? 'border-red-200 bg-red-50' : soon ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'}`}>
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${isSurgery ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'}`}>
                          {isSurgery ? <Activity className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate">{alert.patient.patient_name}</p>
                          <p className="text-xs text-slate-400">{isSurgery ? 'Surgery' : 'Follow-up'}: {formatDate(isSurgery ? alert.patient.surgery_date : alert.patient.follow_up_date)}</p>
                        </div>
                        {alert.daysLeft !== null && (
                          <span className={`text-xs font-medium px-2 py-1 rounded ${overdue ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {overdue ? `${Math.abs(alert.daysLeft)}d overdue` : alert.daysLeft === 0 ? 'Today' : `in ${alert.daysLeft}d`}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {globalFees.pending > 0 && (
            <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
              <p className="text-sm text-amber-800"><span className="font-semibold">{formatCurrency(globalFees.pending)}</span> in pending fees overall, up to today.</p>
              <button onClick={() => onNavigate('revenue')} className="ml-auto text-sm font-medium text-amber-700 hover:text-amber-800 underline">View Revenue →</button>
            </div>
          )}

          {/* Patients this month with search */}
          <div className="bg-white rounded-xl border border-slate-200 p-5">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <div className="flex items-center gap-2"><Users className="w-4 h-4 text-sky-500" /><h2 className="font-semibold text-slate-700">Patients — {MONTHS[selectedMonth]} {selectedYear}</h2></div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, ID, hospital..." className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-full sm:w-64" />
              </div>
            </div>
            {filteredMonthPatients.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">{search ? 'No patients match your search for this month.' : 'No patient activity in this month.'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2 font-medium">Patient ID</th>
                      <th className="px-3 py-2 font-medium">Name</th>
                      <th className="px-3 py-2 font-medium">Hospital</th>
                      <th className="px-3 py-2 font-medium">Fees</th>
                      <th className="px-3 py-2 font-medium">Surgery Date</th>
                      <th className="px-3 py-2 font-medium">Follow-up</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMonthPatients.map((p) => (
                      <tr key={p.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                        <td className="px-3 py-2.5 font-mono text-xs text-sky-600 font-medium">{p.unique_id}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">{p.patient_name}</td>
                        <td className="px-3 py-2.5 text-slate-500">{p.hospital?.name || '—'}</td>
                        <td className="px-3 py-2.5 text-slate-600 font-medium">{formatCurrency(p.fees || 0)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatDate(p.surgery_date)}</td>
                        <td className="px-3 py-2.5 text-slate-600">{formatDate(p.follow_up_date)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {level === 'hospitals' && (
        hospitalSummary.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No hospital activity in this month.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {hospitalSummary.map((hs) => (
              <button key={hs.hospital.id} onClick={() => openHospital(hs.hospital.id)} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition space-y-4">
                <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-slate-800">{hs.hospital.name}</h2></div>

                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">Census</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-sky-700">{hs.opCount}</p><p className="text-[10px] text-slate-400">OP</p></div>
                    <div><p className="text-lg font-bold text-violet-700">{hs.ipCount}</p><p className="text-[10px] text-slate-400">IP</p></div>
                    <div><p className="text-lg font-bold text-amber-700">{hs.opinionCount}</p><p className="text-[10px] text-slate-400">Opinion</p></div>
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">Surgery ({hs.surgeriesCount})</p>
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {SURGERY_CATEGORIES.map((c) => (
                      <div key={c}><p className="text-sm font-bold text-slate-700">{hs.surgeryCategories[c]}</p><p className="text-[8px] text-slate-400">{c}</p></div>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">Leave</p>
                    <div className="grid grid-cols-3 gap-1 text-center">
                      <div><p className="text-sm font-bold text-red-700">{hs.leaveBreakdown.cl}</p><p className="text-[9px] text-slate-400">CL</p></div>
                      <div><p className="text-sm font-bold text-amber-700">{hs.leaveBreakdown.col}</p><p className="text-[9px] text-slate-400">COL</p></div>
                      <div><p className="text-sm font-bold text-slate-600">{hs.leaveBreakdown.other}</p><p className="text-[9px] text-slate-400">Other</p></div>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">COL</p>
                    <div className="grid grid-cols-2 gap-1 text-center">
                      <div><p className="text-sm font-bold text-amber-700">{hs.colAccrued}</p><p className="text-[9px] text-slate-400">Earned</p></div>
                      <div><p className="text-sm font-bold text-slate-600">{hs.colRedeemed}</p><p className="text-[9px] text-slate-400">Used</p></div>
                    </div>
                  </div>
                </div>

                <div className="pt-3 border-t border-slate-100">
                  <p className="text-xs font-medium text-slate-400 uppercase mb-1.5">Fees</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-sm font-bold text-slate-700">{formatCurrency(hs.feesGenerated)}</p><p className="text-[9px] text-slate-400">Generated</p></div>
                    <div><p className="text-sm font-bold text-emerald-600">{formatCurrency(hs.feesReceived)}</p><p className="text-[9px] text-slate-400">Received</p></div>
                    <div><p className={`text-sm font-bold ${hs.overallPending > 0 ? 'text-red-600' : 'text-slate-500'}`}>{formatCurrency(hs.overallPending)}</p><p className="text-[9px] text-slate-400">Pending</p></div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-xs pt-2 border-t border-slate-100">
                  <span className="text-slate-500">Present: <b className="text-slate-700">{hs.present}</b> · Duties: <b className="text-slate-700">{hs.dutyCount}</b></span>
                  {hs.missingEntryDates.length > 0 && (
                    <span className="text-red-600 font-medium">{hs.missingEntryDates.length} missing</span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {level === 'detail' && selectedHospital && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {selectedHospital.dutyCount > 0 && (
              <button onClick={() => openDutyDrilldown(selectedHospital)} className="text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-full transition inline-flex items-center gap-1">
                <Stethoscope className="w-3.5 h-3.5" /> {selectedHospital.dutyCount} duty date{selectedHospital.dutyCount !== 1 ? 's' : ''}
              </button>
            )}
            {selectedHospital.missingEntryDates.length > 0 && (
              <button
                onClick={() => setDateListModal({ title: `Missing Entries — ${selectedHospital.hospital.name}`, rows: selectedHospital.missingEntryDates.map((date) => ({ date, hospitalName: selectedHospital.hospital.name })) })}
                className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-full transition inline-flex items-center gap-1"
              >
                <AlertTriangle className="w-3.5 h-3.5" /> {selectedHospital.missingEntryDates.length} missing entr{selectedHospital.missingEntryDates.length !== 1 ? 'ies' : 'y'}
              </button>
            )}
            {selectedHospital.colAvailable > 0 && (
              <span className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full inline-flex items-center gap-1">
                <Award className="w-3.5 h-3.5" /> {selectedHospital.colAvailable} COL credit{selectedHospital.colAvailable !== 1 ? 's' : ''} available
              </span>
            )}
          </div>

          <div className="bg-white rounded-xl border border-slate-200 p-5">
            {selectedHospital.days.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center">No date-wise records this month.</p>
            ) : (
              <div className="space-y-2">
                {selectedHospital.days.map((d) => (
                  <div key={d.date} className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-700">{formatDate(d.date)}</span>
                      {d.attendance.map((a) => (
                        <span key={a.id} className="text-xs text-slate-400">
                          {a.status === 'present' ? (a.duty_type === 'duty' ? 'Duty' : 'Present') : a.status === 'leave' ? `Leave${a.leave_type ? ` (${a.leave_type})` : ''}${a.compensated_working_date ? ' [COL]' : ''}` : `Extra Duty${a.extra_duty_type ? ` (${a.extra_duty_type})` : ''}`}
                        </span>
                      ))}
                    </div>
                    {d.entry && (
                      <p className="text-xs text-slate-500 mt-1">Daily entry — OP {d.entry.op_patients}, IP {d.entry.ip_patients}, Opinion {d.entry.opinion_patients}, {formatCurrency(d.entry.fees_generated)} generated</p>
                    )}
                    {d.patients.map((p) => (
                      <p key={p.id} className="text-xs text-slate-500 mt-1 flex items-center gap-1">
                        {p.patient_type === 'ip' ? <Stethoscope className="w-3 h-3" /> : p.patient_type === 'opinion' ? <MessageCircleQuestion className="w-3 h-3" /> : <Users className="w-3 h-3" />}
                        {p.patient_name} ({p.unique_id}) — {formatCurrency(p.fees || 0)}
                      </p>
                    ))}
                    {d.surgeries.map((s) => (
                      <p key={s.id} className="text-xs text-slate-500 mt-1 flex items-center gap-1"><Activity className="w-3 h-3" /> {s.procedure_name} ({categorize(s.surgery_type)})</p>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {dateListModal && (
        <DateListModal title={dateListModal.title} rows={dateListModal.rows} onClose={() => setDateListModal(null)} />
      )}
    </div>
  );
}
