import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Payment, Surgery, MonthlyEntry, Attendance, RevenueTransaction, ClassEntry } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil, todayLocalDateStr, monthRangeLocal } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { buildHospitalSummaries, SURGERY_CATEGORIES, LEAVE_BREAKDOWN_KEYS, LeaveBreakdown } from '@/lib/hospitalSummary';
import { View } from './Layout';
import {
  Calendar, AlertTriangle, Zap, IndianRupee, Users, Activity, GraduationCap,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

// Strictly Level 1 (global summary cards) + an upcoming follow-ups widget —
// no date-wise tables, hospital drill-downs, or raw activity logs here.
// Those now live on the Hospitals page (attendance-focused) and Reports
// page (full Census/Surgery/Leave/COL/Fees hierarchy).
export default function Dashboard({ onNavigate }: DashboardProps) {
  const { user } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [revenueTransactions, setRevenueTransactions] = useState<RevenueTransaction[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: h }, { data: pay }, { data: sur }, { data: me }, { data: att }, { data: rt }, { data: cls }] = await Promise.all([
        supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
        supabase.from('hospitals').select('*').order('name'),
        supabase.from('payments').select('*, patient:patients(*)'),
        supabase.from('surgeries').select('*').order('surgery_date', { ascending: false }),
        supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
        supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
        supabase.from('revenue_transactions').select('*, hospital:hospitals(*)'),
        supabase.from('classes').select('*, hospital:hospitals(*)').order('class_date', { ascending: true }),
      ]);
      setPatients(p || []);
      setHospitals(h || []);
      setPayments(pay || []);
      setSurgeries(sur || []);
      setMonthlyEntries(me || []);
      setAttendance(att || []);
      setRevenueTransactions(rt || []);
      setClasses(cls || []);
      setLoading(false);
    })();
  }, [user]);

  const now = new Date();
  const todayStr = todayLocalDateStr(now);
  const { start: monthStart, end: monthEnd } = monthRangeLocal(now.getFullYear(), now.getMonth());

  const hospitalSummary = buildHospitalSummaries({
    hospitals, patients, payments, surgeries, monthlyEntries, revenueTransactions, attendance,
    rangeStart: monthStart, rangeEnd: monthEnd, todayStr,
  }).filter((hs) => hs.hasActivity);

  const globalCensus = hospitalSummary.reduce((acc, hs) => ({
    op: acc.op + hs.opCount, ip: acc.ip + hs.ipCount, opinion: acc.opinion + hs.opinionCount,
  }), { op: 0, ip: 0, opinion: 0 });

  const globalSurgeryCategories = SURGERY_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<typeof SURGERY_CATEGORIES[number], number>);
  hospitalSummary.forEach((hs) => SURGERY_CATEGORIES.forEach((c) => { globalSurgeryCategories[c] += hs.surgeryCategories[c]; }));

  const globalLeave: LeaveBreakdown = hospitalSummary.reduce((acc, hs) => {
    LEAVE_BREAKDOWN_KEYS.forEach((k) => { acc[k.key] += hs.leaveBreakdown[k.key]; });
    return acc;
  }, { cl: 0, weekOff: 0, medical: 0, pdo: 0, col: 0, other: 0 } as LeaveBreakdown);

  const globalCol = getColSummary(attendance); // all hospitals, all-time
  const globalFees = hospitalSummary.reduce((acc, hs) => ({
    generated: acc.generated + hs.feesGenerated, received: acc.received + hs.feesReceived, pending: acc.pending + hs.overallPending,
  }), { generated: 0, received: 0, pending: 0 });

  // Upcoming Follow-Up Patients — every patient with a follow-up date,
  // soonest (or most overdue) first.
  const upcomingFollowUps = patients
    .filter((p) => !!p.follow_up_date)
    .map((p) => ({ patient: p, daysLeft: daysUntil(p.follow_up_date) }))
    .sort((a, b) => {
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

  // Upcoming Classes & Presentations — sessions due in the next 24-72
  // hours (day-granularity: 1-3 days out, since class_date has no time
  // component to combine with class_time's free text).
  const upcomingClasses = classes
    .filter((c) => !!c.class_date)
    .map((c) => ({ cls: c, daysLeft: daysUntil(c.class_date) }))
    .filter(({ daysLeft }) => daysLeft !== null && daysLeft >= 0 && daysLeft <= 3)
    .sort((a, b) => (a.daysLeft ?? 0) - (b.daysLeft ?? 0));

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">Summary for {now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })} — see Reports for full history and exports</p>
      </div>

      {patients.length === 0 && hospitals.length === 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <p className="text-slate-500 mb-3">Welcome! Start by adding a hospital, then create your first patient.</p>
          <button onClick={() => onNavigate('hospitals')} className="px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition">Add Your First Hospital</button>
        </div>
      )}

      {/* Level 1: Top-level summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <button onClick={() => onNavigate('reports')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
          <div className="flex items-center gap-2 mb-3"><Users className="w-4 h-4 text-sky-500" /><h2 className="font-semibold text-slate-700">Census</h2></div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div><p className="text-xl font-bold text-sky-700">{globalCensus.op}</p><p className="text-[11px] text-slate-400">OP</p></div>
            <div><p className="text-xl font-bold text-violet-700">{globalCensus.ip}</p><p className="text-[11px] text-slate-400">IP</p></div>
            <div><p className="text-xl font-bold text-amber-700">{globalCensus.opinion}</p><p className="text-[11px] text-slate-400">Opinion</p></div>
          </div>
        </button>

        <button onClick={() => onNavigate('reports')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
          <div className="flex items-center gap-2 mb-3"><Activity className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-700">Surgery</h2></div>
          <div className="grid grid-cols-5 gap-1 text-center">
            {SURGERY_CATEGORIES.map((c) => (
              <div key={c}><p className="text-lg font-bold text-slate-800">{globalSurgeryCategories[c]}</p><p className="text-[9px] text-slate-400">{c}</p></div>
            ))}
          </div>
        </button>

        <button onClick={() => onNavigate('hospitals')} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
          <div className="flex items-center gap-2 mb-3"><Calendar className="w-4 h-4 text-red-500" /><h2 className="font-semibold text-slate-700">Leave</h2></div>
          <div className="grid grid-cols-6 gap-1 text-center">
            {LEAVE_BREAKDOWN_KEYS.map((k) => (
              <div key={k.key}>
                <p className={`text-base font-bold ${k.key === 'col' ? 'text-amber-700' : k.key === 'other' ? 'text-slate-600' : 'text-red-700'}`}>{globalLeave[k.key]}</p>
                <p className="text-[9px] text-slate-400">{k.label}</p>
              </div>
            ))}
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

      {globalFees.pending > 0 && (
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800"><span className="font-semibold">{formatCurrency(globalFees.pending)}</span> in pending fees overall, up to today.</p>
          <button onClick={() => onNavigate('revenue')} className="ml-auto text-sm font-medium text-amber-700 hover:text-amber-800 underline">View Revenue →</button>
        </div>
      )}

      {/* Upcoming Follow-Up Patients widget */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4"><Calendar className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-700">Upcoming Follow-Up Patients</h2></div>
        {upcomingFollowUps.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No follow-up visits scheduled.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Scheduled Date</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2 font-medium text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {upcomingFollowUps.slice(0, 15).map(({ patient, daysLeft }) => {
                  const overdue = daysLeft !== null && daysLeft < 0;
                  const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                  return (
                    <tr key={patient.id} className="border-b border-slate-50 hover:bg-slate-50 transition">
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-700">{patient.patient_name}</p>
                        <p className="text-xs font-mono text-slate-400">{patient.unique_id}</p>
                      </td>
                      <td className="px-3 py-2.5 text-slate-500">{patient.hospital?.name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(patient.follow_up_date)}</td>
                      <td className="px-3 py-2.5 text-slate-500 max-w-xs truncate">{patient.diagnosis || '—'}</td>
                      <td className="px-3 py-2.5 text-right">
                        {daysLeft !== null && (
                          <span className={`text-xs font-medium px-2 py-1 rounded ${overdue ? 'bg-red-100 text-red-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                            {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `in ${daysLeft}d`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upcoming Classes & Presentations widget */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-700">Upcoming Classes &amp; Presentations</h2></div>
          <button onClick={() => onNavigate('hospitals')} className="text-xs font-medium text-violet-600 hover:text-violet-700">View all →</button>
        </div>
        {upcomingClasses.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">Nothing scheduled in the next 3 days.</p>
        ) : (
          <div className="space-y-2">
            {upcomingClasses.map(({ cls, daysLeft }) => (
              <div key={cls.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-700 truncate">{cls.topic || cls.class_type || 'Untitled session'}</p>
                  <p className="text-xs text-slate-400 truncate">
                    {formatDate(cls.class_date)}{cls.class_time ? ` · ${cls.class_time}` : ''}
                    {cls.location ? ` · ${cls.location}` : ''}
                    {cls.hospital?.name ? ` · ${cls.hospital.name}` : ''}
                  </p>
                </div>
                <span className={`flex-shrink-0 text-xs font-medium px-2 py-1 rounded ${(daysLeft ?? 3) <= 1 ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                  {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `in ${daysLeft}d`}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
