import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Hospital, MonthlyEntry, Attendance, Patient, ClassEntry } from '@/lib/types';
import { formatCurrency, formatDate, uploadImage, ensurePresentAttendance } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { Building2, Plus, Trash2, X, Calendar, Pencil, Users, Activity, Clock, CheckCircle2, LogOut, Zap, Search, UserRound, Stethoscope, ArrowRight, GraduationCap, Upload } from 'lucide-react';
import PatientForm from './PatientForm';
import PatientRegistrationWizard from './PatientRegistrationWizard';

export default function Hospitals() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [entries, setEntries] = useState<MonthlyEntry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // OP/IP patient entry
  const [patientSearch, setPatientSearch] = useState('');
  const [showPatientForm, setShowPatientForm] = useState(false);
  const [entryPatientType, setEntryPatientType] = useState<'op' | 'ip'>('op');
  const [entryHospitalId, setEntryHospitalId] = useState('');
  const [editingPatient, setEditingPatient] = useState<Patient | null>(null);

  // Classes / Teaching
  const [classes, setClasses] = useState<ClassEntry[]>([]);
  const [showClassForm, setShowClassForm] = useState(false);
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [cHospital, setCHospital] = useState('');
  const [cDate, setCDate] = useState(new Date().toISOString().split('T')[0]);
  const [cType, setCType] = useState('');
  const [cAudience, setCAudience] = useState('');
  const [cTopic, setCTopic] = useState('');
  const [cNotes, setCNotes] = useState('');
  const [cPptFile, setCPptFile] = useState<File | null>(null);
  const [cSaving, setCSaving] = useState(false);
  const [cError, setCError] = useState<string | null>(null);

  // Attendance form
  const [attHospital, setAttHospital] = useState('');
  const [attDate, setAttDate] = useState(new Date().toISOString().split('T')[0]);
  const [attStatus, setAttStatus] = useState<'present' | 'leave' | 'extra_duty'>('present');
  const [attDutyType, setAttDutyType] = useState<'normal' | 'duty'>('normal');
  const [attLeaveType, setAttLeaveType] = useState('');
  const [attCompensatedDate, setAttCompensatedDate] = useState('');
  const [attExtraType, setAttExtraType] = useState('');
  const [attNotes, setAttNotes] = useState('');
  const [attError, setAttError] = useState<string | null>(null);

  // COL credits are hospital-strict: a credit earned at hospital A can only
  // be redeemed at hospital A, so this is scoped to whichever hospital is
  // currently selected in the attendance form.
  const colSummary = useMemo(() => getColSummary(attendance, attHospital || undefined), [attendance, attHospital]);

  // Entry form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [eHospital, setEHospital] = useState('');
  const [eDate, setEDate] = useState(new Date().toISOString().split('T')[0]);
  const [eOp, setEOp] = useState('');
  const [eOpinion, setEOpinion] = useState('');
  const [eFeesGen, setEFeesGen] = useState('');
  const [eFeesRec, setEFeesRec] = useState('');
  const [eNotes, setENotes] = useState('');

  const load = async () => {
    const [{ data: h }, { data: me }, { data: att }, { data: pts }, { data: cls }] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('entry_date', { ascending: false }),
      supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('classes').select('*, hospital:hospitals(*)').order('class_date', { ascending: false }),
    ]);
    setHospitals(h || []);
    setEntries(me || []);
    setAttendance(att || []);
    setPatients(pts || []);
    setClasses(cls || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetEntryForm = () => {
    setEditingId(null);
    setEHospital(''); setEDate(new Date().toISOString().split('T')[0]);
    setEOp(''); setEOpinion(''); setEFeesGen(''); setEFeesRec(''); setENotes('');
    setError(null);
  };

  const openEditEntry = (e: MonthlyEntry) => {
    setEditingId(e.id);
    setEHospital(e.hospital_id);
    setEDate(e.entry_date ? e.entry_date.substring(0, 10) : '');
    setEOp(e.op_patients?.toString() || '');
    setEOpinion(e.opinion_patients?.toString() || '');
    setEFeesGen(e.fees_generated?.toString() || '');
    setEFeesRec(e.fees_received?.toString() || '');
    setENotes(e.notes || '');
    setError(null);
    setShowEntry(true);
  };

  const handleAddHospital = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return;
    const { error } = await supabase.from('hospitals').insert({ name: name.trim() });
    if (error) { setError(error.message); return; }
    setName('');
    setShowAdd(false);
    load();
  };

  const handleDeleteHospital = async (id: string) => {
    if (!confirm('Delete this hospital? All records under it will also be removed.')) return;
    await supabase.from('hospitals').delete().eq('id', id);
    load();
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!eHospital) { setError('Please select a hospital.'); return; }
    const payload = {
      hospital_id: eHospital,
      entry_date: eDate,
      month: eDate.substring(0, 7) + '-01',
      op_patients: parseInt(eOp) || 0,
      opinion_patients: parseInt(eOpinion) || 0,
      fees_generated: parseFloat(eFeesGen) || 0,
      fees_received: parseFloat(eFeesRec) || 0,
      notes: eNotes,
    };
    if (editingId) {
      const { error } = await supabase.from('monthly_entries').update(payload).eq('id', editingId);
      if (error) { setError(error.message); return; }
    } else {
      const { error } = await supabase.from('monthly_entries').upsert(payload, {
        onConflict: 'hospital_id,entry_date',
      });
      if (error) { setError(error.message); return; }
    }
    if (user) await ensurePresentAttendance(user.id, eHospital, eDate);
    setShowEntry(false);
    resetEntryForm();
    load();
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Delete this daily entry?')) return;
    await supabase.from('monthly_entries').delete().eq('id', id);
    load();
  };

  const resetAttendanceForm = () => {
    setAttHospital(''); setAttDate(new Date().toISOString().split('T')[0]);
    setAttStatus('present'); setAttDutyType('normal');
    setAttLeaveType(''); setAttCompensatedDate(''); setAttExtraType(''); setAttNotes('');
    setAttError(null);
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttError(null);
    if (!attHospital) { setAttError('Please select a hospital.'); return; }
    if (attStatus === 'leave' && !attLeaveType.trim()) { setAttError('Please enter the type of leave.'); return; }
    if (attStatus === 'extra_duty' && !attExtraType.trim()) { setAttError('Please enter the extra duty type.'); return; }
    if (!user) { setAttError('You must be signed in to add attendance.'); return; }
    const payload = {
      user_id: user.id,
      hospital_id: attHospital,
      attendance_date: attDate,
      status: attStatus,
      duty_type: attStatus === 'present' ? attDutyType : null,
      leave_type: attStatus === 'leave' ? attLeaveType.trim() : null,
      compensated_working_date: attStatus === 'leave' && attCompensatedDate ? attCompensatedDate : null,
      extra_duty_type: attStatus === 'extra_duty' ? attExtraType.trim() : null,
      notes: attNotes,
    };
    const { error } = await supabase.from('attendance').insert(payload);
    if (error) {
      setAttError(error.code === '23505'
        ? 'Attendance is already recorded for this hospital on this date (or that COL credit date is already redeemed).'
        : error.message);
      return;
    }
    setShowAttendance(false);
    resetAttendanceForm();
    load();
  };

  const handleDeleteAttendance = async (id: string) => {
    if (!confirm('Delete this attendance entry?')) return;
    await supabase.from('attendance').delete().eq('id', id);
    load();
  };

  const resetClassForm = () => {
    setEditingClassId(null);
    setCHospital(''); setCDate(new Date().toISOString().split('T')[0]);
    setCType(''); setCAudience(''); setCTopic(''); setCNotes('');
    setCPptFile(null); setCError(null);
  };

  const openEditClass = (c: ClassEntry) => {
    setEditingClassId(c.id);
    setCHospital(c.hospital_id || '');
    setCDate(c.class_date ? c.class_date.substring(0, 10) : new Date().toISOString().split('T')[0]);
    setCType(c.class_type || '');
    setCAudience(c.audience || '');
    setCTopic(c.topic || '');
    setCNotes(c.notes || '');
    setCPptFile(null);
    setCError(null);
    setShowClassForm(true);
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setCSaving(true);
    setCError(null);

    const payload: Record<string, unknown> = {
      hospital_id: cHospital || null,
      class_date: cDate || null,
      class_type: cType,
      audience: cAudience,
      topic: cTopic,
      notes: cNotes,
    };

    if (cPptFile) {
      payload.ppt_path = await uploadImage(cPptFile, user.id, 'class-ppt');
    } else if (!editingClassId) {
      payload.ppt_path = null;
    }

    if (editingClassId) {
      const { error } = await supabase.from('classes').update(payload).eq('id', editingClassId);
      if (error) { setCError(error.message); setCSaving(false); return; }
    } else {
      const { error } = await supabase.from('classes').insert({ ...payload, user_id: user.id });
      if (error) { setCError(error.message); setCSaving(false); return; }
    }
    setCSaving(false);
    setShowClassForm(false);
    resetClassForm();
    load();
  };

  const handleDeleteClass = async (id: string) => {
    if (!confirm('Delete this class entry?')) return;
    await supabase.from('classes').delete().eq('id', id);
    load();
  };

  const matchedPatients = patientSearch.trim().length >= 2
    ? patients.filter((p) => {
        const q = patientSearch.toLowerCase();
        return (
          p.patient_name.toLowerCase().includes(q) ||
          p.unique_id.toLowerCase().includes(q) ||
          (p.mobile_number || '').toLowerCase().includes(q)
        );
      }).slice(0, 8)
    : [];

  const openNewEntry = (type: 'op' | 'ip') => {
    setEntryPatientType(type);
    setEntryHospitalId('');
    setEditingPatient(null);
    setShowPatientForm(true);
  };

  const openFollowUp = (p: Patient) => {
    setEditingPatient(p);
    setShowPatientForm(true);
  };

  if (showPatientForm) {
    if (!editingPatient) {
      return (
        <PatientRegistrationWizard
          hospitals={hospitals}
          defaultHospitalId={entryHospitalId || undefined}
          onDone={() => {
            setShowPatientForm(false);
            setPatientSearch('');
            load();
          }}
          onCancel={() => setShowPatientForm(false)}
        />
      );
    }
    return (
      <PatientForm
        hospitals={hospitals}
        editPatient={editingPatient}
        defaultHospitalId={entryHospitalId || undefined}
        defaultPatientType={entryPatientType}
        onDone={() => {
          setShowPatientForm(false);
          setEditingPatient(null);
          setPatientSearch('');
          load();
        }}
        onCancel={() => {
          setShowPatientForm(false);
          setEditingPatient(null);
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Hospitals</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage hospitals and daily OP/IP entries</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { resetAttendanceForm(); setShowAttendance(true); }}
            disabled={hospitals.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition shadow-sm disabled:opacity-50"
          >
            <Clock className="w-4 h-4" />
            Add Attendance
          </button>
          <button
            onClick={() => { resetEntryForm(); setShowEntry(true); }}
            disabled={hospitals.length === 0}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
          >
            <Calendar className="w-4 h-4" />
            Add Daily Entry
          </button>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Hospital
          </button>
        </div>
      </div>

      {/* OP / IP Patient Entry */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-1">
          <Search className="w-4 h-4 text-sky-500" />
          <h2 className="font-semibold text-slate-700">OP / IP Patient Entry</h2>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Search first to avoid duplicate records — if the patient already exists, add their follow-up under the same unique ID instead of creating a new one.
        </p>
        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            id="hosp-patient-search"
            name="patientSearch"
            aria-label="Search existing patient by name, phone, or unique ID"
            type="text"
            value={patientSearch}
            onChange={(e) => setPatientSearch(e.target.value)}
            placeholder="Search existing patient by name, phone, or unique ID..."
            className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>

        {patientSearch.trim().length >= 2 && (
          <div className="mb-4">
            {matchedPatients.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">No existing patient matches — use the buttons below to create a new entry.</p>
            ) : (
              <div className="space-y-2">
                {matchedPatients.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => openFollowUp(p)}
                    className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50 hover:border-sky-300 hover:bg-sky-50 transition text-left"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${p.patient_type === 'ip' ? 'bg-violet-100 text-violet-600' : 'bg-sky-100 text-sky-600'}`}>
                        {p.patient_type === 'ip' ? <Stethoscope className="w-4 h-4" /> : <UserRound className="w-4 h-4" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{p.patient_name} <span className="text-xs font-mono text-slate-400">({p.unique_id})</span></p>
                        <p className="text-xs text-slate-400 truncate">{p.hospital?.name || '—'} {p.mobile_number ? `· ${p.mobile_number}` : ''}</p>
                      </div>
                    </div>
                    <span className="flex items-center gap-1 text-xs font-medium text-sky-600 flex-shrink-0">
                      Add follow-up <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => openNewEntry('op')}
            disabled={hospitals.length === 0}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-sky-200 hover:border-sky-400 hover:bg-sky-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-sky-100 text-sky-600 flex items-center justify-center"><UserRound className="w-5 h-5" /></div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-700">New OP Entry</p>
              <p className="text-xs text-slate-400">Demographics, ID, prescription, investigations</p>
            </div>
          </button>
          <button
            onClick={() => openNewEntry('ip')}
            disabled={hospitals.length === 0}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-violet-200 hover:border-violet-400 hover:bg-violet-50 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-10 h-10 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center"><Stethoscope className="w-5 h-5" /></div>
            <div className="text-left">
              <p className="text-sm font-semibold text-slate-700">New IP Entry</p>
              <p className="text-xs text-slate-400">All OP fields, plus admission &amp; discharge dates</p>
            </div>
          </button>
        </div>
        {hospitals.length === 0 && (
          <p className="text-xs text-amber-600 mt-3">Add a hospital first to enable patient entry.</p>
        )}
      </div>

      {/* Classes / Teaching */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-700">Classes / Teaching</h2>
          </div>
          <button
            onClick={() => { resetClassForm(); setShowClassForm(true); }}
            className="flex items-center gap-1.5 text-xs font-medium text-violet-600 bg-violet-50 hover:bg-violet-100 px-3 py-1.5 rounded-lg transition"
          >
            <Plus className="w-3.5 h-3.5" /> Add Class
          </button>
        </div>
        {classes.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No classes logged yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Audience</th>
                  <th className="px-3 py-2 font-medium">Topic</th>
                  <th className="px-3 py-2 font-medium">PPT</th>
                  <th className="px-3 py-2 font-medium"></th>
                </tr>
              </thead>
              <tbody>
                {classes.map((c) => (
                  <tr key={c.id} className="border-b border-slate-50 hover:bg-slate-50 transition group">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(c.class_date)}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.class_type || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{c.audience || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700 font-medium">{c.topic || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{c.ppt_path ? 'Uploaded' : '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => openEditClass(c)} className="text-slate-300 hover:text-sky-500 transition p-1">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => handleDeleteClass(c.id)} className="text-slate-300 hover:text-red-500 transition p-1">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Hospitals */}
      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        </div>
      ) : hospitals.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No hospitals added yet. Add one to get started.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {hospitals.map((h) => {
            const hospEntries = entries.filter((e) => e.hospital_id === h.id);
            const totalOp = hospEntries.reduce((s, e) => s + e.op_patients, 0);
            const totalOpinion = hospEntries.reduce((s, e) => s + e.opinion_patients, 0);
            return (
              <div key={h.id} className="bg-white rounded-xl border border-slate-200 p-5 group">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-emerald-600" />
                  </div>
                  <button
                    onClick={() => handleDeleteHospital(h.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <h3 className="font-semibold text-slate-800 mt-3">{h.name}</h3>
                <p className="text-xs text-slate-400 mt-1">
                  {hospEntries.length} daily {hospEntries.length === 1 ? 'entry' : 'entries'}
                </p>
                {hospEntries.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-1.5 text-xs">
                      <Users className="w-3.5 h-3.5 text-sky-500" />
                      <span className="text-slate-500">OP: <span className="font-medium text-slate-700">{totalOp}</span></span>
                    </div>
                    <div className="flex items-center gap-1.5 text-xs">
                      <Activity className="w-3.5 h-3.5 text-violet-500" />
                      <span className="text-slate-500">Opinion: <span className="font-medium text-slate-700">{totalOpinion}</span></span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Daily Entries Table */}
      {entries.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h2 className="font-semibold text-slate-700">Daily Entries</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Hospital</th>
                  <th className="px-4 py-3 font-medium">OP</th>
                  <th className="px-4 py-3 font-medium">Opinion</th>
                  <th className="px-4 py-3 font-medium">Fees Gen.</th>
                  <th className="px-4 py-3 font-medium">Fees Rec.</th>
                  <th className="px-4 py-3 font-medium">Pending</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => {
                  const pending = e.fees_generated - e.fees_received;
                  return (
                    <tr key={e.id} className="border-b border-slate-50 group">
                      <td className="px-4 py-3 text-slate-600">
                        {formatDate(e.entry_date || e.month)}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-700">{e.hospital?.name || '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{e.op_patients}</td>
                      <td className="px-4 py-3 text-slate-600">{e.opinion_patients}</td>
                      <td className="px-4 py-3 text-slate-600">{formatCurrency(e.fees_generated)}</td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">{formatCurrency(e.fees_received)}</td>
                      <td className={`px-4 py-3 font-medium ${pending > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {formatCurrency(pending)}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => openEditEntry(e)}
                            className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteEntry(e.id)}
                            className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"
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

      {/* Attendance Entries */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold text-slate-700">Attendance Entries</h2>
        </div>
        {attendance.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No attendance entries yet. Click "Add Attendance" to record one.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {attendance.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50 group">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(a.attendance_date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{a.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5">
                      {a.status === 'present' && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Present</span>}
                      {a.status === 'leave' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><LogOut className="w-3 h-3" /> Leave</span>}
                      {a.status === 'extra_duty' && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Zap className="w-3 h-3" /> Extra Duty</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{a.leave_type || a.extra_duty_type || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-xs truncate">{a.notes || '—'}</td>
                    <td className="px-3 py-2.5">
                      <button onClick={() => handleDeleteAttendance(a.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Hospital Modal */}
      {showAdd && (
        <Modal title="Add Hospital" onClose={() => setShowAdd(false)}>
          <form onSubmit={handleAddHospital} className="space-y-4">
            <div>
              <label htmlFor="hosp-name" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital Name</label>
              <input
                id="hosp-name"
                name="hospitalName"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="form-input"
                placeholder="e.g. City Medical Center"
                autoFocus
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition">
              Add Hospital
            </button>
          </form>
        </Modal>
      )}

      {/* Add/Edit Daily Entry Modal */}
      {showEntry && (
        <Modal title={editingId ? 'Edit Daily Entry' : 'Add Daily Entry'} onClose={() => { setShowEntry(false); resetEntryForm(); }}>
          <form onSubmit={handleSaveEntry} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="entry-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
                <select
                  id="entry-hospital"
                  name="hospital"
                  required
                  value={eHospital}
                  onChange={(e) => setEHospital(e.target.value)}
                  className="form-input bg-white"
                >
                  <option value="">Select...</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="entry-date" className="block text-sm font-medium text-slate-600 mb-1.5">Date *</label>
                <input
                  id="entry-date"
                  name="entryDate"
                  type="date"
                  required
                  value={eDate}
                  onChange={(e) => setEDate(e.target.value)}
                  className="form-input"
                />
              </div>
              <div>
                <label htmlFor="entry-op" className="block text-sm font-medium text-slate-600 mb-1.5">OP Patients</label>
                <input id="entry-op" name="opPatients" type="number" value={eOp} onChange={(e) => setEOp(e.target.value)} className="form-input" placeholder="0" />
              </div>
              <div>
                <label htmlFor="entry-opinion" className="block text-sm font-medium text-slate-600 mb-1.5">Opinion Entry</label>
                <input id="entry-opinion" name="opinionPatients" type="number" value={eOpinion} onChange={(e) => setEOpinion(e.target.value)} className="form-input" placeholder="0" />
                <p className="text-xs text-slate-400 mt-1">Opinion / consult-only visits. IP admissions are now tracked via structured OP/IP Patient Entry above.</p>
              </div>
              <div>
                <label htmlFor="entry-fees-gen" className="block text-sm font-medium text-slate-600 mb-1.5">Fees Generated (INR)</label>
                <input id="entry-fees-gen" name="feesGenerated" type="number" step="0.01" value={eFeesGen} onChange={(e) => setEFeesGen(e.target.value)} className="form-input" placeholder="0" />
              </div>
              <div>
                <label htmlFor="entry-fees-rec" className="block text-sm font-medium text-slate-600 mb-1.5">Fees Received (INR)</label>
                <input id="entry-fees-rec" name="feesReceived" type="number" step="0.01" value={eFeesRec} onChange={(e) => setEFeesRec(e.target.value)} className="form-input" placeholder="0" />
              </div>
            </div>
            <div>
              <label htmlFor="entry-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
              <input id="entry-notes" name="notes" type="text" value={eNotes} onChange={(e) => setENotes(e.target.value)} className="form-input" placeholder="Optional..." />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
              {editingId ? 'Update Daily Entry' : 'Save Daily Entry'}
            </button>
            {!editingId && (
              <p className="text-xs text-slate-400 text-center">If an entry already exists for this hospital and date, it will be updated.</p>
            )}
          </form>
        </Modal>
      )}

      {/* Attendance Form Modal */}
      {showAttendance && (
        <Modal title="Add Attendance" onClose={() => setShowAttendance(false)}>
          <form onSubmit={handleSaveAttendance} className="space-y-4">
            <div>
              <label htmlFor="att-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
              <select id="att-hospital" name="hospital" required value={attHospital} onChange={(e) => setAttHospital(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white">
                <option value="">Select hospital...</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="att-date" className="block text-sm font-medium text-slate-600 mb-1.5">Date *</label>
              <input id="att-date" name="attendanceDate" type="date" required value={attDate} onChange={(e) => setAttDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" />
            </div>
            <div>
              <span className="block text-sm font-medium text-slate-600 mb-1.5">Status *</span>
              <div className="grid grid-cols-3 gap-2">
                <button type="button" onClick={() => setAttStatus('present')} className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition ${attStatus === 'present' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <CheckCircle2 className={`w-5 h-5 ${attStatus === 'present' ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-700">Present</span>
                </button>
                <button type="button" onClick={() => setAttStatus('leave')} className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition ${attStatus === 'leave' ? 'border-red-500 bg-red-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <LogOut className={`w-5 h-5 ${attStatus === 'leave' ? 'text-red-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-700">Leave</span>
                </button>
                <button type="button" onClick={() => setAttStatus('extra_duty')} className={`flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition ${attStatus === 'extra_duty' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <Zap className={`w-5 h-5 ${attStatus === 'extra_duty' ? 'text-amber-600' : 'text-slate-400'}`} />
                  <span className="text-xs font-medium text-slate-700">Extra Duty</span>
                </button>
              </div>
            </div>
            {attStatus === 'present' && (
              <div>
                <span className="block text-sm font-medium text-slate-600 mb-1.5">Duty Type</span>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAttDutyType('normal')} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${attDutyType === 'normal' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    Normal Duty
                  </button>
                  <button type="button" onClick={() => setAttDutyType('duty')} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${attDutyType === 'duty' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                    Duty
                  </button>
                </div>
              </div>
            )}
            {attStatus === 'leave' && (
              <div>
                <label htmlFor="att-leave-type" className="block text-sm font-medium text-slate-600 mb-1.5">Type of Leave *</label>
                <input id="att-leave-type" name="leaveType" type="text" required value={attLeaveType} onChange={(e) => setAttLeaveType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. Casual, Sick, Earned..." />
              </div>
            )}
            {attStatus === 'leave' && colSummary.availableDates.length > 0 && (
              <div>
                <label htmlFor="att-compensated-date" className="block text-sm font-medium text-slate-600 mb-1.5">Compensates COL credit (optional)</label>
                <select id="att-compensated-date" name="compensatedDate" value={attCompensatedDate} onChange={(e) => setAttCompensatedDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white">
                  <option value="">Not a COL leave</option>
                  {colSummary.availableDates.map((c) => (
                    <option key={c.date} value={c.date}>{formatDate(c.date)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Only showing COL credits earned at the hospital selected above — COL can only be redeemed at the same hospital it was earned.</p>
              </div>
            )}
            {attStatus === 'extra_duty' && (
              <div>
                <label htmlFor="att-extra-type" className="block text-sm font-medium text-slate-600 mb-1.5">Extra Duty Type *</label>
                <div className="flex gap-2 mb-2">
                  {['extra', 'col', 'others'].map((t) => (
                    <button key={t} type="button" onClick={() => setAttExtraType(t)} className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${attExtraType === t ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                      {t === 'col' ? 'COL' : t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                  ))}
                </div>
                <input id="att-extra-type" name="extraDutyType" type="text" value={attExtraType} onChange={(e) => setAttExtraType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="Or type your own..." />
              </div>
            )}
            <div>
              <label htmlFor="att-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
              <input id="att-notes" name="notes" type="text" value={attNotes} onChange={(e) => setAttNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="Optional..." />
            </div>
            {attError && <p className="text-sm text-red-600">{attError}</p>}
            <button type="submit" className="w-full py-2.5 bg-amber-600 text-white rounded-lg font-medium hover:bg-amber-700 transition">Save Attendance</button>
          </form>
        </Modal>
      )}

      {/* Add/Edit Class Modal */}
      {showClassForm && (
        <Modal title={editingClassId ? 'Edit Class' : 'Add Class'} onClose={() => { setShowClassForm(false); resetClassForm(); }}>
          <form onSubmit={handleSaveClass} className="space-y-4">
            <div>
              <label htmlFor="c-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital</label>
              <select id="c-hospital" name="hospital" value={cHospital} onChange={(e) => setCHospital(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none">
                <option value="">Not hospital-specific</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="c-date" className="block text-sm font-medium text-slate-600 mb-1.5">Date</label>
              <input id="c-date" name="classDate" type="date" value={cDate} onChange={(e) => setCDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="c-type" className="block text-sm font-medium text-slate-600 mb-1.5">Type of Class</label>
                <input id="c-type" name="classType" type="text" value={cType} onChange={(e) => setCType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. CME, Lecture, Workshop" />
              </div>
              <div>
                <label htmlFor="c-audience" className="block text-sm font-medium text-slate-600 mb-1.5">Class To Whom</label>
                <input id="c-audience" name="audience" type="text" value={cAudience} onChange={(e) => setCAudience(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. MBBS students" />
              </div>
            </div>
            <div>
              <label htmlFor="c-topic" className="block text-sm font-medium text-slate-600 mb-1.5">Topic</label>
              <input id="c-topic" name="topic" type="text" value={cTopic} onChange={(e) => setCTopic(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" />
            </div>
            <div>
              <label htmlFor="c-ppt" className="block text-sm font-medium text-slate-600 mb-1.5">Class PPT (optional)</label>
              <label htmlFor="c-ppt" className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:text-sky-600 transition">
                <Upload className="w-4 h-4" />
                {cPptFile ? cPptFile.name : editingClassId ? 'Replace uploaded file' : 'Upload PPT / PDF'}
              </label>
              <input id="c-ppt" name="ppt" type="file" accept=".ppt,.pptx,.pdf" className="hidden" onChange={(e) => setCPptFile(e.target.files?.[0] || null)} />
            </div>
            <div>
              <label htmlFor="c-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
              <input id="c-notes" name="notes" type="text" value={cNotes} onChange={(e) => setCNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="Optional..." />
            </div>
            {cError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">{cError}</div>
            )}
            <button type="submit" disabled={cSaving} className="w-full py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition disabled:opacity-60">
              {cSaving ? 'Saving...' : editingClassId ? 'Save Changes' : 'Add Class'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
