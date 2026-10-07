import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Hospital, Patient, ProcedureCategory, Surgery, FollowUp } from '@/lib/types';
import { generateUniquePatientId, uploadImage, getImageUrl, todayLocalDateStr } from '@/lib/helpers';
import { ArrowLeft, Save, AlertCircle, Phone, ImagePlus, X, FlaskConical, FileText, UserRound, Activity } from 'lucide-react';

const CASE_CATEGORIES: { value: ProcedureCategory; label: string; hint: string; active: string }[] = [
  { value: 'Major', label: 'Major', hint: 'Theatre, GA / spinal', active: 'border-violet-500 bg-violet-50' },
  { value: 'Minor', label: 'Minor', hint: 'Minor OT, local / day-care', active: 'border-sky-500 bg-sky-50' },
  { value: 'Bedside', label: 'Bedside', hint: 'Ward / bedside procedure', active: 'border-emerald-500 bg-emerald-50' },
];

interface SurgicalCaseFormProps {
  hospitals: Hospital[];
  editPatient: Patient | null;
  defaultHospitalId?: string;
  onDone: () => void;
  onCancel: () => void;
}

// Study-purpose surgical case entry: one patient + one surgery (+ optional
// HPE report) on a single page. No fees, no OP/IP/Opinion type, and no
// daily-count or attendance side effects — see isSurgicalCase() in helpers.
export default function SurgicalCaseForm({ hospitals, editPatient, defaultHospitalId, onDone, onCancel }: SurgicalCaseFormProps) {
  const { user } = useAuth();

  // Patient & demographics
  const [name, setName] = useState(editPatient?.patient_name || '');
  const [age, setAge] = useState(editPatient?.age?.toString() || '');
  const [sex, setSex] = useState(editPatient?.sex || '');
  const [mobileNumber, setMobileNumber] = useState(editPatient?.mobile_number || '');

  // Surgery
  const [hospitalId, setHospitalId] = useState(editPatient?.hospital_id || defaultHospitalId || '');
  const [surgeryDate, setSurgeryDate] = useState(editPatient?.surgery_date?.substring(0, 10) || todayLocalDateStr());
  const [category, setCategory] = useState<ProcedureCategory | ''>('');
  const [procedureName, setProcedureName] = useState('');
  const [diagnosis, setDiagnosis] = useState(editPatient?.diagnosis || '');
  const [role, setRole] = useState<'done_by_me' | 'assisted_by_me'>('done_by_me');
  const [operativeNotes, setOperativeNotes] = useState('');

  // Images
  const [existingImages, setExistingImages] = useState<string[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});

  // HPE (optional)
  const [hpeEnabled, setHpeEnabled] = useState(false);
  const [hpeNumber, setHpeNumber] = useState('');
  const [hpeReport, setHpeReport] = useState('');
  const [existingHpeImages, setExistingHpeImages] = useState<string[]>([]);
  const [newHpeImages, setNewHpeImages] = useState<File[]>([]);

  const [existingSurgery, setExistingSurgery] = useState<Surgery | null>(null);
  const [existingHpe, setExistingHpe] = useState<FollowUp | null>(null);
  // Rows created by an earlier, partially failed save — a retry updates
  // these instead of inserting a duplicate case.
  const [createdPatientId, setCreatedPatientId] = useState<string | null>(null);
  const [createdSurgeryId, setCreatedSurgeryId] = useState<string | null>(null);
  const [loading, setLoading] = useState(!!editPatient);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!editPatient) return;
    (async () => {
      const [{ data: s }, { data: f }] = await Promise.all([
        supabase.from('surgeries').select('*').eq('patient_id', editPatient.id).order('created_at', { ascending: true }).limit(1).maybeSingle(),
        supabase.from('follow_ups').select('*').eq('patient_id', editPatient.id).eq('type', 'biopsy').order('created_at', { ascending: true }).limit(1).maybeSingle(),
      ]);
      if (s) {
        setExistingSurgery(s);
        setCategory(s.procedure_category || '');
        setProcedureName(s.procedure_name || '');
        setRole(s.role === 'assisted_by_me' ? 'assisted_by_me' : 'done_by_me');
        setOperativeNotes(s.procedure_notes || '');
        if (s.surgery_date) setSurgeryDate(s.surgery_date.substring(0, 10));
        setExistingImages(s.image_paths || []);
      }
      if (f) {
        setExistingHpe(f);
        setHpeEnabled(true);
        setHpeNumber(f.report_number || '');
        setHpeReport(f.findings || '');
        setExistingHpeImages(f.report_image_paths || []);
      }
      const urlMap: Record<string, string> = {};
      for (const path of [...(s?.image_paths || []), ...(f?.report_image_paths || [])]) {
        const url = await getImageUrl(path);
        if (url) urlMap[path] = url;
      }
      setImageUrls(urlMap);
      setLoading(false);
    })();
  }, [editPatient]);

  // Auto-fills operative notes from the most recent identical procedure
  // name — never overwrites notes already typed.
  const handleProcedureNameBlur = async () => {
    const proc = procedureName.trim();
    if (!proc || operativeNotes.trim()) return;
    const { data } = await supabase
      .from('surgeries')
      .select('procedure_notes')
      .ilike('procedure_name', proc)
      .not('procedure_notes', 'is', null)
      .order('surgery_date', { ascending: false, nullsFirst: false })
      .limit(1)
      .maybeSingle();
    if (data?.procedure_notes) setOperativeNotes(data.procedure_notes);
  };

  const uploadAll = async (files: File[], folder: string): Promise<string[]> => {
    const paths: string[] = [];
    for (const file of files) {
      const path = await uploadImage(file, user!.id, folder);
      if (!path) throw new Error(`Failed to upload "${file.name}".`);
      paths.push(path);
    }
    return paths;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setError(null);
    if (!name.trim()) { setError('Please enter the patient name.'); return; }
    if (!hospitalId) { setError('Please select the hospital where the surgery was done.'); return; }
    if (!surgeryDate) { setError('Please enter the date of surgery.'); return; }
    if (!category) { setError('Please choose Major, Minor or Bedside.'); return; }
    if (!procedureName.trim()) { setError('Please enter the procedure name.'); return; }

    setSaving(true);
    try {
      const imagePaths = [...existingImages, ...(await uploadAll(newImages, 'surgery'))];
      const hpeImagePaths = hpeEnabled ? [...existingHpeImages, ...(await uploadAll(newHpeImages, 'followup'))] : [];

      const patientPayload = {
        hospital_id: hospitalId,
        patient_name: name.trim(),
        age: age ? parseInt(age) : null,
        sex: sex || null,
        mobile_number: mobileNumber.trim() || null,
        diagnosis: diagnosis.trim() || null,
        surgery_date: surgeryDate,
        patient_type: null,
        treatment_type: 'surgical' as const,
        fees: 0,
      };

      let patientId = editPatient?.id ?? createdPatientId;
      if (patientId) {
        const { error: err } = await supabase.from('patients').update(patientPayload).eq('id', patientId);
        if (err) throw err;
      } else {
        const uniqueId = await generateUniquePatientId(user.id, hospitalId);
        const { data, error: err } = await supabase
          .from('patients')
          .insert({ ...patientPayload, unique_id: uniqueId })
          .select('id')
          .single();
        if (err || !data) throw err || new Error('Failed to save case.');
        patientId = data.id;
        setCreatedPatientId(data.id);
      }

      const surgeryPayload = {
        procedure_name: procedureName.trim(),
        procedure_category: category,
        surgery_date: surgeryDate,
        procedure_notes: operativeNotes,
        role,
        image_paths: imagePaths,
      };
      const surgeryId = existingSurgery?.id ?? createdSurgeryId;
      if (surgeryId) {
        const { error: err } = await supabase.from('surgeries').update(surgeryPayload).eq('id', surgeryId);
        if (err) throw err;
      } else {
        const { data, error: err } = await supabase
          .from('surgeries')
          .insert({ ...surgeryPayload, patient_id: patientId })
          .select('id')
          .single();
        if (err || !data) throw err || new Error('Failed to save surgery details.');
        setCreatedSurgeryId(data.id);
      }

      if (hpeEnabled) {
        const hpePayload = {
          type: 'biopsy' as const,
          report_number: hpeNumber.trim(),
          findings: hpeReport,
          year: parseInt(surgeryDate.substring(0, 4)),
          report_image_paths: hpeImagePaths,
        };
        const { error: hpeErr } = existingHpe
          ? await supabase.from('follow_ups').update(hpePayload).eq('id', existingHpe.id)
          : await supabase.from('follow_ups').insert({ ...hpePayload, patient_id: patientId });
        if (hpeErr) throw hpeErr;
      } else if (existingHpe) {
        const { error: hpeErr } = await supabase.from('follow_ups').delete().eq('id', existingHpe.id);
        if (hpeErr) throw hpeErr;
      }

      setSaving(false);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : (err as { message?: string })?.message || 'Something went wrong.');
      setSaving(false);
    }
  };

  const categoryOptions = category && !CASE_CATEGORIES.some((c) => c.value === category)
    ? [...CASE_CATEGORIES, { value: category, label: category, hint: 'Set from logbook', active: 'border-slate-500 bg-slate-50' }]
    : CASE_CATEGORIES;

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <button onClick={onCancel} className="p-2 rounded-lg hover:bg-slate-100 transition">
          <ArrowLeft className="w-5 h-5 text-slate-500" />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-slate-800">{editPatient ? 'Edit Surgical Case' : 'New Surgical Case'}</h1>
          <p className="text-slate-500 text-sm mt-0.5">
            {editPatient ? `${editPatient.patient_name} (${editPatient.unique_id})` : 'Case record for study purposes — no fees'}
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Section icon={UserRound} title="Patient Details">
          <div>
            <label htmlFor="sc-name" className="form-label">Patient Name *</label>
            <input id="sc-name" name="patientName" autoComplete="off" type="text" value={name} onChange={(e) => setName(e.target.value)} className="form-input" autoFocus={!editPatient} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label htmlFor="sc-age" className="form-label">Age</label>
              <input id="sc-age" name="age" type="number" min="0" value={age} onChange={(e) => setAge(e.target.value)} className="form-input" />
            </div>
            <div>
              <label htmlFor="sc-sex" className="form-label">Sex</label>
              <select id="sc-sex" name="sex" value={sex} onChange={(e) => setSex(e.target.value)} className="form-input bg-white">
                <option value="">Select...</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <label htmlFor="sc-mobile" className="form-label flex items-center gap-1.5"><Phone className="w-3.5 h-3.5 text-slate-400" /> Mobile</label>
              <input id="sc-mobile" name="mobileNumber" type="tel" autoComplete="off" value={mobileNumber} onChange={(e) => setMobileNumber(e.target.value)} className="form-input" />
            </div>
          </div>
          <div>
            <label htmlFor="sc-diagnosis" className="form-label">Diagnosis</label>
            <input id="sc-diagnosis" name="diagnosis" type="text" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="form-input" placeholder="e.g. Right inguinal hernia" />
          </div>
        </Section>

        <Section icon={Activity} title="Surgery">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="sc-hospital" className="form-label">Hospital where surgery was done *</label>
              <select id="sc-hospital" name="hospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="form-input bg-white">
                <option value="">Select hospital...</option>
                {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="sc-date" className="form-label">Date of Surgery *</label>
              <input id="sc-date" name="surgeryDate" type="date" value={surgeryDate} onChange={(e) => setSurgeryDate(e.target.value)} className="form-input" />
            </div>
          </div>
          <div>
            <p className="form-label">Type of Surgery *</p>
            <div className="grid grid-cols-3 gap-3">
              {categoryOptions.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCategory(c.value)}
                  aria-pressed={category === c.value}
                  className={`p-3 sm:p-4 rounded-xl border-2 text-left transition ${category === c.value ? c.active : 'border-slate-200 hover:border-slate-300'}`}
                >
                  <p className="font-semibold text-slate-700">{c.label}</p>
                  <p className="text-xs text-slate-400 mt-0.5 hidden sm:block">{c.hint}</p>
                </button>
              ))}
            </div>
          </div>
          <div>
            <label htmlFor="sc-procedure" className="form-label">Procedure Name *</label>
            <input id="sc-procedure" name="procedureName" type="text" value={procedureName} onChange={(e) => setProcedureName(e.target.value)} onBlur={handleProcedureNameBlur} className="form-input" placeholder="e.g. Laparoscopic Cholecystectomy" />
          </div>
          <div>
            <p className="form-label">Role</p>
            <div className="flex gap-2">
              {([['done_by_me', 'Done by me'], ['assisted_by_me', 'Assisted by me']] as const).map(([val, label]) => (
                <button key={val} type="button" onClick={() => setRole(val)} className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${role === val ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}>{label}</button>
              ))}
            </div>
          </div>
        </Section>

        <Section icon={ImagePlus} title="Images">
          <ImagePicker
            id="sc-images"
            existing={existingImages}
            onRemoveExisting={(p) => setExistingImages((prev) => prev.filter((x) => x !== p))}
            files={newImages}
            onFilesChange={setNewImages}
            urls={imageUrls}
            hint="Pre-op, intra-op, specimen and post-op photos"
          />
        </Section>

        <Section icon={FileText} title="Operative Notes">
          <textarea
            id="sc-notes"
            name="operativeNotes"
            aria-label="Operative notes"
            value={operativeNotes}
            onChange={(e) => setOperativeNotes(e.target.value)}
            rows={8}
            className="form-input resize-y"
            placeholder="Indication, anaesthesia, position, incision, findings, procedure steps, closure, specimen sent..."
          />
          <p className="text-xs text-slate-400">Tip: notes auto-fill from your last case with the same procedure name — edit freely.</p>
        </Section>

        <Section icon={FlaskConical} title="HPE Report" optional>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={hpeEnabled}
              onChange={(e) => setHpeEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-violet-600 focus:ring-violet-500"
            />
            <span className="text-sm font-medium text-slate-700">Add HPE report</span>
          </label>
          {!hpeEnabled && existingHpe && (
            <p className="text-xs text-amber-600">The saved HPE report will be removed when you save.</p>
          )}
          {hpeEnabled && (
            <div className="space-y-4">
              <div>
                <label htmlFor="sc-hpe-number" className="form-label">HPE Number</label>
                <input id="sc-hpe-number" name="hpeNumber" type="text" value={hpeNumber} onChange={(e) => setHpeNumber(e.target.value)} className="form-input" />
              </div>
              <div>
                <label htmlFor="sc-hpe-report" className="form-label">HPE Report</label>
                <textarea id="sc-hpe-report" name="hpeReport" value={hpeReport} onChange={(e) => setHpeReport(e.target.value)} rows={4} className="form-input resize-y" placeholder="Histopathology findings / impression..." />
              </div>
              <ImagePicker
                id="sc-hpe-images"
                existing={existingHpeImages}
                onRemoveExisting={(p) => setExistingHpeImages((prev) => prev.filter((x) => x !== p))}
                files={newHpeImages}
                onFilesChange={setNewHpeImages}
                urls={imageUrls}
                hint="Scan or photo of the HPE report (optional)"
              />
            </div>
          )}
        </Section>

        {error && (
          <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            <AlertCircle className="w-4 h-4 flex-shrink-0" /><span>{error}</span>
          </div>
        )}

        <div className="flex gap-3">
          <button type="button" onClick={onCancel} className="flex-1 py-3 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="flex-1 py-3 rounded-lg bg-sky-600 text-white font-medium hover:bg-sky-700 transition flex items-center justify-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Saving...' : editPatient ? 'Save Changes' : 'Save Case'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Section({ icon: Icon, title, optional, children }: { icon: typeof Activity; title: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
      <div className="flex items-center gap-2">
        <Icon className="w-4 h-4 text-sky-500" />
        <h2 className="font-semibold text-slate-700">{title}</h2>
        {optional && <span className="text-xs text-slate-400">(optional)</span>}
      </div>
      {children}
    </div>
  );
}

function ImagePicker({ id, existing, onRemoveExisting, files, onFilesChange, urls, hint }: {
  id: string;
  existing: string[];
  onRemoveExisting: (path: string) => void;
  files: File[];
  onFilesChange: (files: File[]) => void;
  urls: Record<string, string>;
  hint: string;
}) {
  const [previews, setPreviews] = useState<string[]>([]);

  useEffect(() => {
    const next = files.map((f) => URL.createObjectURL(f));
    setPreviews(next);
    return () => next.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const thumb = 'w-20 h-20 object-cover rounded-lg border border-slate-200';
  const removeBtn = 'absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-white border border-slate-200 text-slate-500 hover:text-red-600 flex items-center justify-center shadow-sm';

  return (
    <div className="space-y-3">
      {(existing.length > 0 || files.length > 0) && (
        <div className="flex gap-3 flex-wrap">
          {existing.map((path) => (
            <div key={path} className="relative">
              {urls[path]
                ? <a href={urls[path]} target="_blank" rel="noopener noreferrer"><img src={urls[path]} alt="Saved" className={thumb} /></a>
                : <div className={`${thumb} bg-slate-100`} />}
              <button type="button" onClick={() => onRemoveExisting(path)} className={removeBtn} aria-label="Remove image"><X className="w-3 h-3" /></button>
            </div>
          ))}
          {previews.map((src, i) => (
            <div key={src} className="relative">
              <img src={src} alt={files[i]?.name || 'New image'} className={`${thumb} border-sky-300`} />
              <button type="button" onClick={() => onFilesChange(files.filter((_, j) => j !== i))} className={removeBtn} aria-label="Remove image"><X className="w-3 h-3" /></button>
            </div>
          ))}
        </div>
      )}
      <label htmlFor={id} className="flex items-center gap-2 px-3 py-3 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:text-sky-600 transition">
        <ImagePlus className="w-4 h-4" /> {hint}
      </label>
      <input
        id={id}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={(e) => { onFilesChange([...files, ...Array.from(e.target.files || [])]); e.target.value = ''; }}
      />
    </div>
  );
}
