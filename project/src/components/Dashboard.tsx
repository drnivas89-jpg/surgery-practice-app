import { Fragment, useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Payment, Surgery, MonthlyEntry, Attendance } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { View } from './Layout';
import {
  Calendar,
  AlertTriangle,
  Clock,
  Zap,
  IndianRupee,
  Users,
  Building2,
  TrendingUp,
  Activity,
  FileBarChart,
  Search,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
} from 'lucide-react';

const SURGERY_CATEGORIES = ['Major', 'Minor', 'Bedside', 'Endoscopy', 'Others'] as const;

function categorize(surgeryType: string | null | undefined): typeof SURGERY_CATEGORIES[number] {
  const t = (surgeryType || '').trim().toLowerCase();
  const match = SURGERY_CATEGORIES.find((c) => c.toLowerCase() === t);
  return match || 'Others';
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

export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedHospitalId, setExpandedHospitalId] = useState<string | null>(null);
  const [dateListModal, setDateListModal] = useState<{ title: string; rows: DateListRow[] } | null>(null);

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

  // Surgeries in the selected month
  const monthSurgeries = surgeries.filter((s) => {
    if (!s.surgery_date) return false;
    const d = s.surgery_date.substring(0, 10);
    return d >= selectedMonthStart && d <= selectedMonthEnd;
  });

  // Payments in the selected month
  const monthPayments = payments.filter((pay) => {
    if (!pay.payment_date) return false;
    return pay.payment_date.substring(0, 7) === selectedMonthKey;
  });

  // Monthly (daily) entries for the selected month
  const monthEntries = monthlyEntries.filter((me) => {
    const meMonth = (me.entry_date || me.month).substring(0, 7);
    return meMonth === selectedMonthKey;
  });

  // Apply search filter to monthPatients
  const filteredMonthPatients = monthPatients.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      p.patient_name.toLowerCase().includes(q) ||
      p.unique_id.toLowerCase().includes(q) ||
      (p.hospital?.name || '').toLowerCase().includes(q)
    );
  });

  const monthOp = monthEntries.reduce((s, me) => s + me.op_patients, 0);
  const monthIp = monthEntries.reduce((s, me) => s + me.ip_patients, 0);
  const monthFeesGen = monthEntries.reduce((s, me) => s + me.fees_generated, 0);
  const monthFeesRec = monthEntries.reduce((s, me) => s + me.fees_received, 0);
  const monthFeesFromPatients = monthPatients.reduce((s, p) => s + (p.fees || 0), 0);
  const monthReceivedFromPayments = monthPayments.reduce((s, p) => s + p.amount, 0);
  const monthPending = monthFeesFromPatients - monthReceivedFromPayments;

  const surgeryTypeCounts: Record<string, number> = {};
  monthSurgeries.forEach((s) => {
    const type = s.surgery_type || 'Unspecified';
    surgeryTypeCounts[type] = (surgeryTypeCounts[type] || 0) + 1;
  });

  // Alerts (only show for current month)
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

  const upcomingSurgeries = surgeryAlerts.filter((a) => a.daysLeft !== null && a.daysLeft >= 0).length;

  // ---- Hospital-wise summary: current-month activity + overall (up to today) pending ----
  const patientById = new Map(patients.map((p) => [p.id, p]));
  const todayStr = now.toISOString().substring(0, 10);

  const monthAttendance = attendance.filter((a) => {
    const m = a.attendance_date.substring(0, 7);
    return m === selectedMonthKey;
  });

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

  const hospitalSummary = hospitals.map((h) => {
    // This month
    const hospMonthEntries = monthEntries.filter((me) => me.hospital_id === h.id);
    const hospMonthPatients = monthPatients.filter((p) => p.hospital_id === h.id);
    const hospMonthPayments = monthPayments.filter((pay) => pay.hospital_id === h.id);
    const hospMonthSurgeries = monthSurgeries.filter((s) => patientById.get(s.patient_id)?.hospital_id === h.id);

    const opCount = hospMonthEntries.reduce((s, me) => s + me.op_patients, 0);
    const ipCount = hospMonthEntries.reduce((s, me) => s + me.ip_patients, 0);
    const opinionCount = hospMonthEntries.reduce((s, me) => s + me.opinion_patients, 0);
    const surgeriesCount = hospMonthSurgeries.length;

    const feesGenerated =
      hospMonthPatients.reduce((s, p) => s + (p.fees || 0), 0) +
      hospMonthEntries.reduce((s, me) => s + me.fees_generated, 0);
    const feesReceived =
      hospMonthPayments.reduce((s, p) => s + p.amount, 0) +
      hospMonthEntries.reduce((s, me) => s + me.fees_received, 0);

    // Overall — up to today, all-time (not limited to the selected month)
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

    // Attendance (selected month)
    const hospAtt = monthAttendance.filter((a) => a.hospital_id === h.id);
    const present = hospAtt.filter((a) => a.status === 'present').length;
    const duties = hospAtt.filter((a) => a.status === 'present' && a.duty_type === 'duty');
    const leaves = hospAtt.filter((a) => a.status === 'leave');
    const extraDuties = hospAtt.filter((a) => a.status === 'extra_duty');
    const leaveTypes: Record<string, number> = {};
    leaves.forEach((l) => { const t = l.leave_type || 'Unknown'; leaveTypes[t] = (leaveTypes[t] || 0) + 1; });
    const extraTypes: Record<string, number> = {};
    extraDuties.forEach((e) => { const t = e.extra_duty_type || 'Unknown'; extraTypes[t] = (extraTypes[t] || 0) + 1; });

    // Missing-entry dates: elapsed days with neither a daily entry nor an
    // attendance record for this hospital.
    const datesWithEntry = new Set<string>([
      ...hospMonthEntries.map((me) => (me.entry_date || me.month).substring(0, 10)),
      ...hospAtt.map((a) => a.attendance_date),
    ]);
    const missingEntryDates = elapsedDates.filter((d) => !datesWithEntry.has(d));

    // Date-wise breakdown for the drill-down (built once here so expanding
    // a row needs no extra query — everything's already in memory).
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
      opCount,
      ipCount,
      opinionCount,
      surgeriesCount,
      feesGenerated,
      feesReceived,
      overallPending,
      present,
      dutyCount: duties.length,
      dutyDates: duties.map((d) => d.attendance_date),
      leaveCount: leaves.length,
      extraCount: extraDuties.length,
      leaveTypes,
      extraTypes,
      leaveDates: leaves.map((l) => ({ date: l.attendance_date, detail: l.leave_type || undefined })),
      missingEntryDates,
      days,
      hasActivity:
        opCount > 0 || ipCount > 0 || opinionCount > 0 || surgeriesCount > 0 || feesGenerated > 0 ||
        present > 0 || leaves.length > 0 || extraDuties.length > 0 || overallPending !== 0,
    };
  }).filter((hs) => hs.hasActivity);

  const totalPending = hospitalSummary.reduce((s, h) => s + h.overallPending, 0);
  const totalReceived = hospitalSummary.reduce((s, h) => s + h.feesReceived, 0);

  const availableYears = Array.from(
    new Set(
      patients
        .flatMap((p) => [p.admission_date, p.surgery_date, p.follow_up_date, p.created_at])
        .filter((d): d is string => !!d)
        .map((d) => new Date(d).getFullYear())
    )
  ).sort((a, b) => b - a);
  if (!availableYears.includes(now.getFullYear())) availableYears.unshift(now.getFullYear());

  const goToPrevMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(selectedYear - 1);
    } else {
      setSelectedMonth(selectedMonth - 1);
    }
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(selectedYear + 1);
    } else {
      setSelectedMonth(selectedMonth + 1);
    }
  };

  const goToCurrentMonth = () => {
    setSelectedMonth(now.getMonth());
    setSelectedYear(now.getFullYear());
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  const stats = [
    { label: 'Patients (This Month)', value: monthPatients.length, icon: Users, color: 'sky' },
    { label: 'Surgeries (This Month)', value: monthSurgeries.length, icon: Activity, color: 'violet' },
    { label: 'Upcoming Surgeries', value: isCurrentMonth ? upcomingSurgeries : 0, icon: Clock, color: 'amber' },
    { label: 'Pending (This Month)', value: formatCurrency(monthPending), icon: IndianRupee, color: 'red' },
  ];

  const colorMap: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
  };

  const colSummary = getColSummary(attendance);
  const colAvailableSet = new Set(colSummary.availableDates.map((d) => d.date));

  const surgeryCategoryCounts = SURGERY_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<string, number>);
  monthSurgeries.forEach((s) => { surgeryCategoryCounts[categorize(s.surgery_type)]++; });

  const openDutyDrilldown = (hs: typeof hospitalSummary[number]) => {
    setDateListModal({
      title: `Duty Dates — ${hs.hospital.name}`,
      rows: hs.dutyDates.map((date) => ({ date, hospitalName: hs.hospital.name })),
    });
  };

  const openLeaveDrilldown = (leaveType?: string) => {
    const rows: DateListRow[] = [];
    hospitalSummary.forEach((hs) => {
      hs.leaveDates
        .filter((l) => !leaveType || l.detail === leaveType)
        .forEach((l) => rows.push({ date: l.date, hospitalName: hs.hospital.name, detail: l.detail }));
    });
    rows.sort((a, b) => b.date.localeCompare(a.date));
    setDateListModal({ title: leaveType ? `Leave Dates — ${leaveType}` : 'All Leave Dates', rows });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Monthly overview of your surgical practice</p>
        </div>
        {/* Month/Year selector */}
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <button onClick={goToPrevMonth} className="p-1 rounded-lg hover:bg-slate-100 transition">
            <ChevronLeft className="w-4 h-4 text-slate-500" />
          </button>
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
            className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          >
            {MONTHS.map((m, i) => (
              <option key={m} value={i}>{m}</option>
            ))}
          </select>
          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(parseInt(e.target.value))}
            className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer"
          >
            {availableYears.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <button onClick={goToNextMonth} className="p-1 rounded-lg hover:bg-slate-100 transition">
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
          {!isCurrentMonth && (
            <button onClick={goToCurrentMonth} className="ml-1 text-xs font-medium text-sky-600 hover:text-sky-700 px-2 py-1 rounded-lg hover:bg-sky-50 transition">
              Today
            </button>
          )}
        </div>
      </div>

      {patients.length === 0 && hospitals.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-3">Welcome! Start by adding a hospital, then create your first patient.</p>
          <button
            onClick={() => onNavigate('hospitals')}
            className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition"
          >
            Add Your First Hospital
          </button>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center justify-between mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[stat.color]}`}>
                  <Icon className="w-5 h-5" />
                </div>
              </div>
              <p className="text-2xl font-bold text-slate-800">{stat.value}</p>
              <p className="text-sm text-slate-400">{stat.label}</p>
            </div>
          );
        })}
      </div>

      {/* Month summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart className="w-4 h-4 text-sky-500" />
          <h2 className="font-semibold text-slate-700">
            {MONTHS[selectedMonth]} {selectedYear} Summary
          </h2>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <div className="p-3 rounded-lg bg-sky-50">
            <p className="text-2xl font-bold text-sky-700">{monthOp}</p>
            <p className="text-xs text-slate-500">OP Patients</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50">
            <p className="text-2xl font-bold text-emerald-700">{monthIp}</p>
            <p className="text-xs text-slate-500">IP Patients</p>
          </div>
          <div className="p-3 rounded-lg bg-violet-50">
            <p className="text-2xl font-bold text-violet-700">{monthSurgeries.length}</p>
            <p className="text-xs text-slate-500">Surgeries</p>
          </div>
          <div className="p-3 rounded-lg bg-amber-50">
            <p className="text-lg font-bold text-amber-700">{formatCurrency(monthFeesFromPatients)}</p>
            <p className="text-xs text-slate-500">Fees Billed</p>
          </div>
          <div className="p-3 rounded-lg bg-emerald-50">
            <p className="text-lg font-bold text-emerald-700">{formatCurrency(monthReceivedFromPayments)}</p>
            <p className="text-xs text-slate-500">Fees Received</p>
          </div>
        </div>

        {Object.keys(surgeryTypeCounts).length > 0 && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 uppercase mb-2">Surgery Types This Month</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(surgeryTypeCounts).map(([type, count]) => (
                <span key={type} className="text-sm bg-slate-100 text-slate-700 px-3 py-1 rounded-lg">
                  {type}: <span className="font-bold">{count}</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Hospital-wise summary: current month activity + overall pending to date */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-slate-700">Hospital-wise Summary — {MONTHS[selectedMonth]} {selectedYear}</h2>
        </div>
        {hospitalSummary.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No hospital activity in this month.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium text-right">OP</th>
                  <th className="px-3 py-2 font-medium text-right">IP</th>
                  <th className="px-3 py-2 font-medium text-right">Opinion</th>
                  <th className="px-3 py-2 font-medium text-right">Surgeries</th>
                  <th className="px-3 py-2 font-medium text-right">Fees Gen.</th>
                  <th className="px-3 py-2 font-medium text-right">Fees Rec.</th>
                  <th className="px-3 py-2 font-medium text-right">Pending (Overall)</th>
                  <th className="px-3 py-2 font-medium text-right">Present</th>
                  <th className="px-3 py-2 font-medium text-right">Duties</th>
                  <th className="px-3 py-2 font-medium text-right">Leaves</th>
                  <th className="px-3 py-2 font-medium">Extra Duty</th>
                  <th className="px-3 py-2 font-medium text-right">Missing</th>
                </tr>
              </thead>
              <tbody>
                {hospitalSummary.map((hs) => (
                  <Fragment key={hs.hospital.id}>
                    <tr
                      onClick={() => setExpandedHospitalId(expandedHospitalId === hs.hospital.id ? null : hs.hospital.id)}
                      className="border-b border-slate-50 hover:bg-slate-50 transition align-top cursor-pointer"
                    >
                      <td className="px-3 py-2.5 font-medium text-slate-700 flex items-center gap-1.5">
                        <ChevronDown className={`w-3.5 h-3.5 text-slate-300 transition-transform ${expandedHospitalId === hs.hospital.id ? 'rotate-180' : ''}`} />
                        {hs.hospital.name}
                      </td>
                      <td className="px-3 py-2.5 text-right text-sky-700 font-medium">{hs.opCount}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-700 font-medium">{hs.ipCount}</td>
                      <td className="px-3 py-2.5 text-right text-amber-700 font-medium">{hs.opinionCount}</td>
                      <td className="px-3 py-2.5 text-right text-violet-700 font-medium">{hs.surgeriesCount}</td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{formatCurrency(hs.feesGenerated)}</td>
                      <td className="px-3 py-2.5 text-right text-emerald-600">{formatCurrency(hs.feesReceived)}</td>
                      <td className={`px-3 py-2.5 text-right font-medium ${hs.overallPending > 0 ? 'text-red-600' : 'text-slate-500'}`}>
                        {formatCurrency(hs.overallPending)}
                      </td>
                      <td className="px-3 py-2.5 text-right text-slate-600">{hs.present}</td>
                      <td className="px-3 py-2.5 text-right">
                        {hs.dutyCount === 0 ? (
                          <span className="text-slate-300">0</span>
                        ) : (
                          <button onClick={(e) => { e.stopPropagation(); openDutyDrilldown(hs); }} className="text-sky-600 font-medium underline decoration-dotted hover:text-sky-700">
                            {hs.dutyCount}
                          </button>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {hs.leaveCount === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1 justify-end">
                            {Object.entries(hs.leaveTypes).map(([type, count]) => (
                              <button
                                key={type}
                                onClick={(e) => { e.stopPropagation(); openLeaveDrilldown(type === 'Unknown' ? undefined : type); }}
                                className="text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 px-2 py-0.5 rounded-full transition"
                              >
                                {type}: {count}
                              </button>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {hs.extraCount === 0 ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {Object.entries(hs.extraTypes).map(([type, count]) => (
                              <span key={type} className="text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                                {type}: {count}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {hs.missingEntryDates.length === 0 ? (
                          <span className="text-slate-300">0</span>
                        ) : (
                          <button
                            onClick={(e) => { e.stopPropagation(); setDateListModal({ title: `Missing Entries — ${hs.hospital.name}`, rows: hs.missingEntryDates.map((date) => ({ date, hospitalName: hs.hospital.name })) }); }}
                            className="text-red-600 font-medium underline decoration-dotted hover:text-red-700"
                          >
                            {hs.missingEntryDates.length}
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedHospitalId === hs.hospital.id && (
                      <tr className="border-b border-slate-50">
                        <td colSpan={13} className="bg-slate-50 px-3 py-3">
                          {hs.days.length === 0 ? (
                            <p className="text-sm text-slate-400 py-2">No date-wise records this month.</p>
                          ) : (
                            <div className="space-y-2">
                              {hs.days.map((d) => (
                                <div key={d.date} className="bg-white border border-slate-200 rounded-lg p-2.5 text-sm">
                                  <div className="flex items-center justify-between">
                                    <span className="font-medium text-slate-700">{formatDate(d.date)}</span>
                                    {d.attendance.map((a) => (
                                      <span key={a.id} className="text-xs text-slate-400">
                                        {a.status === 'present' ? (a.duty_type === 'duty' ? 'Duty' : 'Present') : a.status === 'leave' ? `Leave${a.leave_type ? ` (${a.leave_type})` : ''}` : `Extra Duty${a.extra_duty_type ? ` (${a.extra_duty_type})` : ''}`}
                                      </span>
                                    ))}
                                  </div>
                                  {d.entry && (
                                    <p className="text-xs text-slate-500 mt-1">
                                      Daily entry — OP {d.entry.op_patients}, IP {d.entry.ip_patients}, Opinion {d.entry.opinion_patients}, {formatCurrency(d.entry.fees_generated)} generated
                                    </p>
                                  )}
                                  {d.patients.map((p) => (
                                    <p key={p.id} className="text-xs text-slate-500 mt-1">
                                      {p.patient_type === 'ip' ? '🏥' : p.patient_type === 'opinion' ? '💬' : '🩺'} {p.patient_name} ({p.unique_id}) — {formatCurrency(p.fees || 0)}
                                    </p>
                                  ))}
                                  {d.surgeries.map((s) => (
                                    <p key={s.id} className="text-xs text-slate-500 mt-1">
                                      🔪 {s.procedure_name} ({categorize(s.surgery_type)})
                                    </p>
                                  ))}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-slate-400 mt-3">
          OP/IP/Surgeries/Fees/Attendance are for {MONTHS[selectedMonth]} {selectedYear}. Pending is overall, up to today ({formatDate(todayStr)}).
        </p>
        <div className="mt-4 pt-4 border-t border-slate-100 flex items-center justify-between">
          <span className="text-sm font-medium text-slate-600">Total Received (This Month)</span>
          <span className="text-lg font-bold text-emerald-600">{formatCurrency(totalReceived)}</span>
        </div>
      </div>

      {/* Alerts — only for current month */}
      {isCurrentMonth && (
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-700">Surgery & Follow-up Alerts</h2>
          </div>
          {allAlerts.length === 0 ? (
            <p className="text-sm text-slate-400 py-4 text-center">No upcoming surgery or follow-up dates</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {allAlerts.slice(0, 10).map((alert, i) => {
                const isSurgery = alert.type === 'surgery';
                const overdue = alert.daysLeft !== null && alert.daysLeft < 0;
                const soon = alert.daysLeft !== null && alert.daysLeft >= 0 && alert.daysLeft <= 7;
                return (
                  <div
                    key={i}
                    className={`flex items-center gap-3 p-3 rounded-lg border ${
                      overdue ? 'border-red-200 bg-red-50' : soon ? 'border-amber-200 bg-amber-50' : 'border-slate-100 bg-slate-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      isSurgery ? 'bg-sky-100 text-sky-600' : 'bg-violet-100 text-violet-600'
                    }`}>
                      {isSurgery ? <Activity className="w-4 h-4" /> : <Calendar className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{alert.patient.patient_name}</p>
                      <p className="text-xs text-slate-400">
                        {isSurgery ? 'Surgery' : 'Follow-up'}: {formatDate(isSurgery ? alert.patient.surgery_date : alert.patient.follow_up_date)}
                      </p>
                    </div>
                    {alert.daysLeft !== null && (
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        overdue ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
                      }`}>
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

      {totalPending > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800">
            <span className="font-semibold">{formatCurrency(totalPending)}</span> in pending fees overall, up to today.
          </p>
          <button onClick={() => onNavigate('revenue')} className="ml-auto text-sm font-medium text-amber-700 hover:text-amber-800 underline">
            View Revenue →
          </button>
        </div>
      )}

      {/* COL Tracking */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            <h2 className="font-semibold text-slate-700">COL Extra Duty Tracking</h2>
          </div>
          <button onClick={() => onNavigate('col')} className="text-xs font-medium text-sky-600 hover:text-sky-700">
            Full COL Dashboard →
          </button>
        </div>
        {colSummary.creditDates.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No COL extra duties recorded.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-2">
              COL dates struck through have been compensated by a leave.
            </p>
            {colSummary.creditDates.map((c) => {
              const available = colAvailableSet.has(c.date);
              return (
                <div
                  key={c.attendanceId}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    available ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    available ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${available ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                      {formatDate(c.date)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.hospitalName}{!available ? ' — Compensated by leave' : ''}
                    </p>
                  </div>
                  {!available && (
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2 py-1 rounded">
                      Struck
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Surgery categorization */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Surgeries by Category — {MONTHS[selectedMonth]} {selectedYear}</h2>
        <div className="grid grid-cols-5 gap-2 text-center">
          {SURGERY_CATEGORIES.map((c) => (
            <div key={c} className="p-2">
              <p className="text-xl font-bold text-slate-800">{surgeryCategoryCounts[c]}</p>
              <p className="text-[11px] text-slate-400">{c}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Patients this month with search */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-sky-500" />
            <h2 className="font-semibold text-slate-700">Patients — {MONTHS[selectedMonth]} {selectedYear}</h2>
          </div>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search name, ID, hospital..."
              className="pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 w-full sm:w-64"
            />
          </div>
        </div>
        {filteredMonthPatients.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">
            {search ? 'No patients match your search for this month.' : 'No patient activity in this month.'}
          </p>
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

      {dateListModal && (
        <DateListModal title={dateListModal.title} rows={dateListModal.rows} onClose={() => setDateListModal(null)} />
      )}
    </div>
  );
}
