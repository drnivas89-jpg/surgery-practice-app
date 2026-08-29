import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance, MonthlyEntry } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { X } from 'lucide-react';

type AttStatusChoice = 'present' | 'duty' | 'leave' | 'extra_duty';

interface Props {
  hospitalId: string;
  hospitalName: string;
  date: string;
  existingEntry: MonthlyEntry | null;
  existingAttendance: Attendance | null;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

// Shared quick-edit modal for a single hospital+date row — used by the
// Hospitals page and Reports page date-wise drill-down tables (and
// previously the Dashboard's, before that view was simplified). Upserts
// both monthly_entries and attendance for the date in one save.
export default function EditDayModal({ hospitalId, hospitalName, date, existingEntry, existingAttendance, userId, onClose, onSaved }: Props) {
  const [op, setOp] = useState(existingEntry?.op_patients?.toString() || '');
  const [opinion, setOpinion] = useState(existingEntry?.opinion_patients?.toString() || '');
  const [feesGen, setFeesGen] = useState(existingEntry?.fees_generated?.toString() || '');
  const [feesRec, setFeesRec] = useState(existingEntry?.fees_received?.toString() || '');
  const initialStatus: AttStatusChoice = existingAttendance
    ? existingAttendance.status === 'present'
      ? (existingAttendance.duty_type === 'duty' ? 'duty' : 'present')
      : existingAttendance.status === 'leave' ? 'leave' : 'extra_duty'
    : 'present';
  const [attStatus, setAttStatus] = useState<AttStatusChoice>(initialStatus);
  const [leaveType, setLeaveType] = useState(existingAttendance?.leave_type || '');
  const [extraType, setExtraType] = useState(existingAttendance?.extra_duty_type || '');
  const [recordAttendance, setRecordAttendance] = useState(!!existingAttendance);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const entryPayload = {
      user_id: userId,
      hospital_id: hospitalId,
      entry_date: date,
      month: date.substring(0, 7) + '-01',
      op_patients: parseInt(op) || 0,
      opinion_patients: parseInt(opinion) || 0,
      fees_generated: parseFloat(feesGen) || 0,
      fees_received: parseFloat(feesRec) || 0,
      notes: existingEntry?.notes || '',
    };
    const { error: entryError } = await supabase.from('monthly_entries').upsert(entryPayload, { onConflict: 'hospital_id,entry_date' });
    if (entryError) { setError(entryError.message); setSaving(false); return; }

    if (recordAttendance) {
      if (attStatus === 'leave' && !leaveType.trim()) { setError('Please enter the type of leave.'); setSaving(false); return; }
      if (attStatus === 'extra_duty' && !extraType.trim()) { setError('Please enter the extra duty type.'); setSaving(false); return; }
      const attPayload = {
        user_id: userId,
        hospital_id: hospitalId,
        attendance_date: date,
        status: attStatus === 'duty' ? 'present' : attStatus,
        duty_type: attStatus === 'present' ? 'normal' : attStatus === 'duty' ? 'duty' : null,
        leave_type: attStatus === 'leave' ? leaveType.trim() : null,
        extra_duty_type: attStatus === 'extra_duty' ? extraType.trim() : null,
        compensated_working_date: existingAttendance?.compensated_working_date || null,
        notes: existingAttendance?.notes || '',
      };
      const { error: attError } = await supabase.from('attendance').upsert(attPayload, { onConflict: 'user_id,hospital_id,attendance_date' });
      if (attError) { setError(attError.message); setSaving(false); return; }
    } else if (existingAttendance) {
      await supabase.from('attendance').delete().eq('id', existingAttendance.id);
    }

    setSaving(false);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Edit {formatDate(date)}</h2>
            <p className="text-xs text-slate-400">{hospitalName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={handleSave} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">OP Patients</label>
              <input type="number" value={op} onChange={(e) => setOp(e.target.value)} className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Opinion Entries</label>
              <input type="number" value={opinion} onChange={(e) => setOpinion(e.target.value)} className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Fees Generated</label>
              <input type="number" step="0.01" value={feesGen} onChange={(e) => setFeesGen(e.target.value)} className="form-input" placeholder="0" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">Fees Received</label>
              <input type="number" step="0.01" value={feesRec} onChange={(e) => setFeesRec(e.target.value)} className="form-input" placeholder="0" />
            </div>
          </div>
          <p className="text-xs text-slate-400">IP count isn't editable here — it's derived from individually tracked IP patient records (see Patient Details).</p>

          <div className="pt-3 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input type="checkbox" checked={recordAttendance} onChange={(e) => setRecordAttendance(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span className="text-sm font-medium text-slate-600">Record attendance for this date</span>
            </label>
            {recordAttendance && (
              <div className="space-y-3">
                <div className="grid grid-cols-4 gap-1.5">
                  {(['present', 'duty', 'leave', 'extra_duty'] as AttStatusChoice[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAttStatus(s)}
                      className={`py-2 rounded-lg text-xs font-medium transition ${attStatus === s ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                    >
                      {s === 'present' ? 'Present' : s === 'duty' ? 'Duty' : s === 'leave' ? 'Leave' : 'Extra Duty'}
                    </button>
                  ))}
                </div>
                {attStatus === 'leave' && (
                  <input type="text" value={leaveType} onChange={(e) => setLeaveType(e.target.value)} className="form-input" placeholder="Type of leave (e.g. Casual, Sick)" />
                )}
                {attStatus === 'extra_duty' && (
                  <input type="text" value={extraType} onChange={(e) => setExtraType(e.target.value)} className="form-input" placeholder="Extra duty type (e.g. extra, col, others)" />
                )}
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" disabled={saving} className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition disabled:opacity-60">
            {saving ? 'Saving...' : 'Save'}
          </button>
        </form>
      </div>
    </div>
  );
}
