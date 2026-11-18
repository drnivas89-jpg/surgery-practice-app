import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { moveToBin, binParts } from '@/lib/recycleBin';
import { Patient, Hospital, Surgery, FollowUp } from '@/lib/types';
import { formatDate, isSurgicalCase, isHpeAwaiting } from '@/lib/helpers';
import { ClipboardList, Plus, Search, Trash2, Pencil, Download, FlaskConical, List, BarChart3 } from 'lucide-react';
import { saveAs } from 'file-saver';
import PatientForm from './PatientForm';
import SurgicalCaseForm from './SurgicalCaseForm';
import PatientDetail from './PatientDetail';
import CaseInsights, { InsightCase } from './CaseInsights';

type CaseRow = Patient & {
  surgeries: Pick<Surgery, 'procedure_name' | 'procedure_category' | 'surgery_date' | 'procedure_notes' | 'role' | 'outcome' | 'clavien_dindo' | 'created_at'>[];
  follow_ups: Pick<FollowUp, 'type' | 'report_number' | 'findings' | 'report_image_paths'>[];
};

const CATEGORY_BADGE: Record<string, string> = {
  Major: 'bg-violet-100 text-violet-700',
  Minor: 'bg-sky-100 text-sky-700',
  Bedside: 'bg-emerald-100 text-emerald-700',
};

// The case's primary surgery is the first one recorded for it.
const primarySurgery = (p: CaseRow) =>
  [...(p.surgeries || [])].sort((a, b) => a.created_at.localeCompare(b.created_at))[0];
const hpeReport = (p: CaseRow) => (p.follow_ups || []).find((f) => f.type === 'biopsy');

export default function Patients({ focusPatientId, onFocusHandled }: { focusPatientId?: string | null; onFocusHandled?: () => void } = {}) {
  const [patients, setPatients] = useState<CaseRow[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showOlder, setShowOlder] = useState(false);
  const [awaitingOnly, setAwaitingOnly] = useState(false);
  const [tab, setTab] = useState<'list' | 'insights'>('list');
  const [showForm, setShowForm] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: p }, { data: h }] = await Promise.all([
      supabase
        .from('patients')
        .select('*, hospital:hospitals(*), surgeries(*), follow_ups(type, report_number, findings, report_image_paths)')
        .order('surgery_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false }),
      supabase.from('hospitals').select('*').order('name'),
    ]);
    setPatients((p as CaseRow[]) || []);
    setHospitals(h || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  // Opened from global search: jump straight to that patient's record.
  useEffect(() => {
    if (!focusPatientId) return;
    setShowForm(false);
    setSelectedId(focusPatientId);
    onFocusHandled?.();
  }, [focusPatientId, onFocusHandled]);

  const cases = patients.filter(isSurgicalCase);
  const olderCount = patients.length - cases.length;
  const isAwaiting = (p: CaseRow) => { const h = hpeReport(p); return !!h && isHpeAwaiting(h); };
  const awaitingCount = cases.filter(isAwaiting).length;
  const visible = (showOlder ? patients : cases).filter((p) => !awaitingOnly || isAwaiting(p));

  const filtered = visible.filter((p) => {
    const q = search.toLowerCase();
    const s = primarySurgery(p);
    return (
      p.patient_name.toLowerCase().includes(q) ||
      p.unique_id.toLowerCase().includes(q) ||
      (p.mobile_number || '').toLowerCase().includes(q) ||
      (p.hospital?.name || '').toLowerCase().includes(q) ||
      (p.diagnosis || '').toLowerCase().includes(q) ||
      (s?.procedure_name || '').toLowerCase().includes(q)
    );
  });

  const insightCases: InsightCase[] = (showOlder ? patients : cases).flatMap((p) => {
    const s = primarySurgery(p);
    if (!s) return [];
    const hpe = hpeReport(p);
    return [{
      date: (s.surgery_date || p.surgery_date || '').substring(0, 10) || null,
      category: s.procedure_category || '',
      procedure: s.procedure_name || '',
      hospital: p.hospital?.name || '',
      role: s.role === 'assisted_by_me' ? 'assisted' : 'performed',
      outcome: s.outcome || '',
      grade: s.clavien_dindo || '',
      hpe: hpe ? (isHpeAwaiting(hpe) ? 'awaiting' : 'received') : 'none',
    }];
  });

  const countBy = (cat: string) => filtered.filter((p) => primarySurgery(p)?.procedure_category === cat).length;

  const handleDeletePatient = async (id: string, name: string) => {
    if (!confirm(`Delete case "${name}" and all associated records? You can restore it from the Recycle bin for 30 days.`)) return;
    const { error: binErr } = await moveToBin('case', name, binParts.patient(id));
    if (binErr) { alert(binErr); return; }
    load();
  };

  const handleDownloadAll = () => {
    const headers = [
      'Case ID', 'Name', 'Age', 'Sex', 'Mobile Number', 'Hospital', 'Date of Surgery',
      'Type of Surgery', 'Procedure', 'Role', 'Diagnosis', 'Operative Notes', 'HPE Status', 'HPE Number', 'HPE Report',
    ];
    const rows = filtered.map((p) => {
      const s = primarySurgery(p);
      const hpe = hpeReport(p);
      return [
        p.unique_id, p.patient_name, p.age ?? '', p.sex || '', p.mobile_number || '', p.hospital?.name || '',
        s?.surgery_date || p.surgery_date || '', s?.procedure_category || '', s?.procedure_name || '',
        s ? (s.role === 'assisted_by_me' ? 'Assisted' : 'Done by me') : '',
        p.diagnosis || '', s?.procedure_notes || '', hpe ? (isHpeAwaiting(hpe) ? 'Awaiting' : 'Received') : 'Not sent',
        hpe?.report_number || '', hpe?.findings || '',
      ];
    });
    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const dateStamp = new Date().toISOString().substring(0, 10);
    saveAs(blob, `surgical-cases-${dateStamp}.csv`);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditPatient(null);
  };

  if (selectedId) {
    return (
      <PatientDetail
        patientId={selectedId}
        onBack={() => {
          setSelectedId(null);
          load();
        }}
        onEdit={(p) => {
          setEditPatient(p);
          setSelectedId(null);
          setShowForm(true);
        }}
        onNewVisit={(p) => {
          setEditPatient(p);
          setSelectedId(null);
          setShowForm(true);
        }}
      />
    );
  }

  if (showForm) {
    // Older OP/IP/Opinion registrations keep their original editor so
    // their type, fees and discharge fields aren't lost.
    if (editPatient && !isSurgicalCase(editPatient)) {
      return (
        <PatientForm
          hospitals={hospitals}
          editPatient={editPatient}
          onDone={() => { closeForm(); load(); }}
          onCancel={closeForm}
        />
      );
    }
    return (
      <SurgicalCaseForm
        hospitals={hospitals}
        editPatient={editPatient}
        onDone={() => { closeForm(); load(); }}
        onCancel={closeForm}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Surgical Case Entry</h1>
          <p className="text-slate-500 text-sm mt-0.5">{cases.length} surgical case{cases.length === 1 ? '' : 's'} recorded for study</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadAll}
            disabled={filtered.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
            title="Download the currently filtered list as CSV"
          >
            <Download className="w-4 h-4" />
            Download
          </button>
          <button
            onClick={() => { setEditPatient(null); setShowForm(true); }}
            disabled={hospitals.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            New Surgical Case
          </button>
        </div>
      </div>

      {hospitals.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          You need to add at least one hospital before recording a surgical case.
        </div>
      )}

      <div className="inline-flex bg-white border border-slate-200 rounded-xl p-1 shadow-sm">
        {([['list', 'Cases', List], ['insights', 'Insights', BarChart3]] as const).map(([id, label, Icon]) => (
          <button
            key={id}
            onClick={() => setTab(id)}
            aria-pressed={tab === id}
            className={`inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === id ? 'bg-sky-600 text-white' : 'text-slate-600 hover:bg-slate-50'}`}
          >
            <Icon className="w-4 h-4" /> {label}
          </button>
        ))}
      </div>

      {tab === 'insights' ? (
        <CaseInsights cases={insightCases} />
      ) : (<>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[16rem]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, procedure, diagnosis or hospital..."
            className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
          />
        </div>
        {awaitingCount > 0 && (
          <button
            onClick={() => setAwaitingOnly(!awaitingOnly)}
            aria-pressed={awaitingOnly}
            className={`inline-flex items-center gap-1.5 text-sm font-semibold px-3 py-2 rounded-lg transition ${awaitingOnly ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-800 hover:bg-amber-100'}`}
          >
            <FlaskConical className="w-4 h-4" /> Awaiting HPE ({awaitingCount})
          </button>
        )}
        {olderCount > 0 && (
          <label className="flex items-center gap-2 text-sm text-slate-500 cursor-pointer select-none">
            <input type="checkbox" checked={showOlder} onChange={(e) => setShowOlder(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
            Include {olderCount} older OP/IP record{olderCount === 1 ? '' : 's'}
          </label>
        )}
      </div>

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatTile value={filtered.length} label="Cases" className="text-slate-800" />
          <StatTile value={countBy('Major')} label="Major" className="text-violet-700" />
          <StatTile value={countBy('Minor')} label="Minor" className="text-sky-700" />
          <StatTile value={countBy('Bedside')} label="Bedside" className="text-emerald-700" />
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <ClipboardList className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {search ? 'No cases match your search.' : 'No surgical cases yet. Click "New Surgical Case" to record your first one.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Patient</th>
                  <th className="px-4 py-3 font-medium">Age/Sex</th>
                  <th className="px-4 py-3 font-medium">Procedure</th>
                  <th className="px-4 py-3 font-medium">Hospital</th>
                  <th className="px-4 py-3 font-medium">HPE</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const s = primarySurgery(p);
                  const hpe = hpeReport(p);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{formatDate(s?.surgery_date || p.surgery_date)}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-700">{p.patient_name}</p>
                        <p className="font-mono text-[11px] text-sky-600">
                          {p.unique_id}
                          {!isSurgicalCase(p) && p.patient_type && <span className="ml-1.5 text-slate-400">{p.patient_type.toUpperCase()}</span>}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-500 whitespace-nowrap">
                        {p.age ? `${p.age}y` : '—'} {p.sex ? `/ ${p.sex}` : ''}
                      </td>
                      <td className="px-4 py-3">
                        {s ? (
                          <div className="flex items-center gap-2 flex-wrap">
                            {s.procedure_category && (
                              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${CATEGORY_BADGE[s.procedure_category] || 'bg-slate-100 text-slate-600'}`}>
                                {s.procedure_category}
                              </span>
                            )}
                            <span className="text-slate-700">{s.procedure_name || '—'}</span>
                          </div>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{p.hospital?.name || '—'}</td>
                      <td className="px-4 py-3">
                        {hpe && isHpeAwaiting(hpe) ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-800 bg-amber-100 px-2 py-0.5 rounded" title="Specimen sent — report awaited">
                            <FlaskConical className="w-3 h-3" /> Awaiting
                          </span>
                        ) : hpe ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-violet-700 bg-violet-50 px-2 py-0.5 rounded" title={hpe.findings || undefined}>
                            <FlaskConical className="w-3 h-3" /> {hpe.report_number || 'Received'}
                          </span>
                        ) : <span className="text-slate-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => { setEditPatient(p); setShowForm(true); }}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition"
                            title="Edit"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeletePatient(p.id, p.patient_name)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition"
                            title="Delete"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
      </>)}
    </div>
  );
}

function StatTile({ value, label, className }: { value: number; label: string; className: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <p className={`text-xl font-bold ${className}`}>{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
