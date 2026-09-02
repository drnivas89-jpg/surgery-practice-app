import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Hospital, MonthlyEntry, Attendance, Patient, ClassEntry, Payment, Surgery } from '@/lib/types';
import { formatDate, uploadImage, ensurePresentAttendance, todayLocalDateStr, monthRangeLocal } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { buildHospitalSummaries, LEAVE_BREAKDOWN_KEYS } from '@/lib/hospitalSummary';
import { AttendanceChoiceState, defaultAttendanceChoiceState, validateAttendanceChoice, buildAttendanceFields } from '@/lib/attendance';
import {
  Building2, Plus, Trash2, X, Calendar, Pencil, Clock, Search,
  UserRound, Stethoscope, ArrowRight, GraduationCap, Upload, ArrowLeft, ChevronLeft, ChevronRight, Award,
} from 'lucide-react';
import PatientForm from './PatientForm';
import PatientRegistrationWizard from './PatientRegistrationWizard';
import HospitalDailyTable from './HospitalDailyTable';
import EditDayModal from './EditDayModal';
import AttendanceStatusPicker from './AttendanceStatusPicker';
import PresentDutyPrompt from './PresentDutyPrompt';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export default function Hospitals() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [entries, setEntries] = useState<MonthlyEntry[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [showEntry, setShowEntry] = useState(false);
  const [showAttendance, setShowAttendance] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  // Layer 1 (hospital metric cards) / Layer 2 (date-wise drill-down)
  const [level, setLevel] = useState<'cards' | 'detail'>('cards');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);
  const [editDayModal, setEditDayModal] = useState<{ hospitalId: string; hospitalName: string; date: string } | null>(null);
  const [newAttendance, setNewAttendance] = useState<{ id: string; hospitalId: string } | null>(null);
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());

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
  const [attState, setAttState] = useState<AttendanceChoiceState>(defaultAttendanceChoiceState());
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
    const [{ data: h }, { data: me }, { data: att }, { data: pts }, { data: cls }, { data: pay }, { data: sur }] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('entry_date', { ascending: false }),
      supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('classes').select('*, hospital:hospitals(*)').order('class_date', { ascending: false }),
      supabase.from('payments').select('*, patient:patients(*)'),
      supabase.from('surgeries').select('*'),
    ]);
    setHospitals(h || []);
    setEntries(me || []);
    setAttendance(att || []);
    setPatients(pts || []);
    setClasses(cls || []);
    setPayments(pay || []);
    setSurgeries(sur || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetEntryForm = () => {
    setEditingId(null);
    setEHospital(''); setEDate(new Date().toISOString().split('T')[0]);
    setEOp(''); setEOpinion(''); setEFeesGen(''); setEFeesRec(''); setENotes('');
    setError(null);
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
    if (user) {
      const { created, id } = await ensurePresentAttendance(user.id, eHospital, eDate);
      if (created && id) setNewAttendance({ id, hospitalId: eHospital });
    }
    setShowEntry(false);
    resetEntryForm();
    load();
  };


  const resetAttendanceForm = () => {
    setAttHospital(''); setAttDate(new Date().toISOString().split('T')[0]);
    setAttState(defaultAttendanceChoiceState()); setAttNotes('');
    setAttError(null);
  };

  const handleSaveAttendance = async (e: React.FormEvent) => {
    e.preventDefault();
    setAttError(null);
    if (!attHospital) { setAttError('Please select a hospital.'); return; }
    const validationError = validateAttendanceChoice(attState);
    if (validationError) { setAttError(validationError); return; }
    if (!user) { setAttError('You must be signed in to add attendance.'); return; }

    // Only one attendance record per hospital+date is allowed — if one
    // already exists (e.g. auto-marked Present from logging a patient
    // visit earlier that day), confirm before this save overwrites it.
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('hospital_id', attHospital)
      .eq('attendance_date', attDate)
      .maybeSingle();
    if (existing && !confirm('A record already exists for this hospital on this date. Replace it with this entry?')) return;

    const payload = {
      user_id: user.id,
      hospital_id: attHospital,
      attendance_date: attDate,
      ...buildAttendanceFields(attState),
      notes: attNotes,
    };
    const { error } = await supabase.from('attendance').upsert(payload, { onConflict: 'user_id,hospital_id,attendance_date' });
    if (error) {
      setAttError(error.code === '23505'
        ? 'That COL credit date is already redeemed by another leave entry.'
        : error.message);
      return;
    }
    setShowAttendance(false);
    resetAttendanceForm();
    load();
  };


  const handleDeleteDay = async (hospitalId: string, date: string) => {
    if (!confirm(`Delete all daily-entry and attendance records for ${formatDate(date)}? This cannot be undone.`)) return;
    await Promise.all([
      supabase.from('monthly_entries').delete().eq('hospital_id', hospitalId).eq('entry_date', date),
      supabase.from('attendance').delete().eq('hospital_id', hospitalId).eq('attendance_date', date),
    ]);
    load();
  };

  const openHospitalDetail = (hospitalId: string) => { setSelectedHospitalId(hospitalId); setLevel('detail'); };

  const goToPrevMonth = () => {
    if (selectedMonth === 0) { setSelectedMonth(11); setSelectedYear(selectedYear - 1); } else { setSelectedMonth(selectedMonth - 1); }
  };
  const goToNextMonth = () => {
    if (selectedMonth === 11) { setSelectedMonth(0); setSelectedYear(selectedYear + 1); } else { setSelectedMonth(selectedMonth + 1); }
  };
  const isCurrentMonth = selectedYear === now.getFullYear() && selectedMonth === now.getMonth();
  const goToCurrentMonth = () => { setSelectedMonth(now.getMonth()); setSelectedYear(now.getFullYear()); };

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

  const { start: monthStart, end: monthEnd } = monthRangeLocal(selectedYear, selectedMonth);
  const todayStr = todayLocalDateStr(now);

  const hospitalSummary = buildHospitalSummaries({
    hospitals, patients, payments, surgeries, monthlyEntries: entries, attendance,
    rangeStart: monthStart, rangeEnd: monthEnd, todayStr,
  });
  const selectedHospitalSummary = hospitalSummary.find((hs) => hs.hospital.id === selectedHospitalId) || null;

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

      {/* Layer 1 / Layer 2: Hospital-wise attendance & activity */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {level === 'detail' && (
            <button onClick={() => { setLevel('cards'); setSelectedHospitalId(null); }} className="p-2 rounded-lg hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div>
            <h2 className="font-semibold text-slate-800">
              {level === 'cards' ? 'Hospital-wise Attendance' : selectedHospitalSummary?.hospital.name || 'Hospital'}
            </h2>
            <p className="text-slate-400 text-xs mt-0.5">
              {level === 'cards' ? 'Days present, duties, leaves and COL — click a hospital for the date-wise log' : `Date-wise log — ${MONTHS[selectedMonth]} ${selectedYear}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
          <button onClick={goToPrevMonth} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
          <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer">
            {[selectedYear - 1, selectedYear, selectedYear + 1].filter((y) => y <= now.getFullYear() + 1).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={goToNextMonth} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
          {!isCurrentMonth && (
            <button onClick={goToCurrentMonth} className="ml-1 text-xs font-medium text-sky-600 hover:text-sky-700 px-2 py-1 rounded-lg hover:bg-sky-50 transition">Today</button>
          )}
        </div>
      </div>

      {level === 'cards' && (
        loading ? (
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
            {hospitalSummary.map((hs) => (
              <div key={hs.hospital.id} className="bg-white rounded-xl border border-slate-200 p-5 group hover:border-sky-300 hover:shadow-sm transition">
                <div className="flex items-start justify-between mb-3">
                  <button onClick={() => openHospitalDetail(hs.hospital.id)} className="flex items-center gap-2 text-left">
                    <div className="w-9 h-9 bg-emerald-50 rounded-lg flex items-center justify-center flex-shrink-0">
                      <Building2 className="w-4.5 h-4.5 text-emerald-600" />
                    </div>
                    <h3 className="font-semibold text-slate-800">{hs.hospital.name}</h3>
                  </button>
                  <button
                    onClick={() => handleDeleteHospital(hs.hospital.id)}
                    className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition flex-shrink-0"
                    title="Delete hospital"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <button onClick={() => openHospitalDetail(hs.hospital.id)} className="w-full text-left space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <p className="text-lg font-bold text-emerald-700">{hs.present}</p>
                      <p className="text-[10px] text-slate-400 uppercase">Days Present</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <p className="text-lg font-bold text-sky-700">{hs.dutyCount}</p>
                      <p className="text-[10px] text-slate-400 uppercase">24-Hour Duties</p>
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-medium text-slate-400 uppercase mb-1.5">
                      Total Leaves ({LEAVE_BREAKDOWN_KEYS.reduce((s, k) => s + hs.leaveBreakdown[k.key], 0)})
                    </p>
                    <div className="grid grid-cols-6 gap-1 text-center">
                      {LEAVE_BREAKDOWN_KEYS.map((k) => (
                        <div key={k.key}>
                          <p className={`text-sm font-bold ${k.key === 'col' ? 'text-amber-700' : k.key === 'other' ? 'text-slate-600' : 'text-red-700'}`}>{hs.leaveBreakdown[k.key]}</p>
                          <p className="text-[9px] text-slate-400">{k.label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-amber-700">
                      <Award className="w-3.5 h-3.5" /> COL: {hs.colAccrued} accrued / {hs.colAvailable} available
                    </span>
                    {hs.missingEntryDates.length > 0 && (
                      <span className="text-xs text-red-600 font-medium">{hs.missingEntryDates.length} missing</span>
                    )}
                  </div>
                </button>
              </div>
            ))}
          </div>
        )
      )}

      {level === 'detail' && selectedHospitalSummary && (
        <div className="space-y-4">
          {selectedHospitalSummary.colAvailable > 0 && (
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full inline-flex items-center gap-1">
              <Award className="w-3.5 h-3.5" /> {selectedHospitalSummary.colAvailable} COL credit{selectedHospitalSummary.colAvailable !== 1 ? 's' : ''} available
            </span>
          )}
          <HospitalDailyTable
            rows={selectedHospitalSummary.days}
            onEditDate={(date) => setEditDayModal({ hospitalId: selectedHospitalSummary.hospital.id, hospitalName: selectedHospitalSummary.hospital.name, date })}
            onDeleteDate={(date) => handleDeleteDay(selectedHospitalSummary.hospital.id, date)}
          />
        </div>
      )}

      {newAttendance && (
        <PresentDutyPrompt
          attendanceId={newAttendance.id}
          hospitalId={newAttendance.hospitalId}
          hospitalName={hospitals.find((h) => h.id === newAttendance.hospitalId)?.name}
          onClose={() => { setNewAttendance(null); load(); }}
        />
      )}

      {editDayModal && (
        <EditDayModal
          hospitalId={editDayModal.hospitalId}
          hospitalName={editDayModal.hospitalName}
          date={editDayModal.date}
          existingEntry={entries.find((me) => me.hospital_id === editDayModal.hospitalId && (me.entry_date || me.month).substring(0, 10) === editDayModal.date) || null}
          existingAttendance={attendance.find((a) => a.hospital_id === editDayModal.hospitalId && a.attendance_date === editDayModal.date) || null}
          attendance={attendance}
          userId={user!.id}
          onClose={() => setEditDayModal(null)}
          onSaved={() => { setEditDayModal(null); load(); }}
        />
      )}

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
            <AttendanceStatusPicker value={attState} onChange={setAttState} colAvailableDates={colSummary.availableDates} size="full" />
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
