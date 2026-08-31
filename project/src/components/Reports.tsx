import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Hospital, MonthlyEntry, Surgery, Patient, Attendance, Payment } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { buildHospitalSummaries, HospitalSummary, SURGERY_CATEGORIES, LEAVE_BREAKDOWN_KEYS, LeaveBreakdown } from '@/lib/hospitalSummary';
import HospitalDailyTable from './HospitalDailyTable';
import EditDayModal from './EditDayModal';
import { useAuth } from '@/lib/auth';
import {
  Building2, Calendar, IndianRupee, Activity, Users, FileSpreadsheet,
  Zap, ArrowLeft, FileText,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import jsPDF from 'jspdf';

const NAVY: [number, number, number] = [30, 41, 59];
const BORDER: [number, number, number] = [226, 232, 240];
const MUTED: [number, number, number] = [100, 116, 139];

type Metric = 'census' | 'surgery' | 'leave' | 'col' | 'fees';
type Level = 'global' | 'metric' | 'hospital';

const METRICS: { id: Metric; label: string; icon: typeof Users; color: string }[] = [
  { id: 'census', label: 'Census', icon: Users, color: 'text-sky-500' },
  { id: 'surgery', label: 'Surgery', icon: Activity, color: 'text-violet-500' },
  { id: 'leave', label: 'Leave', icon: Calendar, color: 'text-red-500' },
  { id: 'col', label: 'COL', icon: Zap, color: 'text-amber-500' },
  { id: 'fees', label: 'Fees', icon: IndianRupee, color: 'text-emerald-500' },
];

// Draws a simple bordered table across as many pages as needed. Deliberately
// hand-rolled (no autotable plugin) to match the existing Logbook PDF style.
function drawTablePdf(doc: jsPDF, opts: {
  title: string; subtitle?: string;
  columns: { label: string; width: number; align?: 'left' | 'right' }[];
  rows: (string | number)[][];
}) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;
  let y = margin;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(opts.title, margin, y);
  y += 18;
  if (opts.subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(...MUTED);
    doc.text(opts.subtitle, margin, y);
    y += 16;
  }
  doc.setDrawColor(...BORDER);
  doc.line(margin, y, pageWidth - margin, y);
  y += 18;

  const drawHeader = () => {
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.setFillColor(...NAVY);
    doc.rect(margin, y - 10, opts.columns.reduce((s, c) => s + c.width, 0), 16, 'F');
    let x = margin;
    for (const col of opts.columns) {
      doc.text(col.label, col.align === 'right' ? x + col.width - 4 : x + 4, y, { align: col.align === 'right' ? 'right' : 'left' });
      x += col.width;
    }
    y += 14;
  };

  drawHeader();
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...NAVY);

  opts.rows.forEach((row, i) => {
    if (y > pageHeight - margin) {
      doc.addPage();
      y = margin;
      drawHeader();
    }
    if (i % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(margin, y - 9, opts.columns.reduce((s, c) => s + c.width, 0), 14, 'F');
    }
    let x = margin;
    row.forEach((cell, ci) => {
      const col = opts.columns[ci];
      const text = String(cell);
      doc.text(text, col.align === 'right' ? x + col.width - 4 : x + 4, y, { align: col.align === 'right' ? 'right' : 'left', maxWidth: col.width - 6 });
      x += col.width;
    });
    y += 14;
  });

  doc.setDrawColor(...BORDER);
  doc.rect(margin, margin + (opts.subtitle ? 34 : 18), opts.columns.reduce((s, c) => s + c.width, 0), 0);
}

function newPdfDoc(): jsPDF {
  return new jsPDF({ unit: 'pt' });
}

function savePdf(doc: jsPDF, name: string) {
  doc.save(`${name}-${new Date().toISOString().substring(0, 10)}.pdf`);
}

export default function Reports() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);

  const [level, setLevel] = useState<Level>('global');
  const [selectedMetric, setSelectedMetric] = useState<Metric | null>(null);
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [editDayModal, setEditDayModal] = useState<{ hospitalId: string; hospitalName: string; date: string } | null>(null);

  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().substring(0, 10);
  const defaultEnd = now.toISOString().substring(0, 10);
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);

  const load = async () => {
    const [{ data: h }, { data: me }, { data: s }, { data: p }, { data: att }, { data: pay }] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
      supabase.from('surgeries').select('*, patient:patients(*)').order('surgery_date', { ascending: false }),
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
      supabase.from('payments').select('*, patient:patients(*)'),
    ]);
    setHospitals(h || []);
    setMonthlyEntries(me || []);
    setSurgeries(s || []);
    setPatients(p || []);
    setAttendance(att || []);
    setPayments(pay || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const todayStr = now.toISOString().substring(0, 10);
  const rangeStart = startDate || '2000-01-01';
  const rangeEnd = endDate || todayStr;

  const summaries: HospitalSummary[] = buildHospitalSummaries({
    hospitals, patients, payments, surgeries, monthlyEntries, attendance,
    rangeStart, rangeEnd, todayStr,
  });
  const activeSummaries = summaries.filter((hs) => hs.hasActivity);
  const selectedHospitalSummary = summaries.find((hs) => hs.hospital.id === selectedHospitalId) || null;

  const globalCensus = activeSummaries.reduce((acc, hs) => ({
    op: acc.op + hs.opCount, ip: acc.ip + hs.ipCount, opinion: acc.opinion + hs.opinionCount,
  }), { op: 0, ip: 0, opinion: 0 });
  const globalSurgeryCategories = SURGERY_CATEGORIES.reduce((acc, c) => ({ ...acc, [c]: 0 }), {} as Record<typeof SURGERY_CATEGORIES[number], number>);
  activeSummaries.forEach((hs) => SURGERY_CATEGORIES.forEach((c) => { globalSurgeryCategories[c] += hs.surgeryCategories[c]; }));
  const globalLeave: LeaveBreakdown = activeSummaries.reduce((acc, hs) => {
    LEAVE_BREAKDOWN_KEYS.forEach((k) => { acc[k.key] += hs.leaveBreakdown[k.key]; });
    return acc;
  }, { cl: 0, weekOff: 0, medical: 0, pdo: 0, col: 0, other: 0 } as LeaveBreakdown);
  const globalCol = getColSummary(attendance);
  const globalFees = activeSummaries.reduce((acc, hs) => ({
    generated: acc.generated + hs.feesGenerated, received: acc.received + hs.feesReceived, pending: acc.pending + hs.overallPending,
  }), { generated: 0, received: 0, pending: 0 });
  const totalSurgeries = activeSummaries.reduce((s, hs) => s + hs.surgeriesCount, 0);

  const setQuickRange = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1));
    start.setDate(1);
    setStartDate(start.toISOString().substring(0, 10));
    setEndDate(end.toISOString().substring(0, 10));
  };
  const clearFilters = () => { setStartDate(''); setEndDate(''); };

  const rangeLabel = startDate || endDate
    ? `${startDate ? formatDate(startDate) : 'Start'} to ${endDate ? formatDate(endDate) : 'Today'}`
    : 'All time';

  const openMetric = (m: Metric) => { setSelectedMetric(m); setLevel('metric'); };
  const openHospitalLevel = (hospitalId: string) => { setSelectedHospitalId(hospitalId); setLevel('hospital'); };
  const goBack = () => {
    if (level === 'hospital') { setLevel('metric'); setSelectedHospitalId(null); }
    else if (level === 'metric') { setLevel('global'); setSelectedMetric(null); }
  };

  const handleDeleteDay = async (hospitalId: string, date: string) => {
    if (!confirm(`Delete all daily-entry and attendance records for ${formatDate(date)}? This cannot be undone.`)) return;
    await Promise.all([
      supabase.from('monthly_entries').delete().eq('hospital_id', hospitalId).eq('entry_date', date),
      supabase.from('attendance').delete().eq('hospital_id', hospitalId).eq('attendance_date', date),
    ]);
    load();
  };

  // ---- Excel export (adapts scope to the current level) ----
  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const scopeLabel = level === 'hospital' ? selectedHospitalSummary?.hospital.name
      : level === 'metric' ? `${METRICS.find((m) => m.id === selectedMetric)?.label} — All Hospitals`
      : 'Global Summary';

    const summaryRows = [
      ['Surgical Practice Report'], ['Scope', scopeLabel || ''], ['Generated', new Date().toLocaleString('en-GB')], ['Date Range', rangeLabel], [],
      ['Metric', 'Value'],
      ['OP', globalCensus.op], ['IP', globalCensus.ip], ['Opinion', globalCensus.opinion],
      ['Surgeries', totalSurgeries],
      ...LEAVE_BREAKDOWN_KEYS.map((k) => [`Leave — ${k.label}`, globalLeave[k.key]]),
      ['COL Accrued', globalCol.accrued], ['COL Redeemed', globalCol.redeemed], ['COL Available', globalCol.available],
      ['Fees Generated', globalFees.generated], ['Fees Received', globalFees.received], ['Fees Pending', globalFees.pending],
    ];
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summaryRows), 'Summary');

    const hospitalRows = [
      ['Hospital', 'OP', 'IP', 'Opinion', 'Surgeries', 'Present', 'Duties', ...LEAVE_BREAKDOWN_KEYS.map((k) => k.label), 'COL Accrued', 'COL Available', 'Fees Generated', 'Fees Received', 'Pending'],
      ...activeSummaries.map((hs) => [
        hs.hospital.name, hs.opCount, hs.ipCount, hs.opinionCount, hs.surgeriesCount, hs.present, hs.dutyCount,
        ...LEAVE_BREAKDOWN_KEYS.map((k) => hs.leaveBreakdown[k.key]), hs.colAccrued, hs.colAvailable,
        hs.feesGenerated, hs.feesReceived, hs.overallPending,
      ]),
    ];
    const hospitalSheet = XLSX.utils.aoa_to_sheet(hospitalRows);
    hospitalSheet['!cols'] = Array(7 + LEAVE_BREAKDOWN_KEYS.length + 5).fill({ wch: 13 });
    XLSX.utils.book_append_sheet(wb, hospitalSheet, 'Hospital-wise');

    if (level === 'hospital' && selectedHospitalSummary) {
      const dateRows = [
        ['Date', 'Attendance', 'OP', 'IP', 'Opinion', 'Surgeries', 'Fees Generated', 'Fees Received', 'Pending'],
        ...selectedHospitalSummary.days.map((d) => [
          formatDate(d.date), d.attendanceStatusLabel || 'No Entry', d.opCount, d.ipCount, d.opinionCount,
          d.surgeriesCount, d.feesGenerated, d.feesReceived, d.pendingFees,
        ]),
      ];
      const dateSheet = XLSX.utils.aoa_to_sheet(dateRows);
      dateSheet['!cols'] = Array(9).fill({ wch: 14 });
      XLSX.utils.book_append_sheet(wb, dateSheet, 'Date-wise');
    }

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([wbout], { type: 'application/octet-stream' }), `report-${level}-${new Date().toISOString().substring(0, 10)}.xlsx`);
  };

  // ---- PDF export (adapts scope to the current level) ----
  const exportPdf = () => {
    const doc = newPdfDoc();
    if (level === 'hospital' && selectedHospitalSummary) {
      drawTablePdf(doc, {
        title: `Date-wise Report — ${selectedHospitalSummary.hospital.name}`,
        subtitle: rangeLabel,
        columns: [
          { label: 'Date', width: 70 }, { label: 'Attendance', width: 80 },
          { label: 'OP', width: 30, align: 'right' }, { label: 'IP', width: 30, align: 'right' }, { label: 'Opinion', width: 45, align: 'right' },
          { label: 'Surgeries', width: 50, align: 'right' }, { label: 'Fees Gen.', width: 65, align: 'right' },
          { label: 'Fees Rec.', width: 65, align: 'right' }, { label: 'Pending', width: 65, align: 'right' },
        ],
        rows: selectedHospitalSummary.days.map((d) => [
          formatDate(d.date), d.attendanceStatusLabel || 'No Entry', d.opCount, d.ipCount, d.opinionCount,
          d.surgeriesCount, formatCurrency(d.feesGenerated), formatCurrency(d.feesReceived), formatCurrency(d.pendingFees),
        ]),
      });
      savePdf(doc, `report-${selectedHospitalSummary.hospital.name.replace(/\s+/g, '-').toLowerCase()}`);
      return;
    }

    if (level === 'metric' && selectedMetric) {
      const metricLabel = METRICS.find((m) => m.id === selectedMetric)?.label || '';
      const columns = selectedMetric === 'census'
        ? [{ label: 'Hospital', width: 150 }, { label: 'OP', width: 60, align: 'right' as const }, { label: 'IP', width: 60, align: 'right' as const }, { label: 'Opinion', width: 60, align: 'right' as const }]
        : selectedMetric === 'surgery'
        ? [{ label: 'Hospital', width: 130 }, ...SURGERY_CATEGORIES.map((c) => ({ label: c, width: 55, align: 'right' as const }))]
        : selectedMetric === 'leave'
        ? [{ label: 'Hospital', width: 130 }, ...LEAVE_BREAKDOWN_KEYS.map((k) => ({ label: k.label, width: 55, align: 'right' as const }))]
        : selectedMetric === 'col'
        ? [{ label: 'Hospital', width: 150 }, { label: 'Accrued', width: 70, align: 'right' as const }, { label: 'Redeemed', width: 70, align: 'right' as const }, { label: 'Available', width: 70, align: 'right' as const }]
        : [{ label: 'Hospital', width: 130 }, { label: 'Generated', width: 80, align: 'right' as const }, { label: 'Received', width: 80, align: 'right' as const }, { label: 'Pending', width: 80, align: 'right' as const }];
      const rows = activeSummaries.map((hs) => selectedMetric === 'census'
        ? [hs.hospital.name, hs.opCount, hs.ipCount, hs.opinionCount]
        : selectedMetric === 'surgery'
        ? [hs.hospital.name, ...SURGERY_CATEGORIES.map((c) => hs.surgeryCategories[c])]
        : selectedMetric === 'leave'
        ? [hs.hospital.name, ...LEAVE_BREAKDOWN_KEYS.map((k) => hs.leaveBreakdown[k.key])]
        : selectedMetric === 'col'
        ? [hs.hospital.name, hs.colAccrued, hs.colRedeemed, hs.colAvailable]
        : [hs.hospital.name, formatCurrency(hs.feesGenerated), formatCurrency(hs.feesReceived), formatCurrency(hs.overallPending)]
      );
      drawTablePdf(doc, { title: `${metricLabel} — Hospital-wise`, subtitle: rangeLabel, columns, rows });
      savePdf(doc, `report-${selectedMetric}`);
      return;
    }

    drawTablePdf(doc, {
      title: 'Surgical Practice Report — Global Summary',
      subtitle: rangeLabel,
      columns: [
        { label: 'Hospital', width: 110 }, { label: 'OP', width: 35, align: 'right' }, { label: 'IP', width: 35, align: 'right' }, { label: 'Opinion', width: 50, align: 'right' },
        { label: 'Surgeries', width: 55, align: 'right' }, { label: 'Leave (CL/WO/Med/PDO/COL/Oth)', width: 110, align: 'right' },
        { label: 'Fees Gen.', width: 65, align: 'right' }, { label: 'Fees Rec.', width: 65, align: 'right' }, { label: 'Pending', width: 65, align: 'right' },
      ],
      rows: activeSummaries.map((hs) => [
        hs.hospital.name, hs.opCount, hs.ipCount, hs.opinionCount, hs.surgeriesCount,
        LEAVE_BREAKDOWN_KEYS.map((k) => hs.leaveBreakdown[k.key]).join('/'),
        formatCurrency(hs.feesGenerated), formatCurrency(hs.feesReceived), formatCurrency(hs.overallPending),
      ]),
    });
    savePdf(doc, 'report-global-summary');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {level !== 'global' && (
            <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div>
            <h1 className="text-2xl font-bold text-slate-800">
              {level === 'global' ? 'Reports' : level === 'metric' ? METRICS.find((m) => m.id === selectedMetric)?.label : selectedHospitalSummary?.hospital.name || 'Hospital'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {level === 'global' ? 'Global summary — click a card to drill into hospitals, then a hospital for the date-wise log' : level === 'metric' ? 'Hospital-wise breakdown' : `Date-wise report — ${rangeLabel}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={exportExcel} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm">
            <FileSpreadsheet className="w-4 h-4" /> Excel
          </button>
          <button onClick={exportPdf} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition shadow-sm">
            <FileText className="w-4 h-4" /> PDF
          </button>
        </div>
      </div>

      {/* Date range filter — applies across all 3 levels */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setQuickRange(1)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">This Month</button>
            <button onClick={() => setQuickRange(3)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">3 Months</button>
            <button onClick={() => setQuickRange(6)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">6 Months</button>
            <button onClick={() => setQuickRange(12)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">1 Year</button>
          </div>
          <button onClick={clearFilters} className="px-3 py-2 text-xs font-medium rounded-lg text-slate-500 hover:bg-slate-100 transition">All Time</button>
        </div>
      </div>

      {/* Level 1: Global summary cards */}
      {level === 'global' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {METRICS.map((m) => {
            const Icon = m.icon;
            return (
              <button key={m.id} onClick={() => openMetric(m.id)} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition">
                <div className="flex items-center gap-2 mb-3"><Icon className={`w-4 h-4 ${m.color}`} /><h2 className="font-semibold text-slate-700">{m.label}</h2></div>
                {m.id === 'census' && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-xl font-bold text-sky-700">{globalCensus.op}</p><p className="text-[11px] text-slate-400">OP</p></div>
                    <div><p className="text-xl font-bold text-violet-700">{globalCensus.ip}</p><p className="text-[11px] text-slate-400">IP</p></div>
                    <div><p className="text-xl font-bold text-amber-700">{globalCensus.opinion}</p><p className="text-[11px] text-slate-400">Opinion</p></div>
                  </div>
                )}
                {m.id === 'surgery' && (
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {SURGERY_CATEGORIES.map((c) => (
                      <div key={c}><p className="text-lg font-bold text-slate-800">{globalSurgeryCategories[c]}</p><p className="text-[9px] text-slate-400">{c}</p></div>
                    ))}
                  </div>
                )}
                {m.id === 'leave' && (
                  <div className="grid grid-cols-6 gap-1 text-center">
                    {LEAVE_BREAKDOWN_KEYS.map((k) => (
                      <div key={k.key}>
                        <p className={`text-lg font-bold ${k.key === 'col' ? 'text-amber-700' : k.key === 'other' ? 'text-slate-600' : 'text-red-700'}`}>{globalLeave[k.key]}</p>
                        <p className="text-[9px] text-slate-400">{k.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {m.id === 'col' && (
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div><p className="text-xl font-bold text-amber-700">{globalCol.accrued}</p><p className="text-[11px] text-slate-400">Earned</p></div>
                    <div><p className="text-xl font-bold text-slate-600">{globalCol.redeemed}</p><p className="text-[11px] text-slate-400">Used</p></div>
                  </div>
                )}
                {m.id === 'fees' && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-sm font-bold text-slate-700">{formatCurrency(globalFees.generated)}</p><p className="text-[11px] text-slate-400">Generated</p></div>
                    <div><p className="text-sm font-bold text-emerald-600">{formatCurrency(globalFees.received)}</p><p className="text-[11px] text-slate-400">Received</p></div>
                    <div><p className={`text-sm font-bold ${globalFees.pending > 0 ? 'text-red-600' : 'text-slate-500'}`}>{formatCurrency(globalFees.pending)}</p><p className="text-[11px] text-slate-400">Pending</p></div>
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Level 2: Hospital-wise cards for the selected metric */}
      {level === 'metric' && (
        activeSummaries.length === 0 ? (
          <p className="text-sm text-slate-400 py-8 text-center">No hospital activity in this range.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeSummaries.map((hs) => (
              <button key={hs.hospital.id} onClick={() => openHospitalLevel(hs.hospital.id)} className="bg-white rounded-xl border border-slate-200 p-5 text-left hover:border-sky-300 hover:shadow-sm transition space-y-3">
                <div className="flex items-center gap-2"><Building2 className="w-4 h-4 text-slate-400" /><h2 className="font-semibold text-slate-800">{hs.hospital.name}</h2></div>
                {selectedMetric === 'census' && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-sky-700">{hs.opCount}</p><p className="text-[10px] text-slate-400">OP</p></div>
                    <div><p className="text-lg font-bold text-violet-700">{hs.ipCount}</p><p className="text-[10px] text-slate-400">IP</p></div>
                    <div><p className="text-lg font-bold text-amber-700">{hs.opinionCount}</p><p className="text-[10px] text-slate-400">Opinion</p></div>
                  </div>
                )}
                {selectedMetric === 'surgery' && (
                  <div className="grid grid-cols-5 gap-1 text-center">
                    {SURGERY_CATEGORIES.map((c) => (
                      <div key={c}><p className="text-sm font-bold text-slate-700">{hs.surgeryCategories[c]}</p><p className="text-[8px] text-slate-400">{c}</p></div>
                    ))}
                  </div>
                )}
                {selectedMetric === 'leave' && (
                  <div className="grid grid-cols-6 gap-1 text-center">
                    {LEAVE_BREAKDOWN_KEYS.map((k) => (
                      <div key={k.key}>
                        <p className={`text-sm font-bold ${k.key === 'col' ? 'text-amber-700' : k.key === 'other' ? 'text-slate-600' : 'text-red-700'}`}>{hs.leaveBreakdown[k.key]}</p>
                        <p className="text-[8px] text-slate-400">{k.label}</p>
                      </div>
                    ))}
                  </div>
                )}
                {selectedMetric === 'col' && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-amber-700">{hs.colAccrued}</p><p className="text-[10px] text-slate-400">Accrued</p></div>
                    <div><p className="text-lg font-bold text-slate-600">{hs.colRedeemed}</p><p className="text-[10px] text-slate-400">Redeemed</p></div>
                    <div><p className="text-lg font-bold text-emerald-600">{hs.colAvailable}</p><p className="text-[10px] text-slate-400">Available</p></div>
                  </div>
                )}
                {selectedMetric === 'fees' && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-sm font-bold text-slate-700">{formatCurrency(hs.feesGenerated)}</p><p className="text-[9px] text-slate-400">Generated</p></div>
                    <div><p className="text-sm font-bold text-emerald-600">{formatCurrency(hs.feesReceived)}</p><p className="text-[9px] text-slate-400">Received</p></div>
                    <div><p className={`text-sm font-bold ${hs.overallPending > 0 ? 'text-red-600' : 'text-slate-500'}`}>{formatCurrency(hs.overallPending)}</p><p className="text-[9px] text-slate-400">Pending</p></div>
                  </div>
                )}
              </button>
            ))}
          </div>
        )
      )}

      {/* Level 3: Date-wise table for the selected hospital */}
      {level === 'hospital' && selectedHospitalSummary && (
        <HospitalDailyTable
          rows={selectedHospitalSummary.days}
          onEditDate={(date) => setEditDayModal({ hospitalId: selectedHospitalSummary.hospital.id, hospitalName: selectedHospitalSummary.hospital.name, date })}
          onDeleteDate={(date) => handleDeleteDay(selectedHospitalSummary.hospital.id, date)}
        />
      )}

      {editDayModal && (
        <EditDayModal
          hospitalId={editDayModal.hospitalId}
          hospitalName={editDayModal.hospitalName}
          date={editDayModal.date}
          existingEntry={monthlyEntries.find((me) => me.hospital_id === editDayModal.hospitalId && (me.entry_date || me.month).substring(0, 10) === editDayModal.date) || null}
          existingAttendance={attendance.find((a) => a.hospital_id === editDayModal.hospitalId && a.attendance_date === editDayModal.date) || null}
          attendance={attendance}
          userId={user!.id}
          onClose={() => setEditDayModal(null)}
          onSaved={() => { setEditDayModal(null); load(); }}
        />
      )}
    </div>
  );
}
