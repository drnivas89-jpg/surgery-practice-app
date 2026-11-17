import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance, Hospital } from '@/lib/types';
import { todayLocalDateStr } from '@/lib/helpers';
import { ColContext } from '@/lib/holidays';
import { getColSummary, redeemableOn } from '@/lib/col';
import { AttendanceChoiceState, attendanceToChoiceState, buildAttendanceFields, validateAttendanceChoice } from '@/lib/attendance';
import AttendanceStatusPicker from './AttendanceStatusPicker';
import { X, Zap, AlertCircle } from 'lucide-react';

const LAST_HOSPITAL_KEY = 'quickLogHospital';

interface Props {
  hospitals: Hospital[];
  attendance: Attendance[];
  colContext: ColContext;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const readLastHospital = () => { try { return localStorage.getItem(LAST_HOSPITAL_KEY); } catch { return null; } };

// One screen for the whole day: attendance + OP/opinion counts + fees.
// Pre-fills whatever is already recorded for that hospital+date, so saving
// again simply updates it.
export default function QuickLogModal({ hospitals, attendance, colContext, userId, onClose, onSaved }: Props) {
  const last = readLastHospital();
  const [hospitalId, setHospitalId] = useState(hospitals.some((h) => h.id === last) ? last! : hospitals[0]?.id || '');
  const [date, setDate] = useState(todayLocalDateStr());
  const existingAtt = attendance.find((a) => a.hospital_id === hospitalId && a.attendance_date === date) || null;
  const [attState, setAttState] = useState<AttendanceChoiceState>(attendanceToChoiceState(existingAtt));
  const [op, setOp] = useState('');
  const [opinion, setOpinion] = useState('');
  const [feesGen, setFeesGen] = useState('');
  const [feesRec, setFeesRec] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-prefill whenever the hospital or date changes.
  useEffect(() => {
    setAttState(attendanceToChoiceState(attendance.find((a) => a.hospital_id === hospitalId && a.attendance_date === date) || null));
    supabase.from('monthly_entries').select('*').eq('hospital_id', hospitalId).eq('entry_date', date).maybeSingle().then(({ data }) => {
      setOp(data?.op_patients ? String(data.op_patients) : '');
      setOpinion(data?.opinion_patients ? String(data.opinion_patients) : '');
      setFeesGen(data?.fees_generated ? String(data.fees_generated) : '');
      setFeesRec(data?.fees_received ? String(data.fees_received) : '');
      setNotes(data?.notes || '');
    });
  }, [hospitalId, date, attendance]);

  const colSummary = useMemo(() => getColSummary(attendance, hospitalId, { context: colContext, asOf: date }), [attendance, hospitalId, colContext, date]);
  const holidayName = colContext.governmentHospitalIds.has(hospitalId) ? colContext.holidayNameOn(date) : null;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const invalid = validateAttendanceChoice(attState);
    if (invalid) { setError(invalid); return; }
    setSaving(true);
    const { error: attErr } = await supabase.from('attendance').upsert(
      { user_id: userId, hospital_id: hospitalId, attendance_date: date, ...buildAttendanceFields(attState), notes: existingAtt?.notes || '' },
      { onConflict: 'user_id,hospital_id,attendance_date' }
    );
    if (attErr) {
      setSaving(false);
      setError(attErr.code === '23505' ? 'That COL credit is already used by another leave.' : attErr.message);
      return;
    }
    const hasNumbers = [op, opinion, feesGen, feesRec].some((v) => v.trim() !== '') || notes.trim() !== '';
    if (hasNumbers) {
      const { error: entryErr } = await supabase.from('monthly_entries').upsert({
        user_id: userId,
        hospital_id: hospitalId,
        entry_date: date,
        month: `${date.substring(0, 7)}-01`,
        op_patients: parseInt(op) || 0,
        opinion_patients: parseInt(opinion) || 0,
        fees_generated: parseFloat(feesGen) || 0,
        fees_received: parseFloat(feesRec) || 0,
        notes,
      }, { onConflict: 'hospital_id,entry_date' });
      if (entryErr) { setSaving(false); setError(entryErr.message); return; }
    }
    try { localStorage.setItem(LAST_HOSPITAL_KEY, hospitalId); } catch { /* storage unavailable */ }
    setSaving(false);
    onSaved();
  };

  const num = (id: string, label: string, value: string, set: (v: string) => void, step = '1') => (
    <div>
      <label htmlFor={id} className="form-label text-xs">{label}</label>
      <input id={id} type="number" inputMode="decimal" min="0" step={step} value={value} onChange={(e) => set(e.target.value)} className="form-input" placeholder="0" />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <form onSubmit={save} className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[94vh] overflow-y-auto p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center"><Zap className="w-5 h-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Log the day</h2>
            <p className="text-xs text-slate-500">Attendance, patients and fees in one go</p>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <select aria-label="Hospital" value={hospitalId} onChange={(e) => setHospitalId(e.target.value)} className="form-input">
            {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
          </select>
          <input aria-label="Date" type="date" value={date} max={todayLocalDateStr()} onChange={(e) => setDate(e.target.value || todayLocalDateStr())} className="form-input w-40" />
        </div>
        {existingAtt && <p className="text-xs text-sky-700 bg-sky-50 rounded-lg px-3 py-2">Already logged for this day — saving updates it.</p>}

        <AttendanceStatusPicker value={attState} onChange={setAttState} colAvailableDates={redeemableOn(colSummary, date)} holidayName={holidayName} size="compact" />

        {attState.choice === 'duty' && (
          <div className="grid grid-cols-2 gap-3">
            {num('ql-op', 'OP patients', op, setOp)}
            {num('ql-opinion', 'Opinions', opinion, setOpinion)}
            {num('ql-fees-gen', 'Fees billed (₹)', feesGen, setFeesGen, '0.01')}
            {num('ql-fees-rec', 'Fees received (₹)', feesRec, setFeesRec, '0.01')}
          </div>
        )}

        {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</p>}
        <button type="submit" disabled={saving || !hospitalId} className="w-full py-3 rounded-xl bg-sky-600 text-white font-semibold hover:bg-sky-700 transition disabled:opacity-50">
          {saving ? 'Saving…' : 'Save day'}
        </button>
      </form>
    </div>
  );
}
