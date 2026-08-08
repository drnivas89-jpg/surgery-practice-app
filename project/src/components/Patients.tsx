import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Patient, Hospital } from '@/lib/types';
import { formatDate, formatCurrency, daysUntil } from '@/lib/helpers';
import { Users, Plus, Search, Activity, Calendar, ArrowLeft, Trash2, Pencil, Download } from 'lucide-react';
import { saveAs } from 'file-saver';
import PatientForm from './PatientForm';
import PatientDetail from './PatientDetail';

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editPatient, setEditPatient] = useState<Patient | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: p }, { data: h }] = await Promise.all([
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('hospitals').select('*').order('name'),
    ]);
    setPatients(p || []);
    setHospitals(h || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = patients.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.patient_name.toLowerCase().includes(q) ||
      p.unique_id.toLowerCase().includes(q) ||
      (p.mobile_number || '').toLowerCase().includes(q) ||
      (p.hospital?.name || '').toLowerCase().includes(q)
    );
  });

  const totalFees = filtered.reduce((s, p) => s + (p.fees || 0), 0);
  const opFees = filtered.filter((p) => p.patient_type === 'op').reduce((s, p) => s + (p.fees || 0), 0);
  const ipFees = filtered.filter((p) => p.patient_type === 'ip').reduce((s, p) => s + (p.fees || 0), 0);

  const handleDeletePatient = async (id: string, name: string) => {
    if (!confirm(`Delete patient "${name}" and all associated records? This cannot be undone.`)) return;
    await supabase.from('patients').delete().eq('id', id);
    load();
  };

  const handleDownloadAll = () => {
    const headers = [
      'Unique ID', 'Name', 'Hospital', 'Type', 'Age', 'Sex', 'Mobile Number',
      'Diagnosis', 'Prescription', 'Fees', 'Admission Date', 'Discharge Date',
      'Surgery Date', 'Follow-up Date', 'Minor Procedure Done', 'Created At',
    ];
    const rows = filtered.map((p) => [
      p.unique_id, p.patient_name, p.hospital?.name || '', p.patient_type || '',
      p.age ?? '', p.sex || '', p.mobile_number || '', p.diagnosis || '',
      (p.prescription || '').replace(/\r?\n/g, ' '), p.fees ?? 0,
      p.admission_date || '', p.discharge_date || '', p.surgery_date || '',
      p.follow_up_date || '', p.minor_procedure_done ? 'Yes' : 'No', p.created_at || '',
    ]);
    const escapeCsv = (v: unknown) => {
      const s = String(v ?? '');
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\r\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const dateStamp = new Date().toISOString().substring(0, 10);
    saveAs(blob, `patients-export-${dateStamp}.csv`);
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
    return (
      <PatientForm
        hospitals={hospitals}
        editPatient={editPatient}
        onDone={() => {
          setShowForm(false);
          setEditPatient(null);
          load();
        }}
        onCancel={() => {
          setShowForm(false);
          setEditPatient(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Surgical Patient Entry</h1>
          <p className="text-slate-500 text-sm mt-0.5">{patients.length} total patients (OP, IP & surgical)</p>
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
            Add Patient
          </button>
        </div>
      </div>

      {hospitals.length === 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-700">
          You need to add at least one hospital before creating a patient record.
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, ID, phone, or hospital..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
        />
      </div>

      {!loading && filtered.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xl font-bold text-slate-800">{formatCurrency(totalFees)}</p>
            <p className="text-xs text-slate-400">Total Fees ({filtered.length} patients)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xl font-bold text-sky-700">{formatCurrency(opFees)}</p>
            <p className="text-xs text-slate-400">OP Fees ({filtered.filter((p) => p.patient_type === 'op').length} patients)</p>
          </div>
          <div className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-xl font-bold text-emerald-700">{formatCurrency(ipFees)}</p>
            <p className="text-xs text-slate-400">IP Fees ({filtered.filter((p) => p.patient_type === 'ip').length} patients)</p>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Users className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">
            {search ? 'No patients match your search.' : 'No patients yet. Add your first patient to get started.'}
          </p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Patient ID</th>
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Hospital</th>
                  <th className="px-4 py-3 font-medium">Age/Sex</th>
                  <th className="px-4 py-3 font-medium">Fees</th>
                  <th className="px-4 py-3 font-medium">Surgery Date</th>
                  <th className="px-4 py-3 font-medium">Follow-up</th>
                  <th className="px-4 py-3 font-medium text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const surgeryDays = daysUntil(p.surgery_date);
                  const followupDays = daysUntil(p.follow_up_date);
                  return (
                    <tr
                      key={p.id}
                      onClick={() => setSelectedId(p.id)}
                      className="border-b border-slate-50 hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="px-4 py-3 font-mono text-xs text-sky-600 font-medium">
                        <div className="flex items-center gap-2">
                          {p.unique_id}
                          {p.patient_type && (
                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                              p.patient_type === 'op' ? 'bg-sky-100 text-sky-700' : 'bg-violet-100 text-violet-700'
                            }`}>
                              {p.patient_type.toUpperCase()}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{p.patient_name}</td>
                      <td className="px-4 py-3 text-slate-500">{p.hospital?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-500">
                        {p.age ? `${p.age}y` : '—'} {p.sex ? `/ ${p.sex}` : ''}
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{formatCurrency(p.fees || 0)}</td>
                      <td className="px-4 py-3">
                        {p.surgery_date ? (
                          <div className="flex items-center gap-1.5">
                            <Activity className="w-3 h-3 text-sky-500" />
                            <span className="text-slate-600">{formatDate(p.surgery_date)}</span>
                            {surgeryDays !== null && surgeryDays >= 0 && surgeryDays <= 7 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                {surgeryDays === 0 ? 'today' : `${surgeryDays}d`}
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {p.follow_up_date ? (
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-3 h-3 text-violet-500" />
                            <span className="text-slate-600">{formatDate(p.follow_up_date)}</span>
                            {followupDays !== null && followupDays >= 0 && followupDays <= 7 && (
                              <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">
                                {followupDays === 0 ? 'today' : `${followupDays}d`}
                              </span>
                            )}
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setSelectedId(p.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition"
                            title="View / Edit"
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
              <tfoot>
                <tr className="bg-slate-50 border-t-2 border-slate-200">
                  <td className="px-4 py-3 font-semibold text-slate-600" colSpan={4}>Total</td>
                  <td className="px-4 py-3 font-bold text-slate-800">{formatCurrency(totalFees)}</td>
                  <td className="px-4 py-3" colSpan={3}></td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
