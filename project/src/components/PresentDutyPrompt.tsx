import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance } from '@/lib/types';
import { getColSummary } from '@/lib/col';
import { AttendanceChoiceState, defaultAttendanceChoiceState, validateAttendanceChoice, buildAttendanceFields } from '@/lib/attendance';
import AttendanceStatusPicker from './AttendanceStatusPicker';

interface Props {
  attendanceId: string;
  hospitalId: string;
  hospitalName?: string;
  onClose: () => void;
}

// Shown right after ensurePresentAttendance() auto-marks a hospital+date as
// Present for the first time today, so the doctor can immediately capture
// what kind of day it was, using the same shared AttendanceStatusPicker
// (and the same buildAttendanceFields mapping) as the Hospitals modal and
// EditDayModal, so all three entry points can never disagree on the DB
// shape for a given choice.
export default function PresentDutyPrompt({ attendanceId, hospitalId, hospitalName, onClose }: Props) {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [attState, setAttState] = useState<AttendanceChoiceState>(defaultAttendanceChoiceState());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase
      .from('attendance')
      .select('*')
      .eq('hospital_id', hospitalId)
      .then(({ data }) => setAttendance(data || []));
  }, [hospitalId]);

  const colSummary = useMemo(() => getColSummary(attendance, hospitalId), [attendance, hospitalId]);

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

  // "Duty" has no follow-up fields, so it can still save instantly on
  // pick — matches the previous 1-click UX for the common case.
  const chooseDuty = async () => {
    setSaving(true);
    await supabase.from('attendance').update(buildAttendanceFields(defaultAttendanceChoiceState())).eq('id', attendanceId);
    setSaving(false);
    onClose();
  };

  const needsFollowUp = attState.choice !== 'duty';

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
        <p className="text-sm font-semibold text-slate-700">
          Marked Present{hospitalName ? ` — ${hospitalName}` : ''}
        </p>
        <p className="text-xs text-slate-400 mt-1 mb-4">What kind of day was this?</p>

        <AttendanceStatusPicker
          value={attState}
          onChange={(next) => {
            setAttState(next);
            if (next.choice === 'duty') chooseDuty();
          }}
          colAvailableDates={colSummary.availableDates}
          size="compact"
        />

        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}

        {needsFollowUp && (
          <button
            type="button"
            disabled={saving}
            onClick={save}
            className="w-full mt-3 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition disabled:opacity-60"
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        )}

        <button type="button" onClick={onClose} className="w-full mt-2 text-xs text-slate-400 hover:text-slate-600">
          Skip
        </button>
      </div>
    </div>
  );
}
