import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Zap } from 'lucide-react';

interface Props {
  attendanceId: string;
  hospitalName?: string;
  onClose: () => void;
}

// Shown right after ensurePresentAttendance() auto-marks a hospital+date as
// Present for the first time today, so the doctor can immediately flag it
// as a Duty shift instead of leaving it as a plain "Normal Duty" default.
export default function PresentDutyPrompt({ attendanceId, hospitalName, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const setDutyType = async (dutyType: 'normal' | 'duty') => {
    setSaving(true);
    await supabase.from('attendance').update({ duty_type: dutyType }).eq('id', attendanceId);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
        <p className="text-sm font-semibold text-slate-700">
          Marked Present{hospitalName ? ` — ${hospitalName}` : ''}
        </p>
        <p className="text-xs text-slate-400 mt-1 mb-4">What kind of day was this? You can also log Leave or Extra Duty separately from the Hospitals page.</p>

        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={saving}
            onClick={() => setDutyType('normal')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-sky-300 hover:bg-sky-50 transition disabled:opacity-50"
          >
            <CheckCircle2 className="w-5 h-5 text-sky-600" />
            <span className="text-sm font-medium text-slate-700">Normal Duty</span>
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => setDutyType('duty')}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 hover:border-amber-300 hover:bg-amber-50 transition disabled:opacity-50"
          >
            <Zap className="w-5 h-5 text-amber-600" />
            <span className="text-sm font-medium text-slate-700">Duty</span>
          </button>
        </div>

        <button type="button" onClick={onClose} className="w-full mt-3 text-xs text-slate-400 hover:text-slate-600">
          Skip
        </button>
      </div>
    </div>
  );
}
