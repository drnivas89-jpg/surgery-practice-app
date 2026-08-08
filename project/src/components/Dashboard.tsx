import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Payment, Surgery, MonthlyEntry, Attendance } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil } from '@/lib/helpers';
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
} from 'lucide-react';

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
    const leaves = hospAtt.filter((a) => a.status === 'leave');
    const extraDuties = hospAtt.filter((a) => a.status === 'extra_duty');
    const leaveTypes: Record<string, number> = {};
    leaves.forEach((l) => { const t = l.leave_type || 'Unknown'; leaveTypes[t] = (leaveTypes[t] || 0) + 1; });
    const extraTypes: Record<string, number> = {};
    extraDuties.forEach((e) => { const t = e.extra_duty_type || 'Unknown'; extraTypes[t] = (extraTypes[t] || 0) + 1; });

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
      leaveCount: leaves.length,
      extraCount: extraDuties.length,
      leaveTypes,
      extraTypes,
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

  const allColExtra = attendance
    .filter((a) => a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const allLeaves = attendance
    .filter((a) => a.status === 'leave')
    .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const struckColDates = new Set<string>();
  for (const leave of allLeaves) {
    const colBefore = allColExtra
      .filter((c) => c.attendance_date <= leave.attendance_date)
      .map((c) => c.attendance_date);
    for (const d of colBefore) {
      if (!struckColDates.has(d)) {
        struckColDates.add(d);
        break;
      }
    }
  }

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
                  <th className="px-3 py-2 font-medium">Leave</th>
                  <th className="px-3 py-2 font-medium">Extra Duty</th>
                </tr>
              </thead>
              <tbody>
                {hospitalSummary.map((hs) => (
                  <tr key={hs.hospital.id} className="border-b border-slate-50 hover:bg-slate-50 transition align-top">
                    <td className="px-3 py-2.5 font-medium text-slate-700">{hs.hospital.name}</td>
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
                    <td className="px-3 py-2.5">
                      {hs.leaveCount === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {Object.entries(hs.leaveTypes).map(([type, count]) => (
                            <span key={type} className="text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                              {type}: {count}
                            </span>
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
                  </tr>
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
        <div className="flex items-center gap-2 mb-4">
          <Zap className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold text-slate-700">COL Extra Duty Tracking</h2>
        </div>
        {allColExtra.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No COL extra duties recorded.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 mb-2">
              COL dates struck through have been compensated by a leave taken on or after that date.
            </p>
            {allColExtra.map((c) => {
              const struck = struckColDates.has(c.attendance_date);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border ${
                    struck ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    struck ? 'bg-slate-200 text-slate-400' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${struck ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {formatDate(c.attendance_date)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.hospital?.name || '—'}{struck ? ' — Compensated by leave' : ''}
                    </p>
                  </div>
                  {struck && (
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
    </div>
  );
}
