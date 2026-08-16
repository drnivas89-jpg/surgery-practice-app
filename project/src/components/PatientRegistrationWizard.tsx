import { useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Hospital } from '@/lib/types';
import { generateUniquePatientId, upsertDailyEntryCount, uploadImage, ensurePresentAttendance } from '@/lib/helpers';
import PrescriptionTable, { DEFAULT_PRESCRIPTION } from './PrescriptionTable';
import PresentDutyPrompt from './PresentDutyPrompt';
import {
  ArrowLeft, ArrowRight, Save, AlertCircle, Stethoscope, UserRound, MessageCircleQuestion,
  Calendar, Phone, Plus, Trash2, Upload, Image as ImageIcon, IndianRupee, CheckCircle2,
} from 'lucide-react';

interface PatientRegistrationWizardProps {
  hospitals: Hospital[];
  defaultHospitalId?: string;
  onDone: () => void;
  onCancel: () => void;
}

type StepKey =
  | 'demographics' | 'diagnosis' | 'op_or_ip'
  | 'op_details'
  | 'ip_branch' | 'surgery_details' | 'treatment_details'
  | 'investigations' | 'discharge' | 'follow_up' | 'fees';

interface InvestigationDraft {
  name: string;
  date: string;
  value: string;
  notes: string;
}

export default function PatientRegistrationWizard({ hospitals, defaultHospitalId, onDone, onCancel }: PatientRegistrationWizardProps) {
  const { user } = useAuth();

  // Step 1 — demographics
  const [hospitalId, setHospitalId] = useState(defaultHospitalId || '');
  const [name, setName] = useState('');
  const [age, setAge] = useState('');
  const [sex, setSex] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');

  // Step 2 — diagnosis
  const [diagnosis, setDiagnosis] = useState('');

  // Step 3 — OP, IP, or Opinion
  const [patientType, setPatientType] = useState<'op' | 'ip' | 'opinion' | null>(null);

  // OP / Opinion branch
  const [prescription, setPrescription] = useState('');

  // IP branch
  const [treatmentType, setTreatmentType] = useState<'surgical' | 'non_surgical' | null>(null);

  // Surgical details
  const [procedureName, setProcedureName] = useState('');
  const [surgeryType, setSurgeryType] = useState('');
  const [anaesthesiaType, setAnaesthesiaType] = useState('');
  const [procedureNotes, setProcedureNotes] = useState('');
  const [admissionDate, setAdmissionDate] = useState('');
  const [surgeryDate, setSurgeryDate] = useState('');

  // Non-surgical details
  const [treatmentDetails, setTreatmentDetails] = useState('');
  const [treatmentPhotos, setTreatmentPhotos] = useState<File[]>([]);

  // Investigations (shared by both IP branches)
  const [investigations, setInvestigations] = useState<InvestigationDraft[]>([]);

  // Discharge (shared by both IP branches)
  const [dischargeAdvice, setDischargeAdvice] = useState('');
  const [dischargeDate, setDischargeDate] = useState('');
  const [dischargeSummaryFile, setDischargeSummaryFile] = useState<File | null>(null);
  const [prescriptionItems, setPrescriptionItems] = useState(DEFAULT_PRESCRIPTION);

  // Follow-up (shared by all)
  const [followUpNeeded, setFollowUpNeeded] = useState(false);
  const [followUpDate, setFollowUpDate] = useState('');

  // Fees (shared by all — final step)
  const [fees, setFees] = useState('');

  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [newAttendanceId, setNewAttendanceId] = useState<string | null>(null);

  const steps: StepKey[] = useMemo(() => {
    const s: StepKey[] = ['demographics', 'diagnosis', 'op_or_ip'];
    if (patientType === 'op' || patientType === 'opinion') {
      s.push('op_details', 'fees');
    } else if (patientType === 'ip') {
      s.push('ip_branch');
      if (treatmentType === 'surgical') {
        s.push('surgery_details', 'investigations', 'discharge', 'follow_up', 'fees');
      } else if (treatmentType === 'non_surgical') {
        s.push('treatment_details', 'investigations', 'discharge', 'follow_up', 'fees');
      }
    }
    return s;
  }, [patientType, treatmentType]);

  const currentStep = steps[stepIndex];
  const isLastStep = stepIndex === steps.length - 1;

  const stepValid = (): boolean => {
    switch (currentStep) {
      case 'demographics':
        return !!hospitalId && !!name.trim();
      case 'op_or_ip':
        return !!patientType;
      case 'ip_branch':
        return !!treatmentType;
      default:
        return true;
    }
  };

  const goNext = () => {
    setError(null);
    if (!stepValid()) { setError('Please fill in the required fields before continuing.'); return; }
    if (isLastStep) { handleSave(); return; }
    setStepIndex((i) => Math.min(i + 1, steps.length - 1));
  };

  const goBack = () => {
    setError(null);
    if (stepIndex === 0) { onCancel(); return; }
    setStepIndex((i) => Math.max(i - 1, 0));
  };

  const handleProcedureNameBlur = async () => {
    const name = procedureName.trim();
    if (!name || procedureNotes.trim()) return; // don't overwrite notes already typed
    const { data } = await supabase
      .from('surgeries')
      .select('procedure_notes')
      .ilike('procedure_name', name)
      .not('procedure_notes', 'is', null)
      .order('surgery_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.procedure_notes) setProcedureNotes(data.procedure_notes);
  };

  const addInvestigation = () => setInvestigations((prev) => [...prev, { name: '', date: '', value: '', notes: '' }]);
  const updateInvestigation = (idx: number, field: keyof InvestigationDraft, value: string) => {
    setInvestigations((prev) => prev.map((inv, i) => (i === idx ? { ...inv, [field]: value } : inv)));
  };
  const removeInvestigation = (idx: number) => setInvestigations((prev) => prev.filter((_, i) => i !== idx));

  const handleSave = async () => {
    if (!user) return;
    setSaving(true);
    setError(null);

    try {
      const uniqueId = await generateUniquePatientId(user.id, hospitalId);
      const today = new Date().toISOString().split('T')[0];

      // Upload discharge summary + treatment photos first (if any)
      let dischargeSummaryPath: string | null = null;
      if (dischargeSummaryFile) {
        dischargeSummaryPath = await uploadImage(dischargeSummaryFile, user.id, 'discharge-summary');
      }
      const treatmentPhotoPaths: string[] = [];
      for (const file of treatmentPhotos) {
        const path = await uploadImage(file, user.id, 'treatment-photo');
        if (path) treatmentPhotoPaths.push(path);
      }

      const payload = {
        hospital_id: hospitalId,
        unique_id: uniqueId,
        patient_name: name.trim(),
        age: age ? parseInt(age) : null,
        sex: sex || null,
        mobile_number: mobileNumber || null,
        fees: fees ? parseFloat(fees) : 0,
        diagnosis: diagnosis || null,
        patient_type: patientType,
        prescription: (patientType === 'op' || patientType === 'opinion') ? prescription : treatmentType === 'non_surgical' ? treatmentDetails : '',
        prescription_items: patientType === 'ip' ? prescriptionItems : DEFAULT_PRESCRIPTION,
        treatment_type: patientType === 'ip' ? treatmentType : null,
        admission_date: patientType === 'ip' ? (admissionDate || null) : null,
        surgery_date: treatmentType === 'surgical' ? (surgeryDate || null) : null,
        discharge_date: patientType === 'ip' ? (dischargeDate || null) : null,
        discharge_advice: patientType === 'ip' ? dischargeAdvice : '',
        discharge_summary_path: dischargeSummaryPath,
        treatment_photo_paths: treatmentPhotoPaths,
        follow_up_date: followUpNeeded && followUpDate ? followUpDate : null,
        minor_procedure_done: false,
      };

      const { data: newPatient, error: insertError } = await supabase
        .from('patients')
        .insert(payload)
        .select()
        .single();

      if (insertError || !newPatient) {
        setError(insertError?.message || 'Failed to save patient.');
        setSaving(false);
        return;
      }

      // Create linked surgery record if surgical
      if (treatmentType === 'surgical') {
        await supabase.from('surgeries').insert({
          patient_id: newPatient.id,
          procedure_name: procedureName,
          surgery_type: surgeryType,
          anaesthesia_type: anaesthesiaType,
          procedure_notes: procedureNotes,
          surgery_date: surgeryDate || null,
          role: 'done_by_me',
        });
      }

      // Save investigations
      const validInvestigations = investigations.filter((inv) => inv.name.trim());
      if (validInvestigations.length > 0) {
        await supabase.from('investigations').insert(
          validInvestigations.map((inv) => ({
            patient_id: newPatient.id,
            investigation_name: inv.name,
            investigation_date: inv.date || null,
            value: inv.value,
            notes: inv.notes,
          }))
        );
      }

      // Keep hospital daily-entry OP/IP/Opinion counters in sync
      await upsertDailyEntryCount(user.id, hospitalId, today, patientType!);
      const { created, id } = await ensurePresentAttendance(user.id, hospitalId, today);

      setSaving(false);
      if (created && id) {
        setNewAttendanceId(id); // shows the duty-type prompt; onDone() fires when it closes
      } else {
        onDone();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setSaving(false);
    }
  };

  const stepLabels: Record<StepKey, string> = {
    demographics: 'Patient Details',
    diagnosis: 'Diagnosis',
    op_or_ip: 'OP or IP',
    op_details: 'Prescription & Follow-up',
    ip_branch: 'Treatment Type',
    surgery_details: 'Surgery Details',
    treatment_details: 'Treatment Details',
    investigations: 'Investigations',
    discharge: 'Discharge',
    follow_up: 'Follow-up',
    fees: 'Fees',
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={goBack} className="p-2 rounded-lg hover:bg-slate-100 transition">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Patient Registration</h1>
          <p className="text-slate-500 text-sm mt-0.5">Step {stepIndex + 1} of {steps.length} — {stepLabels[currentStep]}</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
        <div
          className="h-full bg-sky-600 transition-all duration-300"
          style={{ width: `${((stepIndex + 1) / steps.length) * 100}%` }}
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
        {currentStep === 'demographics' && (
          <>
            <div>
              <label htmlFor="w-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
              <select id="w-hospital" name="hospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition">
                <option value="">Select hospital...</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="w-name" className="block text-sm font-medium text-slate-600 mb-1.5">Patient Name *</label>
              <input id="w-name" name="patientName" autoComplete="name" type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="w-age" className="block text-sm font-medium text-slate-600 mb-1.5">Age</label>
                <input id="w-age" name="age" type="number" value={age} onChange={(e) => setAge(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
              </div>
              <div>
                <label htmlFor="w-sex" className="block text-sm font-medium text-slate-600 mb-1.5">Sex</label>
                <select id="w-sex" name="sex" value={sex} onChange={(e) => setSex(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition">
                  <option value="">Select...</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="w-mobile" className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile Number
              </label>
              <input id="w-mobile" name="mobileNumber" autoComplete="tel" type="tel" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
            </div>
          </>
        )}

        {currentStep === 'diagnosis' && (
          <div>
            <label htmlFor="w-diagnosis" className="block text-sm font-medium text-slate-600 mb-1.5">Diagnosis</label>
            <textarea id="w-diagnosis" name="diagnosis" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} rows={4} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="e.g. Right inguinal hernia" autoFocus />
          </div>
        )}

        {currentStep === 'op_or_ip' && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-3">What kind of visit is this? *</p>
            <div className="grid grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => setPatientType('op')}
                className={`p-5 rounded-xl border-2 text-left transition ${patientType === 'op' ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <UserRound className="w-6 h-6 text-sky-600 mb-2" />
                <p className="font-semibold text-slate-700">OP</p>
                <p className="text-xs text-slate-400 mt-1">Outpatient consultation</p>
              </button>
              <button
                type="button"
                onClick={() => setPatientType('ip')}
                className={`p-5 rounded-xl border-2 text-left transition ${patientType === 'ip' ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <Stethoscope className="w-6 h-6 text-violet-600 mb-2" />
                <p className="font-semibold text-slate-700">IP</p>
                <p className="text-xs text-slate-400 mt-1">Admitted patient</p>
              </button>
              <button
                type="button"
                onClick={() => setPatientType('opinion')}
                className={`p-5 rounded-xl border-2 text-left transition ${patientType === 'opinion' ? 'border-amber-500 bg-amber-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <MessageCircleQuestion className="w-6 h-6 text-amber-600 mb-2" />
                <p className="font-semibold text-slate-700">Opinion</p>
                <p className="text-xs text-slate-400 mt-1">Consult only</p>
              </button>
            </div>
          </div>
        )}

        {currentStep === 'op_details' && (
          <>
            <div>
              <label htmlFor="w-prescription" className="block text-sm font-medium text-slate-600 mb-1.5">Prescription</label>
              <textarea id="w-prescription" name="prescription" value={prescription} onChange={(e) => setPrescription(e.target.value)} rows={4} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Prescription notes..." autoFocus />
            </div>
            <FollowUpFields
              followUpNeeded={followUpNeeded}
              setFollowUpNeeded={setFollowUpNeeded}
              followUpDate={followUpDate}
              setFollowUpDate={setFollowUpDate}
            />
          </>
        )}

        {currentStep === 'ip_branch' && (
          <div>
            <p className="text-sm font-medium text-slate-600 mb-3">Surgical or non-surgical treatment? *</p>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setTreatmentType('surgical')}
                className={`p-5 rounded-xl border-2 text-left transition ${treatmentType === 'surgical' ? 'border-violet-500 bg-violet-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <p className="font-semibold text-slate-700">Surgical</p>
                <p className="text-xs text-slate-400 mt-1">A procedure will be performed</p>
              </button>
              <button
                type="button"
                onClick={() => setTreatmentType('non_surgical')}
                className={`p-5 rounded-xl border-2 text-left transition ${treatmentType === 'non_surgical' ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 hover:border-slate-300'}`}
              >
                <p className="font-semibold text-slate-700">Non-Surgical</p>
                <p className="text-xs text-slate-400 mt-1">Medical management only</p>
              </button>
            </div>
          </div>
        )}

        {currentStep === 'surgery_details' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="w-admission-date" className="block text-sm font-medium text-slate-600 mb-1.5">Admission Date</label>
                <input id="w-admission-date" name="admissionDate" type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
              </div>
              <div>
                <label htmlFor="w-surgery-date" className="block text-sm font-medium text-slate-600 mb-1.5">Surgery Date</label>
                <input id="w-surgery-date" name="surgeryDate" type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
              </div>
            </div>
            <div>
              <label htmlFor="w-procedure-name" className="block text-sm font-medium text-slate-600 mb-1.5">Procedure Name</label>
              <input id="w-procedure-name" name="procedureName" type="text" value={procedureName} onChange={(e) => setProcedureName(e.target.value)} onBlur={handleProcedureNameBlur} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="e.g. Laparoscopic Cholecystectomy" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="w-surgery-type" className="block text-sm font-medium text-slate-600 mb-1.5">Surgery Type</label>
                <input id="w-surgery-type" name="surgeryType" type="text" value={surgeryType} onChange={(e) => setSurgeryType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="e.g. Major, Minor" />
              </div>
              <div>
                <label htmlFor="w-anaesthesia" className="block text-sm font-medium text-slate-600 mb-1.5">Anaesthesia Type</label>
                <input id="w-anaesthesia" name="anaesthesiaType" type="text" value={anaesthesiaType} onChange={(e) => setAnaesthesiaType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="e.g. General, Spinal" />
              </div>
            </div>
            <div>
              <label htmlFor="w-procedure-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Procedure Notes</label>
              <textarea id="w-procedure-notes" name="procedureNotes" value={procedureNotes} onChange={(e) => setProcedureNotes(e.target.value)} rows={3} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Intraoperative findings, notes..." />
            </div>
          </>
        )}

        {currentStep === 'treatment_details' && (
          <>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="w-admission-date-ns" className="block text-sm font-medium text-slate-600 mb-1.5">Admission Date</label>
                <input id="w-admission-date-ns" name="admissionDate" type="date" value={admissionDate} onChange={(e) => setAdmissionDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
              </div>
            </div>
            <div>
              <label htmlFor="w-treatment-details" className="block text-sm font-medium text-slate-600 mb-1.5">Treatment Details</label>
              <textarea id="w-treatment-details" name="treatmentDetails" value={treatmentDetails} onChange={(e) => setTreatmentDetails(e.target.value)} rows={5} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Treatment plan, medications, management notes..." autoFocus />
            </div>
            <PhotoUploadField
              label="Photos (optional)"
              files={treatmentPhotos}
              onChange={setTreatmentPhotos}
            />
          </>
        )}

        {currentStep === 'investigations' && (
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-slate-600">Investigations</label>
              <button type="button" onClick={addInvestigation} className="flex items-center gap-1 text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 px-2.5 py-1.5 rounded-lg transition">
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
            {investigations.length === 0 ? (
              <p className="text-sm text-slate-400 py-4 text-center border border-dashed border-slate-200 rounded-lg">No investigations added yet — optional, click "Add" if needed.</p>
            ) : (
              <div className="space-y-3">
                {investigations.map((inv, idx) => (
                  <div key={idx} className="p-3 rounded-lg border border-slate-100 bg-slate-50 space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        aria-label="Investigation name"
                        type="text"
                        value={inv.name}
                        onChange={(e) => updateInvestigation(idx, 'name', e.target.value)}
                        placeholder="e.g. Hemoglobin"
                        className="flex-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <input
                        aria-label="Investigation date"
                        type="date"
                        value={inv.date}
                        onChange={(e) => updateInvestigation(idx, 'date', e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button type="button" onClick={() => removeInvestigation(idx)} className="text-slate-300 hover:text-red-500 transition p-1">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        aria-label="Investigation value"
                        type="text"
                        value={inv.value}
                        onChange={(e) => updateInvestigation(idx, 'value', e.target.value)}
                        placeholder="Value / result"
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <input
                        aria-label="Investigation notes"
                        type="text"
                        value={inv.notes}
                        onChange={(e) => updateInvestigation(idx, 'notes', e.target.value)}
                        placeholder="Notes (optional)"
                        className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {currentStep === 'discharge' && (
          <>
            <div>
              <label htmlFor="w-discharge-advice" className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Advice</label>
              <textarea id="w-discharge-advice" name="dischargeAdvice" value={dischargeAdvice} onChange={(e) => setDischargeAdvice(e.target.value)} rows={4} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition resize-none" placeholder="Medications, precautions, diet advice..." autoFocus />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Prescription</label>
              <PrescriptionTable value={prescriptionItems} onChange={setPrescriptionItems} />
            </div>
            <div>
              <label htmlFor="w-discharge-date" className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Date</label>
              <input id="w-discharge-date" name="dischargeDate" type="date" value={dischargeDate} onChange={(e) => setDischargeDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" />
            </div>
            <div>
              <label htmlFor="w-discharge-summary" className="block text-sm font-medium text-slate-600 mb-1.5">Discharge Summary (optional)</label>
              <label htmlFor="w-discharge-summary" className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:text-sky-600 transition">
                <Upload className="w-4 h-4" />
                {dischargeSummaryFile ? dischargeSummaryFile.name : 'Upload discharge summary (image or PDF)'}
              </label>
              <input
                id="w-discharge-summary"
                name="dischargeSummary"
                type="file"
                accept="image/*,.pdf"
                className="hidden"
                onChange={(e) => setDischargeSummaryFile(e.target.files?.[0] || null)}
              />
            </div>
          </>
        )}

        {currentStep === 'follow_up' && (
          <FollowUpFields
            followUpNeeded={followUpNeeded}
            setFollowUpNeeded={setFollowUpNeeded}
            followUpDate={followUpDate}
            setFollowUpDate={setFollowUpDate}
          />
        )}

        {currentStep === 'fees' && (
          <div>
            <label htmlFor="w-fees" className="block text-sm font-medium text-slate-600 mb-1.5 flex items-center gap-1.5">
              <IndianRupee className="w-3.5 h-3.5 text-slate-400" /> Fees (INR)
            </label>
            <input id="w-fees" name="fees" type="number" step="0.01" value={fees} onChange={(e) => setFees(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition" placeholder="0" autoFocus />
            <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> This is the last step — click Save to finish.</p>
          </div>
        )}

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" />
            {error}
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={goBack}
          className="flex-1 py-3 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition flex items-center justify-center gap-2"
        >
          <ArrowLeft className="w-4 h-4" /> {stepIndex === 0 ? 'Cancel' : 'Back'}
        </button>
        <button
          onClick={goNext}
          disabled={saving}
          className="flex-1 py-3 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition flex items-center justify-center gap-2 disabled:opacity-60"
        >
          {saving ? 'Saving...' : isLastStep ? (<><Save className="w-4 h-4" /> Save</>) : (<>Next <ArrowRight className="w-4 h-4" /></>)}
        </button>
      </div>

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

function FollowUpFields({
  followUpNeeded, setFollowUpNeeded, followUpDate, setFollowUpDate,
}: {
  followUpNeeded: boolean;
  setFollowUpNeeded: (v: boolean) => void;
  followUpDate: string;
  setFollowUpDate: (v: string) => void;
}) {
  return (
    <div className="p-4 rounded-lg bg-amber-50/50 border border-amber-100">
      <label className="flex items-center gap-3 cursor-pointer">
        <input
          id="w-follow-up-needed"
          name="followUpNeeded"
          type="checkbox"
          checked={followUpNeeded}
          onChange={(e) => { setFollowUpNeeded(e.target.checked); if (!e.target.checked) setFollowUpDate(''); }}
          className="w-4 h-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
        />
        <div className="flex items-center gap-2"><Calendar className="w-4 h-4 text-amber-500" /><span className="text-sm font-medium text-slate-700">Follow-up needed</span></div>
      </label>
      {followUpNeeded && (
        <div className="mt-3 ml-7">
          <label htmlFor="w-follow-up-date" className="block text-sm font-medium text-slate-600 mb-1.5">Follow-up Date</label>
          <input id="w-follow-up-date" name="followUpDate" type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-amber-400 focus:ring-2 focus:ring-amber-100 outline-none transition" />
        </div>
      )}
    </div>
  );
}

function PhotoUploadField({ label, files, onChange }: { label: string; files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div>
      <label htmlFor="w-treatment-photos" className="block text-sm font-medium text-slate-600 mb-1.5">{label}</label>
      <label htmlFor="w-treatment-photos" className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:text-sky-600 transition">
        <ImageIcon className="w-4 h-4" />
        {files.length > 0 ? `${files.length} photo(s) selected` : 'Upload photos (optional)'}
      </label>
      <input
        id="w-treatment-photos"
        name="treatmentPhotos"
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => onChange(Array.from(e.target.files || []))}
      />
    </div>
  );
}
