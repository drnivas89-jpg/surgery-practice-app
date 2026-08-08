import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Surgery, FollowUp, Payment, SurgeryType, Investigation, ConsentProforma } from '@/lib/types';
import { formatDate, formatCurrency, uploadImage, getImageUrl } from '@/lib/helpers';
import {
  ArrowLeft, Pencil, Activity, Calendar, FlaskConical, IndianRupee, Plus, X,
  Trash2, Settings, TestTube,
} from 'lucide-react';

interface PatientDetailProps {
  patientId: string;
  onBack: () => void;
  onEdit: (p: Patient) => void;
  onNewVisit?: (p: Patient) => void;
}

export default function PatientDetail({ patientId, onBack, onEdit, onNewVisit }: PatientDetailProps) {
  const { user } = useAuth();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [investigations, setInvestigations] = useState<Investigation[]>([]);
  const [loading, setLoading] = useState(true);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [surgeryTypes, setSurgeryTypes] = useState<SurgeryType[]>([]);
  const [showTypeManager, setShowTypeManager] = useState(false);
  const [newTypeName, setNewTypeName] = useState('');

  // Surgery form
  const [showSurgeryForm, setShowSurgeryForm] = useState(false);
  const [editingSurgeryId, setEditingSurgeryId] = useState<string | null>(null);
  const [procName, setProcName] = useState('');
  const [surgeryType, setSurgeryType] = useState('');
  const [surgeryRole, setSurgeryRole] = useState<'done_by_me' | 'assisted_by_me'>('done_by_me');
  const [anaesthesia, setAnaesthesia] = useState('');
  const [procNotes, setProcNotes] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');
  const [surgeryImages, setSurgeryImages] = useState<File[]>([]);
  const [existingSurgeryImages, setExistingSurgeryImages] = useState<string[]>([]);
  const [consentImages, setConsentImages] = useState<File[]>([]);
  const [existingConsentImages, setExistingConsentImages] = useState<string[]>([]);

  // Follow-up form
  const [showFollowUpForm, setShowFollowUpForm] = useState(false);
  const [editingFollowUpId, setEditingFollowUpId] = useState<string | null>(null);
  const [fuType, setFuType] = useState<'fnac' | 'biopsy'>('fnac');
  const [reportNum, setReportNum] = useState('');
  const [lab, setLab] = useState('');
  const [fuYear, setFuYear] = useState('');
  const [findings, setFindings] = useState('');
  const [reportImages, setReportImages] = useState<File[]>([]);
  const [existingReportImages, setExistingReportImages] = useState<string[]>([]);

  // Payment form
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [editingPaymentId, setEditingPaymentId] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');

  // Investigation form
  const [showInvestigationForm, setShowInvestigationForm] = useState(false);
  const [editingInvestigationId, setEditingInvestigationId] = useState<string | null>(null);
  const [invName, setInvName] = useState('');
  const [invDate, setInvDate] = useState('');
  const [invValue, setInvValue] = useState('');
  const [invNotes, setInvNotes] = useState('');

  const load = async () => {
    const [{ data: p }, { data: s }, { data: f }, { data: pay }, { data: st }, { data: inv }] = await Promise.all([
      supabase.from('patients').select('*, hospital:hospitals(*)').eq('id', patientId).maybeSingle(),
      supabase.from('surgeries').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('follow_ups').select('*').eq('patient_id', patientId).order('created_at', { ascending: false }),
      supabase.from('payments').select('*').eq('patient_id', patientId).order('payment_date', { ascending: false }),
      supabase.from('surgery_types').select('*').order('name'),
      supabase.from('investigations').select('*').eq('patient_id', patientId).order('investigation_date', { ascending: false }),
    ]);
    setSurgeryTypes(st || []);
    setPatient(p);
    setSurgeries(s || []);
    setFollowUps(f || []);
    setPayments(pay || []);
    setInvestigations(inv || []);
    setLoading(false);

    const allPaths = [
      ...(s || []).flatMap((s) => [...(s.image_paths || []), ...(s.consent_image_paths || [])]),
      ...(f || []).flatMap((f) => f.report_image_paths || []),
    ];
    const urlMap: Record<string, string> = {};
    for (const path of allPaths) {
      const url = await getImageUrl(path);
      if (url) urlMap[path] = url;
    }
    setImageUrls(urlMap);
  };

  useEffect(() => { load(); }, [patientId]);

  // --- Surgery handlers ---
  const resetSurgeryForm = () => {
    setEditingSurgeryId(null);
    setProcName(''); setSurgeryType(''); setSurgeryRole('done_by_me'); setAnaesthesia(''); setProcNotes('');
    setSurgeryDate(''); setSurgeryImages([]); setExistingSurgeryImages([]);
    setConsentImages([]); setExistingConsentImages([]);
  };

  const openEditSurgery = (s: Surgery) => {
    setEditingSurgeryId(s.id);
    setProcName(s.procedure_name || '');
    setSurgeryType(s.surgery_type || '');
    setSurgeryRole(s.role === 'assisted_by_me' ? 'assisted_by_me' : 'done_by_me');
    setAnaesthesia(s.anaesthesia_type || '');
    setProcNotes(s.procedure_notes || '');
    setSurgeryDate(s.surgery_date ? s.surgery_date.substring(0, 10) : '');
    setExistingSurgeryImages(s.image_paths || []);
    setSurgeryImages([]);
    setExistingConsentImages(s.consent_image_paths || []);
    setConsentImages([]);
    setShowSurgeryForm(true);
  };

  const handleSaveSurgery = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    let imagePaths = [...existingSurgeryImages];
    for (const file of surgeryImages) {
      const path = await uploadImage(file, user.id, 'surgery');
      if (path) imagePaths.push(path);
    }
    let consentPaths = [...existingConsentImages];
    for (const file of consentImages) {
      const path = await uploadImage(file, user.id, 'consent');
      if (path) consentPaths.push(path);
    }
    const payload = {
      procedure_name: procName, surgery_type: surgeryType, role: surgeryRole,
      anaesthesia_type: anaesthesia, procedure_notes: procNotes,
      surgery_date: surgeryDate || null, image_paths: imagePaths,
      consent_image_paths: consentPaths,
    };
    if (editingSurgeryId) {
      await supabase.from('surgeries').update(payload).eq('id', editingSurgeryId);
    } else {
      await supabase.from('surgeries').insert({ ...payload, patient_id: patientId });
    }
    setShowSurgeryForm(false);
    resetSurgeryForm();
    load();
  };

  const handleDeleteSurgery = async (id: string) => {
    if (!confirm('Delete this surgery record?')) return;
    await supabase.from('surgeries').delete().eq('id', id);
    load();
  };

  // --- Follow-up handlers ---
  const resetFollowUpForm = () => {
    setEditingFollowUpId(null);
    setFuType('fnac'); setReportNum(''); setLab(''); setFuYear('');
    setFindings(''); setReportImages([]); setExistingReportImages([]);
  };

  const openEditFollowUp = (f: FollowUp) => {
    setEditingFollowUpId(f.id);
    setFuType(f.type || 'fnac');
    setReportNum(f.report_number || '');
    setLab(f.lab || '');
    setFuYear(f.year?.toString() || '');
    setFindings(f.findings || '');
    setExistingReportImages(f.report_image_paths || []);
    setReportImages([]);
    setShowFollowUpForm(true);
  };

  const handleSaveFollowUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    let imagePaths = [...existingReportImages];
    for (const file of reportImages) {
      const path = await uploadImage(file, user.id, 'followup');
      if (path) imagePaths.push(path);
    }
    const payload = {
      type: fuType, report_number: reportNum, lab,
      year: fuYear ? parseInt(fuYear) : null, findings,
      report_image_paths: imagePaths,
    };
    if (editingFollowUpId) {
      await supabase.from('follow_ups').update(payload).eq('id', editingFollowUpId);
    } else {
      await supabase.from('follow_ups').insert({ ...payload, patient_id: patientId });
    }
    setShowFollowUpForm(false);
    resetFollowUpForm();
    load();
  };

  const handleDeleteFollowUp = async (id: string) => {
    if (!confirm('Delete this follow-up record?')) return;
    await supabase.from('follow_ups').delete().eq('id', id);
    load();
  };

  // --- Payment handlers ---
  const resetPaymentForm = () => {
    setEditingPaymentId(null);
    setPayAmount(''); setPayDate(new Date().toISOString().split('T')[0]); setPayNotes('');
  };

  const openEditPayment = (p: Payment) => {
    setEditingPaymentId(p.id);
    setPayAmount(p.amount.toString());
    setPayDate(p.payment_date ? p.payment_date.substring(0, 10) : '');
    setPayNotes(p.notes || '');
    setShowPaymentForm(true);
  };

  const handleSavePayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!patient) return;
    const payload = {
      amount: parseFloat(payAmount), payment_date: payDate, notes: payNotes,
    };
    if (editingPaymentId) {
      await supabase.from('payments').update(payload).eq('id', editingPaymentId);
    } else {
      await supabase.from('payments').insert({ ...payload, patient_id: patientId, hospital_id: patient.hospital_id });
    }
    setShowPaymentForm(false);
    resetPaymentForm();
    load();
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Delete this payment record?')) return;
    await supabase.from('payments').delete().eq('id', id);
    load();
  };

  // --- Investigation handlers ---
  const resetInvestigationForm = () => {
    setEditingInvestigationId(null);
    setInvName(''); setInvDate(''); setInvValue(''); setInvNotes('');
  };

  const openEditInvestigation = (inv: Investigation) => {
    setEditingInvestigationId(inv.id);
    setInvName(inv.investigation_name);
    setInvDate(inv.investigation_date ? inv.investigation_date.substring(0, 10) : '');
    setInvValue(inv.value);
    setInvNotes(inv.notes || '');
    setShowInvestigationForm(true);
  };

  const handleSaveInvestigation = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = {
      investigation_name: invName,
      investigation_date: invDate || null,
      value: invValue,
      notes: invNotes,
    };
    if (editingInvestigationId) {
      await supabase.from('investigations').update(payload).eq('id', editingInvestigationId);
    } else {
      await supabase.from('investigations').insert({ ...payload, patient_id: patientId });
    }
    setShowInvestigationForm(false);
    resetInvestigationForm();
    load();
  };

  const handleDeleteInvestigation = async (id: string) => {
    if (!confirm('Delete this investigation record?')) return;
    await supabase.from('investigations').delete().eq('id', id);
    load();
  };

  // --- Surgery type handlers ---
  const handleAddSurgeryType = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTypeName.trim()) return;
    await supabase.from('surgery_types').insert({ name: newTypeName.trim() });
    setNewTypeName('');
    const { data } = await supabase.from('surgery_types').select('*').order('name');
    setSurgeryTypes(data || []);
  };

  const handleDeleteSurgeryType = async (id: string) => {
    await supabase.from('surgery_types').delete().eq('id', id);
    const { data } = await supabase.from('surgery_types').select('*').order('name');
    setSurgeryTypes(data || []);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  if (!patient) return <p className="text-slate-500">Patient not found.</p>;

  const totalReceived = payments.reduce((s, p) => s + p.amount, 0);
  const pending = (patient.fees || 0) - totalReceived;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-2 rounded-lg hover:bg-slate-100 transition">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-800">{patient.patient_name}</h1>
              <span className="text-xs font-mono bg-sky-50 text-sky-600 px-2 py-0.5 rounded">{patient.unique_id}</span>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">{patient.hospital?.name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onNewVisit && (
            <button onClick={() => onNewVisit(patient)} className="flex items-center gap-2 px-4 py-2 bg-sky-50 text-sky-600 rounded-lg text-sm font-medium hover:bg-sky-100 transition">
              <Plus className="w-4 h-4" /> Add Follow-up Visit
            </button>
          )}
          <button onClick={() => onEdit(patient)} className="flex items-center gap-2 px-4 py-2 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-100 transition">
            <Pencil className="w-4 h-4" /> Edit
          </button>
        </div>
      </div>

      {/* Patient Info */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          {patient.patient_type === 'op' ? (
            <span className="text-xs font-semibold bg-sky-100 text-sky-700 px-2.5 py-1 rounded-full">OP</span>
          ) : patient.patient_type === 'ip' ? (
            <span className="text-xs font-semibold bg-violet-100 text-violet-700 px-2.5 py-1 rounded-full">IP</span>
          ) : null}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div><p className="text-xs text-slate-400 uppercase">Age / Sex</p><p className="text-sm font-medium text-slate-700 mt-1">{patient.age ? `${patient.age}y` : '—'} {patient.sex ? `/ ${patient.sex}` : ''}</p></div>
          {patient.patient_type === 'ip' && (
            <div><p className="text-xs text-slate-400 uppercase">Admission</p><p className="text-sm font-medium text-slate-700 mt-1">{formatDate(patient.admission_date)}</p></div>
          )}
          {patient.patient_type === 'ip' && (
            <div><p className="text-xs text-slate-400 uppercase">Surgery Date</p><p className="text-sm font-medium text-slate-700 mt-1">{formatDate(patient.surgery_date)}</p></div>
          )}
          {patient.patient_type === 'ip' && (
            <div><p className="text-xs text-slate-400 uppercase">Discharge</p><p className="text-sm font-medium text-slate-700 mt-1">{formatDate(patient.discharge_date)}</p></div>
          )}
          <div><p className="text-xs text-slate-400 uppercase">Follow-up</p><p className="text-sm font-medium text-slate-700 mt-1">{formatDate(patient.follow_up_date)}</p></div>
          {patient.mobile_number && (
            <div><p className="text-xs text-slate-400 uppercase">Mobile</p><p className="text-sm font-medium text-slate-700 mt-1">{patient.mobile_number}</p></div>
          )}
        </div>
        {patient.diagnosis && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 uppercase mb-1">Diagnosis</p>
            <p className="text-sm text-slate-600">{patient.diagnosis}</p>
          </div>
        )}
        {patient.prescription && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 uppercase mb-1">Prescription</p>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{patient.prescription}</p>
          </div>
        )}
        {patient.minor_procedure_done && (
          <div className="mt-4 pt-4 border-t border-slate-100">
            <p className="text-xs text-slate-400 uppercase mb-1">Minor Procedure</p>
            <p className="text-sm text-sky-600 font-medium">A minor procedure was performed — see surgery details below.</p>
          </div>
        )}
        <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-3 gap-4">
          <div><p className="text-xs text-slate-400 uppercase">Total Fees</p><p className="text-lg font-bold text-slate-700">{formatCurrency(patient.fees || 0)}</p></div>
          <div><p className="text-xs text-slate-400 uppercase">Received</p><p className="text-lg font-bold text-emerald-600">{formatCurrency(totalReceived)}</p></div>
          <div><p className="text-xs text-slate-400 uppercase">Pending</p><p className={`text-lg font-bold ${pending > 0 ? 'text-red-600' : 'text-slate-500'}`}>{formatCurrency(pending)}</p></div>
        </div>
      </div>

      {/* Investigations */}
      <SectionCard icon={TestTube} iconColor="text-teal-500" title="Investigations" onAdd={() => { resetInvestigationForm(); setShowInvestigationForm(true); }} addLabel="Add Investigation">
        {investigations.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No investigations recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {investigations.map((inv) => (
              <div key={inv.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3 group">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700">{inv.investigation_name}</span>
                    {inv.investigation_date && <span className="text-xs text-slate-400">{formatDate(inv.investigation_date)}</span>}
                  </div>
                  {inv.value && <p className="text-sm text-teal-600 font-medium mt-0.5">Value: {inv.value}</p>}
                  {inv.notes && <p className="text-xs text-slate-500 mt-0.5">{inv.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditInvestigation(inv)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDeleteInvestigation(inv.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Surgery Details */}
      <SectionCard icon={Activity} iconColor="text-sky-500" title="Surgery Details"
        onAdd={() => { resetSurgeryForm(); setShowSurgeryForm(true); }} addLabel="Add Surgery"
        extraButton={<button onClick={() => setShowTypeManager(true)} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 font-medium"><Settings className="w-4 h-4" /> Manage Types</button>}>
        {surgeries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No surgery records yet.</p>
        ) : (
          <div className="space-y-3">
            {surgeries.map((s) => (
              <div key={s.id} className="border border-slate-100 rounded-lg p-4 group">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-slate-700">{s.procedure_name || 'Untitled procedure'}</span>
                  {s.surgery_type && <span className="text-xs font-medium bg-sky-50 text-sky-600 px-2 py-0.5 rounded">{s.surgery_type}</span>}
                  <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.role === 'assisted_by_me' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{s.role === 'assisted_by_me' ? 'Assisted' : 'Done by me'}</span>
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => openEditSurgery(s)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition p-1"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteSurgery(s.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div><span className="text-slate-400">Type:</span> {s.surgery_type || '—'}</div>
                  <div><span className="text-slate-400">Role:</span> {s.role === 'assisted_by_me' ? 'Assisted by me' : 'Done by me'}</div>
                  <div><span className="text-slate-400">Anaesthesia:</span> {s.anaesthesia_type || '—'}</div>
                  <div><span className="text-slate-400">Date:</span> {formatDate(s.surgery_date)}</div>
                </div>
                {s.procedure_notes && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{s.procedure_notes}</p>}
                {s.image_paths && s.image_paths.length > 0 && (
                  <div className="mt-3">
                    <p className="text-xs text-slate-400 mb-1.5">Surgery Images</p>
                    <div className="flex gap-2 flex-wrap">
                      {s.image_paths.map((path, i) => imageUrls[path] ? (
                        <a key={i} href={imageUrls[path]} target="_blank" rel="noopener noreferrer">
                          <img src={imageUrls[path]} alt={`Surgery ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition" />
                        </a>
                      ) : null)}
                    </div>
                  </div>
                )}
                {s.consent_image_paths && s.consent_image_paths.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs text-slate-400 mb-1.5">Patient Consent Page</p>
                    <div className="flex gap-2 flex-wrap">
                      {s.consent_image_paths.map((path, i) => imageUrls[path] ? (
                        <a key={i} href={imageUrls[path]} target="_blank" rel="noopener noreferrer">
                          <img src={imageUrls[path]} alt={`Consent ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-emerald-200 hover:opacity-80 transition" />
                        </a>
                      ) : null)}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Follow-ups */}
      <SectionCard icon={FlaskConical} iconColor="text-violet-500" title="Follow-up / Pathology" onAdd={() => { resetFollowUpForm(); setShowFollowUpForm(true); }} addLabel="Add Follow-up">
        {followUps.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No follow-up records yet.</p>
        ) : (
          <div className="space-y-3">
            {followUps.map((f) => (
              <div key={f.id} className="border border-slate-100 rounded-lg p-4 group">
                <div className="flex items-center gap-2 mb-2">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded uppercase ${f.type === 'fnac' ? 'bg-violet-100 text-violet-700' : 'bg-teal-100 text-teal-700'}`}>{f.type || 'N/A'}</span>
                  {f.report_number && <span className="text-sm font-medium text-slate-700">{f.report_number}</span>}
                  <div className="ml-auto flex items-center gap-1">
                    <button onClick={() => openEditFollowUp(f)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition p-1"><Pencil className="w-3.5 h-3.5" /></button>
                    <button onClick={() => handleDeleteFollowUp(f.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs text-slate-500">
                  <div><span className="text-slate-400">Lab:</span> {f.lab || '—'}</div>
                  <div><span className="text-slate-400">Year:</span> {f.year || '—'}</div>
                </div>
                {f.findings && <p className="text-sm text-slate-600 mt-2 whitespace-pre-wrap">{f.findings}</p>}
                {f.report_image_paths && f.report_image_paths.length > 0 && (
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {f.report_image_paths.map((path, i) => imageUrls[path] ? (
                      <a key={i} href={imageUrls[path]} target="_blank" rel="noopener noreferrer">
                        <img src={imageUrls[path]} alt={`Report ${i + 1}`} className="w-20 h-20 object-cover rounded-lg border border-slate-200 hover:opacity-80 transition" />
                      </a>
                    ) : null)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Payments */}
      <SectionCard icon={IndianRupee} iconColor="text-emerald-500" title="Payment History" onAdd={() => { resetPaymentForm(); setShowPaymentForm(true); }} addLabel="Add Payment">
        {payments.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No payments recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {payments.map((p) => (
              <div key={p.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-3 group">
                <div>
                  <span className="text-sm font-medium text-emerald-600">{formatCurrency(p.amount)}</span>
                  <span className="text-xs text-slate-400 ml-2">{formatDate(p.payment_date)}</span>
                  {p.notes && <p className="text-xs text-slate-500 mt-1">{p.notes}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => openEditPayment(p)} className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDeletePayment(p.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      {/* Surgery Form Modal */}
      {showSurgeryForm && (
        <Modal title={editingSurgeryId ? 'Edit Surgery Details' : 'Add Surgery Details'} onClose={() => { setShowSurgeryForm(false); resetSurgeryForm(); }}>
          <form onSubmit={handleSaveSurgery} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Procedure Name</label>
              <input type="text" required value={procName} onChange={(e) => setProcName(e.target.value)} className="form-input" placeholder="e.g. Laparoscopic Cholecystectomy" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Surgery Type</label>
                <select value={surgeryType} onChange={(e) => setSurgeryType(e.target.value)} className="form-input bg-white">
                  <option value="">Select type...</option>
                  {surgeryTypes.map((t) => <option key={t.id} value={t.name}>{t.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Role</label>
                <div className="flex gap-2">
                  {([['done_by_me','Done by me'],['assisted_by_me','Assisted by me']] as const).map(([val,label]) => (
                    <button key={val} type="button" onClick={() => setSurgeryRole(val)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${surgeryRole === val ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{label}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Type of Anaesthesia</label>
              <input type="text" value={anaesthesia} onChange={(e) => setAnaesthesia(e.target.value)} className="form-input" placeholder="e.g. General, Spinal..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Date of Surgery</label>
              <input type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Procedure Notes</label>
              <textarea value={procNotes} onChange={(e) => setProcNotes(e.target.value)} rows={4} className="form-input resize-none" />
            </div>
            {editingSurgeryId && existingSurgeryImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Existing Surgery Images</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {existingSurgeryImages.map((path, i) => imageUrls[path] ? (
                    <img key={i} src={imageUrls[path]} alt={`Existing ${i}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  ) : null)}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">{editingSurgeryId ? 'Add More Surgery Images' : 'Surgery Images'}</label>
              <input type="file" multiple accept="image/*" onChange={(e) => setSurgeryImages(Array.from(e.target.files || []))} className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-sky-50 file:text-sky-600 hover:file:bg-sky-100" />
            </div>
            {editingSurgeryId && existingConsentImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Existing Consent Page Images</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {existingConsentImages.map((path, i) => imageUrls[path] ? (
                    <img key={i} src={imageUrls[path]} alt={`Existing consent ${i}`} className="w-16 h-16 object-cover rounded-lg border border-emerald-200" />
                  ) : null)}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">{editingSurgeryId ? 'Add More Consent Page Images' : 'Patient Consent Page'}</label>
              <input type="file" multiple accept="image/*" onChange={(e) => setConsentImages(Array.from(e.target.files || []))} className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-emerald-50 file:text-emerald-600 hover:file:bg-emerald-100" />
              <p className="text-xs text-slate-400 mt-1">Upload the signed patient consent page for this surgery.</p>
            </div>
            <button type="submit" className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition">
              {editingSurgeryId ? 'Update Surgery Details' : 'Save Surgery Details'}
            </button>
          </form>
        </Modal>
      )}

      {/* Surgery Type Manager */}
      {showTypeManager && (
        <Modal title="Manage Surgery Types" onClose={() => setShowTypeManager(false)}>
          <div className="space-y-4">
            <form onSubmit={handleAddSurgeryType} className="flex gap-2">
              <input type="text" value={newTypeName} onChange={(e) => setNewTypeName(e.target.value)} className="form-input flex-1" placeholder="e.g. Major, Minor, Bedside, Endoscopy..." />
              <button type="submit" className="px-4 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition">Add</button>
            </form>
            <div className="space-y-2">
              {surgeryTypes.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">No custom types yet. Add your first one above.</p>
              ) : surgeryTypes.map((t) => (
                <div key={t.id} className="flex items-center justify-between border border-slate-100 rounded-lg p-2.5 group">
                  <span className="text-sm font-medium text-slate-700">{t.name}</span>
                  <button onClick={() => handleDeleteSurgeryType(t.id)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-400">These types appear in the surgery type dropdown.</p>
          </div>
        </Modal>
      )}

      {/* Follow-up Form Modal */}
      {showFollowUpForm && (
        <Modal title={editingFollowUpId ? 'Edit Follow-up / Pathology' : 'Add Follow-up / Pathology'} onClose={() => { setShowFollowUpForm(false); resetFollowUpForm(); }}>
          <form onSubmit={handleSaveFollowUp} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Type</label>
              <div className="flex gap-2">
                {(['fnac', 'biopsy'] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setFuType(t)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${fuType === t ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-500'}`}>{t.toUpperCase()}</button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">{fuType === 'fnac' ? 'FNAC Number' : 'HPE Number'}</label>
                <input type="text" value={reportNum} onChange={(e) => setReportNum(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Lab</label>
                <input type="text" value={lab} onChange={(e) => setLab(e.target.value)} className="form-input" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Year</label>
              <input type="number" value={fuYear} onChange={(e) => setFuYear(e.target.value)} className="form-input" placeholder="e.g. 2025" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Findings</label>
              <textarea value={findings} onChange={(e) => setFindings(e.target.value)} rows={4} className="form-input resize-none" />
            </div>
            {editingFollowUpId && existingReportImages.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Existing Report Images</label>
                <div className="flex gap-2 flex-wrap mb-2">
                  {existingReportImages.map((path, i) => imageUrls[path] ? (
                    <img key={i} src={imageUrls[path]} alt={`Existing ${i}`} className="w-16 h-16 object-cover rounded-lg border border-slate-200" />
                  ) : null)}
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">{editingFollowUpId ? 'Add More Report Images' : 'Report Images'}</label>
              <input type="file" multiple accept="image/*" onChange={(e) => setReportImages(Array.from(e.target.files || []))} className="w-full text-sm text-slate-500 file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-violet-50 file:text-violet-600 hover:file:bg-violet-100" />
            </div>
            <button type="submit" className="w-full py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition">
              {editingFollowUpId ? 'Update Follow-up' : 'Save Follow-up'}
            </button>
          </form>
        </Modal>
      )}

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <Modal title={editingPaymentId ? 'Edit Payment' : 'Add Payment Received'} onClose={() => { setShowPaymentForm(false); resetPaymentForm(); }}>
          <form onSubmit={handleSavePayment} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Amount Received (INR) *</label>
              <input type="number" step="0.01" required value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Payment Date *</label>
              <input type="date" required value={payDate} onChange={(e) => setPayDate(e.target.value)} className="form-input" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
              <input type="text" value={payNotes} onChange={(e) => setPayNotes(e.target.value)} className="form-input" placeholder="Optional notes..." />
            </div>
            <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
              {editingPaymentId ? 'Update Payment' : 'Save Payment'}
            </button>
          </form>
        </Modal>
      )}

      {/* Investigation Form Modal */}
      {showInvestigationForm && (
        <Modal title={editingInvestigationId ? 'Edit Investigation' : 'Add Investigation'} onClose={() => { setShowInvestigationForm(false); resetInvestigationForm(); }}>
          <form onSubmit={handleSaveInvestigation} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Investigation Name *</label>
              <input type="text" required value={invName} onChange={(e) => setInvName(e.target.value)} className="form-input" placeholder="e.g. Hemoglobin, Blood Sugar, Creatinine, Ultrasound..." />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Date</label>
                <input type="date" value={invDate} onChange={(e) => setInvDate(e.target.value)} className="form-input" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Value / Result</label>
                <input type="text" value={invValue} onChange={(e) => setInvValue(e.target.value)} className="form-input" placeholder="e.g. 14.2 g/dL, Positive, 120 mg/dL..." />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
              <input type="text" value={invNotes} onChange={(e) => setInvNotes(e.target.value)} className="form-input" placeholder="Optional notes..." />
            </div>
            <button type="submit" className="w-full py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 transition">
              {editingInvestigationId ? 'Update Investigation' : 'Save Investigation'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}

function SectionCard({ icon: Icon, iconColor, title, onAdd, addLabel, extraButton, children }: {
  icon: typeof Activity; iconColor: string; title: string;
  onAdd: () => void; addLabel: string; extraButton?: React.ReactNode; children: React.ReactNode;
}) {
  const btnColor = iconColor.includes('sky') ? 'text-sky-600 hover:text-sky-700'
    : iconColor.includes('violet') ? 'text-violet-600 hover:text-violet-700'
    : iconColor.includes('emerald') ? 'text-emerald-600 hover:text-emerald-700'
    : iconColor.includes('teal') ? 'text-teal-600 hover:text-teal-700'
    : 'text-slate-600 hover:text-slate-700';
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          <h2 className="font-semibold text-slate-700">{title}</h2>
        </div>
        <div className="flex items-center gap-3">
          {extraButton}
          <button onClick={onAdd} className={`flex items-center gap-1.5 text-sm font-medium ${btnColor}`}>
            <Plus className="w-4 h-4" /> {addLabel}
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
