import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Patient, Hospital } from '@/lib/types';
import { generateUniquePatientId, upsertDailyEntryCount, ensurePresentAttendance } from '@/lib/helpers';
import PrescriptionTable, { DEFAULT_PRESCRIPTION } from './PrescriptionTable';
import PresentDutyPrompt from './PresentDutyPrompt';
import { ArrowLeft, Save, AlertCircle, Stethoscope, FlaskConical, UserRound, MessageCircleQuestion, ClipboardCheck, Calendar, Phone } from 'lucide-react';

interface PatientFormProps {
  hospitals: Hospital[];
  editPatient: Patient | null;
  onDone: () => void;
  onCancel: () => void;
  defaultHospitalId?: string;
  defaultPatientType?: 'op' | 'ip' | 'opinion';
}

export default function PatientForm({ hospitals, editPatient, onDone, onCancel, defaultHospitalId, defaultPatientType }: PatientFormProps) {
  const { user } = useAuth();

  const [hospitalId, setHospitalId] = useState(editPatient?.hospital_id || defaultHospitalId || '');
  const [name, setName] = useState(editPatient?.patient_name || '');
  const [age, setAge] = useState(editPatient?.age?.toString() || '');
  const [sex, setSex] = useState(editPatient?.sex || '');
  const [mobileNumber, setMobileNumber] = useState(editPatient?.mobile_number || '');
  const [fees, setFees] = useState(editPatient?.fees?.toString() || '');

  const [patientType, setPatientType] = useState<'op' | 'ip' | 'opinion' | null>(editPatient?.patient_type || defaultPatientType || null);

  const [admissionDate, setAdmissionDate] = useState(editPatient?.admission_date || '');
  const [dischargeDate, setDischargeDate] = useState(editPatient?.discharge_date || '');
  const [surgeryDate, setSurgeryDate] = useState(editPatient?.surgery_date || '');
  const [dischargeAdvice, setDischargeAdvice] = useState(editPatient?.discharge_advice || '');
  const [prescriptionItems, setPrescriptionItems] = useState(editPatient?.prescription_items || DEFAULT_PRESCRIPTION);

  const [diagnosis, setDiagnosis] = useState(editPatient?.diagnosis || '');
  const [prescription, setPrescription] = useState(editPatient?.prescription || '');
  const [minorProcedureDone, setMinorProcedureDone] = useState(editPatient?.minor_procedure_done || false);
  const [followUpNeeded, setFollowUpNeeded] = useState(!!editPatient?.follow_up_date);
  const [followUpDate, setFollowUpDate] = useState(editPatient?.follow_up_date || '');

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newAttendanceId, setNewAttendanceId] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    if (!hospitalId) { setError('Please select a hospital.'); setSaving(false); return; }
    if (!patientType) { setError('Please select OP, IP, or Opinion.'); setSaving(false); return; }

    const today = new Date().toISOString().split('T')[0];

    const payload = {
      hospital_id: hospitalId,
      patient_name: name,
      age: age ? parseInt(age) : null,
      sex: sex || null,
      mobile_number: mobileNumber || null,
      fees: fees ? parseFloat(fees) : 0,
      patient_type: patientType,
      diagnosis: diagnosis || null,
      prescription: prescription || '',
      minor_procedure_done: minorProcedureDone,
      admission_date: patientType === 'ip' ? (admissionDate || null) : null,
      discharge_date: patientType === 'ip' ? (dischargeDate || null) : null,
      surgery_date: patientType === 'ip' ? (surgeryDate || null) : null,
      discharge_advice: patientType === 'ip' ? dischargeAdvice : '',
      prescription_items: prescriptionItems,
      follow_up_date: followUpNeeded && followUpDate ? followUpDate : null,
    };

    if (editPatient) {
      const { error } = await supabase.from('patients').update(payload).eq('id', editPatient.id);
      if (error) { setError(error.message); setSaving(false); return; }
      setSaving(false);
      onDone();
    } else {
      const uniqueId = await generateUniquePatientId(user!.id, hospitalId);
      const { error } = await supabase.from('patients').insert({ ...payload, unique_id: uniqueId });
      if (error) { setError(error.message); setSaving(false); return; }
      await upsertDailyEntryCount(user!.id, hospitalId, today, patientType);
      const { created, id } = await ensurePresentAttendance(user!.id, hospitalId, today);
      setSaving(false);
      if (created && id) {
        setNewAttendanceId(id); // shows the duty-type prompt; onDone() fires when it closes
      } else {
        onDone();
      }
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-100 transition">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">
            {editPatient ? 'Update Patient / Add Follow-up Visit' : 'Add Patient'}
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {editPatient
              ? `Editing ${editPatient.patient_name} (${editPatient.unique_id}) — changes save under this same unique ID`
              : 'Enter patient details below'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Demographics</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="p-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
              <select id="p-hospital" name="hospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} required className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition bg-white">
                <option value="">Select hospital...</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="p-name" className="block text-sm font-medium text-slate-600 mb-1.5">Patient Name *</label>
              <input id="p-name" name="patientName" autoComplete="name" type="text" required value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
            </div>
            <div>
              <label htmlFor="p-age" className="block text-sm font-medium text-slate-600 mb-1.5">Age</label>
              <input id="p-age" name="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
            </div>
            <div>
              <label htmlFor="p-sex" className="block text-sm font-medium text-slate-600 mb-1.5">Sex</label>
              <select id="p-sex" name="sex" value={sex} onChange={(e) => setSex(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition bg-white">
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="p-mobile" className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number
              </label>
              <input id="p-mobile" name="mobileNumber" autoComplete="tel" type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="e.g. 9876543210" />
            </div>
            <div>
              <label htmlFor="p-fees" className="block text-sm font-medium text-slate-600 mb-1.5">Fees (INR)</label>
              <input id="p-fees" name="fees" type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
            </div>
          </div>
        </div>

        {!editPatient && (
          <div className="pt-4 border-t border-slate-100">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Patient Type *</p>
            <div className="grid grid-cols-3 gap-3">
              <button type="button" onClick={() => setPatientType('op')} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${patientType === 'op' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${patientType === 'op' ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-400'}`}><UserRound className="w-5 h-5" /></div>
                <div className="text-center"><p className="text-sm font-semibold text-slate-700">OP Patient</p><p className="text-xs text-slate-400">Outpatient</p></div>
              </button>
              <button type="button" onClick={() => setPatientType('ip')} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${patientType === 'ip' ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${patientType === 'ip' ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-400'}`}><Stethoscope className="w-5 h-5" /></div>
                <div className="text-center"><p className="text-sm font-semibold text-slate-700">IP Patient</p><p className="text-xs text-slate-400">Inpatient / Surgery</p></div>
              </button>
              <button type="button" onClick={() => setPatientType('opinion')} className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition ${patientType === 'opinion' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}>
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${patientType === 'opinion' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-400'}`}><MessageCircleQuestion className="w-5 h-5" /></div>
                <div className="text-center"><p className="text-sm font-semibold text-slate-700">Opinion</p><p className="text-xs text-slate-400">Consult only</p></div>
              </button>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              For quick opinion visits you don't need to track individually, use the "Opinion Entry" count on the hospital's Daily Entry form instead.
            </p>
          </div>
        )}

        {(patientType === 'op' || patientType === 'ip' || patientType === 'opinion') && (
          <div className="pt-4 border-t border-slate-100 space-y-4">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">
              {patientType === 'ip' ? 'IP Details' : patientType === 'opinion' ? 'Opinion Details' : 'OP Details'}
            </p>

            {patientType === 'ip' && (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label htmlFor="p-admission-date" className="block text-sm font-medium text-slate-600 mb-1.5">Admission Date</label>
                  <input id="p-admission-date" name="admissionDate" type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
                </div>
                <div>
                  <label htmlFor="p-surgery-date" className="block text-sm font-medium text-slate-600 mb-1.5">Surgery Date</label>
                  <input id="p-surgery-date" name="surgeryDate" type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
                </div>
                <div>
                  <label htmlFor="p-discharge-date" className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Date</label>
                  <input id="p-discharge-date" name="dischargeDate" type="date" value={dischargeDate} onChange={(e) => setDischargeDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
                </div>
              </div>
            )}

            {patientType === 'ip' ? (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Discharge Advice</p>
                <div>
                  <label htmlFor="p-discharge-advice" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
                  <textarea id="p-discharge-advice" name="dischargeAdvice" value={dischargeAdvice} onChange={(e) => setDischargeAdvice(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Diet, activity, wound care, red-flag symptoms..." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Prescription</label>
                  <PrescriptionTable value={prescriptionItems} onChange={setPrescriptionItems} />
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-lg bg-slate-50 border border-slate-100 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Prescription</p>
                <PrescriptionTable value={prescriptionItems} onChange={setPrescriptionItems} />
              </div>
            )}

            <div>
              <label htmlFor="p-diagnosis" className="block text-sm font-medium text-slate-600 mb-1.5">Diagnosis</label>
              <input id="p-diagnosis" name="diagnosis" type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="e.g. Right inguinal hernia" />
            </div>
            <div>
              <label htmlFor="p-prescription" className="block text-sm font-medium text-slate-600 mb-1.5">Prescription</label>
              <textarea id="p-prescription" name="prescription" value={prescription} onChange={(e) => setPrescription(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Prescription notes..." />
            </div>
            <div className="p-4 rounded-lg bg-slate-50 border border-slate-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input id="p-minor-procedure" name="minorProcedureDone" type="checkbox" checked={minorProcedureDone} onChange={(e) => setMinorProcedureDone(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
                <div className="flex items-center gap-2"><ClipboardCheck className="w-4 h-4 text-slate-500" /><span className="text-sm font-medium text-slate-700">Minor procedure done</span></div>
              </label>
              {minorProcedureDone && <p className="text-xs text-slate-400 mt-2 ml-7">You can add full surgery details from the patient detail page after saving.</p>}
            </div>
            <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-100">
              <label className="flex items-center gap-3 cursor-pointer">
                <input id="p-follow-up-needed" name="followUpNeeded" type="checkbox" checked={followUpNeeded} onChange={(e) => { setFollowUpNeeded(e.target.checked); if (!e.target.checked) setFollowUpDate(''); }} className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500" />
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-500" /><span className="text-sm font-medium text-slate-700">Follow-up needed</span></div>
              </label>
              {followUpNeeded && (
                <div className="mt-3 ml-7">
                  <label htmlFor="p-follow-up-date" className="block text-sm font-medium text-slate-600 mb-1.5">Follow-up Date</label>
                  <input id="p-follow-up-date" name="followUpDate" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition" />
                  <p className="text-xs text-amber-600 mt-1.5 flex items-center gap-1"><FlaskConical className="w-3 h-3" />This will show as a reminder on the Dashboard.</p>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400">
              {patientType === 'ip'
                ? 'Full surgery details and investigations can be added from the patient detail page after saving.'
                : 'Investigation records can be added from the patient detail page after saving.'}
            </p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button type="submit" disabled={saving || !patientType} className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
            <Save className="w-4 h-4" />{saving ? 'Saving...' : editPatient ? 'Save Visit Update' : 'Add Patient'}
          </button>
          <button type="button" onClick={onCancel} className="px-5 py-2.5 text-slate-600 rounded-lg font-medium hover:bg-slate-100 transition">Cancel</button>
        </div>
      </form>

      {newAttendanceId && (
        <PresentDutyPrompt
          attendanceId={newAttendanceId}
          hospitalName={hospitals.find((h) => h.id === hospitalId)?.name}
          onClose={() => { setNewAttendanceId(null); onDone(); }}
        />
      )}
    </div>
  );
}
