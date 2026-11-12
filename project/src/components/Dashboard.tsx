import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital, Payment, Surgery, MonthlyEntry, Attendance, RevenueTransaction, ClassEntry, GovHoliday } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil, todayLocalDateStr, monthRangeLocal } from '@/lib/helpers';
import { getColSummary, ColCreditDate } from '@/lib/col';
import { buildColContext, fetchGovHolidays } from '@/lib/holidays';
import { buildHospitalSummaries, SURGERY_CATEGORIES, LEAVE_BREAKDOWN_KEYS, LeaveBreakdown } from '@/lib/hospitalSummary';
import { View } from './Layout';
import ColDetailsModal, { ColDetailKind, ColDetailItem } from './ColDetailsModal';
import {
  Calendar, AlertTriangle, Zap, IndianRupee, Users, Activity, GraduationCap, ChevronLeft, ChevronRight, ArrowRight, Plane,
} from 'lucide-react';

interface DashboardProps {
  onNavigate: (view: View) => void;
}

const greeting = () => {
  const h = new Date().getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
};

// Level 1 summary only — drill-downs live on the Hospitals, COL and
// Reports pages.
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
  const [holidays, setHolidays] = useState<GovHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [colYear, setColYear] = useState(new Date().getFullYear());
  const [colDetail, setColDetail] = useState<ColDetailKind | null>(null);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: p }, { data: h }, { data: pay }, { data: sur }, { data: me }, { data: att }, { data: rt }, { data: cls }, hol] = await Promise.all([
        supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
        supabase.from('hospitals').select('*').order('name'),
        supabase.from('payments').select('*, patient:patients(*)'),
        supabase.from('surgeries').select('*').order('surgery_date', { ascending: false }),
        supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
        supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
        supabase.from('revenue_transactions').select('*, hospital:hospitals(*)'),
        supabase.from('classes').select('*, hospital:hospitals(*)').order('class_date', { ascending: true }),
        fetchGovHolidays(),
      ]);
      setPatients(p || []);
      setHospitals(h || []);
      setPayments(pay || []);
      setSurgeries(sur || []);
      setMonthlyEntries(me || []);
      setAttendance(att || []);
      setRevenueTransactions(rt || []);
      setClasses(cls || []);
      setHolidays(hol);
      setLoading(false);
    })();
  }, [user]);

  const now = new Date();
  const todayStr = todayLocalDateStr(now);
  const { start: monthStart, end: monthEnd } = monthRangeLocal(now.getFullYear(), now.getMonth());
  const colContext = useMemo(() => buildColContext(holidays, hospitals), [holidays, hospitals]);

  const hospitalSummary = buildHospitalSummaries({
    hospitals, patients, payments, surgeries, monthlyEntries, revenueTransactions, attendance,
    rangeStart: monthStart, rangeEnd: monthEnd, todayStr, colContext,
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
  const totalLeave = LEAVE_BREAKDOWN_KEYS.reduce((s, k) => s + globalLeave[k.key], 0);

  const globalFees = hospitalSummary.reduce((acc, hs) => ({
    pending: acc.pending + hs.overallPending, excess: acc.excess + hs.overallExcess,
  }), { pending: 0, excess: 0 });

  // COL: all hospitals, all-time balance; used and wasted are per calendar year.
  const col = useMemo(() => getColSummary(attendance, undefined, { context: colContext, asOf: todayStr }), [attendance, colContext, todayStr]);
  const colItems = useMemo<Record<ColDetailKind, ColDetailItem[]>>(() => {
    const creditByKey = new Map<string, ColCreditDate>(col.creditDates.map((c) => [`${c.hospitalId}::${c.date}`, c]));
    const inYear = (d: string) => d.startsWith(String(colYear));
    return {
      used: col.usage
        .filter((u) => inYear(u.leaveDate))
        .map((u) => ({ credit: creditByKey.get(`${u.hospitalId}::${u.compensatedWorkingDate}`)!, usedOn: u.leaveDate }))
        .filter((i) => !!i.credit)
        .sort((a, b) => (b.usedOn || '').localeCompare(a.usedOn || '')),
      available: [...col.availableDates].sort((a, b) => a.expiryDate.localeCompare(b.expiryDate)).map((credit) => ({ credit })),
      wasted: col.wastedDates.filter((c) => inYear(c.expiryDate)).sort((a, b) => b.expiryDate.localeCompare(a.expiryDate)).map((credit) => ({ credit })),
    };
  }, [col, colYear]);
  const nextExpiry = colItems.available[0]?.credit.expiryDate || null;

  const upcomingFollowUps = patients
    .filter((p) => !!p.follow_up_date)
    .map((p) => ({ patient: p, daysLeft: daysUntil(p.follow_up_date) }))
    .sort((a, b) => {
      if (a.daysLeft === null) return 1;
      if (b.daysLeft === null) return -1;
      return a.daysLeft - b.daysLeft;
    });

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

  const colTile = (kind: ColDetailKind, value: number, label: string, sub: string, tone: string) => (
    <button
      onClick={() => setColDetail(kind)}
      className={`group rounded-xl p-3.5 text-left transition ring-1 ring-inset hover:shadow-md ${tone}`}
    >
      <p className="text-3xl font-bold tabular-nums leading-none">{value}</p>
      <p className="text-xs font-semibold mt-2">{label}</p>
      <p className="text-[11px] opacity-75 mt-0.5 flex items-center gap-1">{sub} <ArrowRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition" /></p>
    </button>
  );

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-sky-600 via-sky-700 to-teal-700 p-6 sm:p-7 text-white shadow-lg shadow-sky-900/10">
        <div className="absolute -right-10 -top-16 w-56 h-56 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute right-24 -bottom-20 w-48 h-48 rounded-full bg-teal-300/20 blur-2xl" />
        <p className="relative text-sky-100 text-sm font-medium">{now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
        <h1 className="relative text-2xl sm:text-3xl font-bold mt-1">{greeting()}, Doctor</h1>
        <p className="relative text-sky-100/90 text-sm mt-1">Your practice at a glance for {now.toLocaleDateString('en-GB', { month: 'long' })}</p>
      </div>

      {patients.length === 0 && hospitals.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-slate-500 mb-3">Welcome! Start by adding a hospital, then record your first case.</p>
          <button onClick={() => onNavigate('hospitals')} className="btn-primary">Add Your First Hospital</button>
        </div>
      )}

      {/* COL — the doctor's compensatory-off position */}
      <div className="card p-5">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><Zap className="w-5 h-5" /></div>
            <div>
              <h2 className="font-semibold text-slate-800">COL</h2>
              <p className="text-xs text-slate-500">{nextExpiry ? `Next credit expires ${formatDate(nextExpiry)}` : 'Credits are valid for 6 months'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
              <button onClick={() => setColYear(colYear - 1)} className="p-1 rounded-md hover:bg-white transition" aria-label="Previous year"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
              <span className="text-sm font-semibold text-slate-700 px-1.5 tabular-nums">{colYear}</span>
              <button onClick={() => setColYear(colYear + 1)} disabled={colYear >= now.getFullYear()} className="p-1 rounded-md hover:bg-white transition disabled:opacity-30" aria-label="Next year"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
            </div>
            <button onClick={() => onNavigate('col')} className="text-xs font-semibold text-sky-700 hover:text-sky-800 px-2">Manage →</button>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          {colTile('used', colItems.used.length, 'Availed', `used in ${colYear}`, 'bg-sky-50 text-sky-800 ring-sky-200')}
          {colTile('available', colItems.available.length, 'Available', 'with validity', 'bg-emerald-50 text-emerald-800 ring-emerald-200')}
          {colTile('wasted', colItems.wasted.length, 'Wasted', `expired in ${colYear}`, 'bg-rose-50 text-rose-800 ring-rose-200')}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard icon={Users} tone="bg-sky-100 text-sky-600" title="Census" onClick={() => onNavigate('reports')}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={globalCensus.op} label="OP" color="text-sky-700" />
            <Stat value={globalCensus.ip} label="IP" color="text-violet-700" />
            <Stat value={globalCensus.opinion} label="Opinion" color="text-amber-700" />
          </div>
        </SummaryCard>

        <SummaryCard icon={Activity} tone="bg-violet-100 text-violet-600" title="Surgery" onClick={() => onNavigate('patients')}>
          <div className="grid grid-cols-3 gap-2 text-center">
            <Stat value={globalSurgeryCategories.Major} label="Major" color="text-violet-700" />
            <Stat value={globalSurgeryCategories.Minor} label="Minor" color="text-sky-700" />
            <Stat value={globalSurgeryCategories.Bedside} label="Bedside" color="text-emerald-700" />
          </div>
        </SummaryCard>

        <SummaryCard icon={Plane} tone="bg-rose-100 text-rose-600" title={`Leave · ${totalLeave}`} onClick={() => onNavigate('hospitals')}>
          <div className="grid grid-cols-3 gap-x-2 gap-y-1.5 text-center">
            {LEAVE_BREAKDOWN_KEYS.map((k) => (
              <Stat key={k.key} value={globalLeave[k.key]} label={k.label} color={k.key === 'col' ? 'text-amber-700' : 'text-slate-700'} small />
            ))}
          </div>
        </SummaryCard>

        <SummaryCard icon={IndianRupee} tone="bg-emerald-100 text-emerald-600" title="Fees" onClick={() => onNavigate('revenue')}>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg bg-rose-50 p-2.5">
              <p className={`text-lg font-bold tabular-nums ${globalFees.pending > 0 ? 'text-rose-600' : 'text-slate-400'}`}>{formatCurrency(globalFees.pending)}</p>
              <p className="text-[11px] text-slate-500">Pending</p>
            </div>
            <div className="rounded-lg bg-emerald-50 p-2.5">
              <p className={`text-lg font-bold tabular-nums ${globalFees.excess > 0 ? 'text-emerald-700' : 'text-slate-400'}`}>{formatCurrency(globalFees.excess)}</p>
              <p className="text-[11px] text-slate-500">Excess paid</p>
            </div>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Tallied month by month</p>
        </SummaryCard>
      </div>

      {globalFees.pending > 0 && (
        <div className="rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200 p-4 flex items-center gap-3 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0" />
          <p className="text-sm text-amber-800"><span className="font-semibold">{formatCurrency(globalFees.pending)}</span> pending — the total of each month's unpaid balance, up to today.</p>
          <button onClick={() => onNavigate('revenue')} className="ml-auto text-sm font-semibold text-amber-700 hover:text-amber-800">View Revenue →</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center gap-2 mb-4"><Calendar className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-800">Upcoming Follow-ups</h2></div>
          {upcomingFollowUps.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">No follow-up visits scheduled.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {upcomingFollowUps.slice(0, 8).map(({ patient, daysLeft }) => {
                const overdue = daysLeft !== null && daysLeft < 0;
                const soon = daysLeft !== null && daysLeft >= 0 && daysLeft <= 7;
                return (
                  <div key={patient.id} className="flex items-center gap-3 py-2.5">
                    <div className="w-9 h-9 rounded-full bg-violet-50 text-violet-600 flex items-center justify-center text-sm font-bold flex-shrink-0">
                      {patient.patient_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-slate-700 truncate">{patient.patient_name}</p>
                      <p className="text-xs text-slate-400 truncate">{patient.hospital?.name || '—'} · {formatDate(patient.follow_up_date)}{patient.diagnosis ? ` · ${patient.diagnosis}` : ''}</p>
                    </div>
                    {daysLeft !== null && (
                      <span className={`text-xs font-semibold px-2 py-1 rounded-full flex-shrink-0 ${overdue ? 'bg-rose-100 text-rose-700' : soon ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'}`}>
                        {overdue ? `${Math.abs(daysLeft)}d overdue` : daysLeft === 0 ? 'Today' : `in ${daysLeft}d`}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2"><GraduationCap className="w-4 h-4 text-violet-500" /><h2 className="font-semibold text-slate-800">Classes · next 3 days</h2></div>
            <button onClick={() => onNavigate('hospitals')} className="text-xs font-semibold text-violet-600 hover:text-violet-700">View all →</button>
          </div>
          {upcomingClasses.length === 0 ? (
            <p className="text-sm text-slate-400 py-6 text-center">Nothing scheduled.</p>
          ) : (
            <div className="space-y-2">
              {upcomingClasses.map(({ cls, daysLeft }) => (
                <div key={cls.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-slate-700 truncate">{cls.topic || cls.class_type || 'Untitled session'}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {formatDate(cls.class_date)}{cls.class_time ? ` · ${cls.class_time}` : ''}{cls.location ? ` · ${cls.location}` : ''}
                    </p>
                  </div>
                  <span className={`flex-shrink-0 text-xs font-semibold px-2 py-1 rounded-full ${(daysLeft ?? 3) <= 1 ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                    {daysLeft === 0 ? 'Today' : daysLeft === 1 ? 'Tomorrow' : `in ${daysLeft}d`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {colDetail && (
        <ColDetailsModal kind={colDetail} year={colYear} items={colItems[colDetail]} onClose={() => setColDetail(null)} />
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, tone, title, onClick, children }: { icon: typeof Users; tone: string; title: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="card card-hover p-5 text-left flex flex-col justify-start">
      <div className="flex items-center gap-2.5 mb-4">
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${tone}`}><Icon className="w-4 h-4" /></div>
        <h2 className="font-semibold text-slate-800">{title}</h2>
      </div>
      {children}
    </button>
  );
}

function Stat({ value, label, color, small }: { value: number; label: string; color: string; small?: boolean }) {
  return (
    <div>
      <p className={`${small ? 'text-base' : 'text-2xl'} font-bold tabular-nums ${color}`}>{value}</p>
      <p className="text-[11px] text-slate-400">{label}</p>
    </div>
  );
}
