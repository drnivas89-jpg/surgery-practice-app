import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance } from '@/lib/types';
import { getColSummary, redeemableOn } from '@/lib/col';
import { ColContext, EMPTY_COL_CONTEXT, fetchColContext } from '@/lib/holidays';
import { AttendanceChoiceState, defaultAttendanceChoiceState, validateAttendanceChoice, buildAttendanceFields } from '@/lib/attendance';
import AttendanceStatusPicker from './AttendanceStatusPicker';
import { CheckCircle2 } from 'lucide-react';

interface Props {
  attendanceId: string;
  hospitalId: string;
  hospitalName?: string;
  onClose: () => void;
}

// Shown right after ensurePresentAttendance() auto-marks a hospital+date as
// on duty for the first time, so the doctor can say what kind of day it
// was — same shared picker and buildAttendanceFields mapping as every
// other attendance entry point.
export default function PresentDutyPrompt({ attendanceId, hospitalId, hospitalName, onClose }: Props) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [colContext, setColContext] = useState<ColContext>(EMPTY_COL_CONTEXT);
  const [date, setDate] = useState<string | null>(null);
  const [attState, setAttState] = useState<AttendanceChoiceState>(defaultAttendanceChoiceState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data }, ctx] = await Promise.all([
        supabase.from('attendance').select('*').eq('hospital_id', hospitalId),
        fetchColContext(),
      ]);
      const rows = (data || []) as Attendance[];
      setAttendance(rows);
      setColContext(ctx);
      setDate(rows.find((a) => a.id === attendanceId)?.attendance_date || null);
    })();
  }, [hospitalId, attendanceId]);

  const asOf = date || undefined;
  const colSummary = useMemo(() => getColSummary(attendance, hospitalId, { context: colContext, asOf }), [attendance, hospitalId, colContext, asOf]);
  const holidayName = date && colContext.governmentHospitalIds.has(hospitalId) ? colContext.holidayNameOn(date) : null;

  const save = async () => {
    setError(null);
    const validationError = validateAttendanceChoice(attState);
    if (validationError) { setError(validationError); return; }
    setSaving(true);
    const { error: saveError } = await supabase
      .from('attendance')
      .update(buildAttendanceFields(attState))
      .eq('id', attendanceId);
    setSaving(false);
    if (saveError) { setError(saveError.message); return; }
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full sm:max-w-sm p-5">
        <div className="flex items-center gap-2.5 mb-4">
          <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><CheckCircle2 className="w-5 h-5" /></div>
          <div>
            <p className="text-sm font-semibold text-slate-800">Attendance marked{hospitalName ? ` — ${hospitalName}` : ''}</p>
            <p className="text-xs text-slate-500">What kind of day was this?</p>
          </div>
        </div>

        <AttendanceStatusPicker
          value={attState}
          onChange={setAttState}
          colAvailableDates={date ? redeemableOn(colSummary, date) : colSummary.availableDates}
          holidayName={holidayName}
          size="compact"
        />

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        <button
          type="button"
          disabled={saving}
          onClick={save}
          className="w-full mt-4 py-2.5 bg-emerald-600 text-white rounded-lg text-sm font-semibold hover:bg-emerald-700 transition disabled:opacity-60"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button type="button" onClick={onClose} className="w-full mt-2 py-1.5 text-xs text-slate-400 hover:text-slate-600">
          Skip — keep as regular duty
        </button>
      </div>
    </div>
  );
}
