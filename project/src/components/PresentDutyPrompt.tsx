import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { CheckCircle2, Zap, Clock, Award } from 'lucide-react';

interface Props {
  attendanceId: string;
  hospitalName?: string;
  onClose: () => void;
}

type Choice = 'normal' | 'duty' | 'extra' | 'col';

const OPTIONS: { value: Choice; label: string; icon: typeof CheckCircle2; hoverClass: string; iconClass: string }[] = [
  { value: 'normal', label: 'Normal Duty', icon: CheckCircle2, hoverClass: 'hover:border-sky-300 hover:bg-sky-50', iconClass: 'text-sky-600' },
  { value: 'duty', label: 'Duty', icon: Zap, hoverClass: 'hover:border-amber-300 hover:bg-amber-50', iconClass: 'text-amber-600' },
  { value: 'extra', label: 'Extra Duty', icon: Clock, hoverClass: 'hover:border-orange-300 hover:bg-orange-50', iconClass: 'text-orange-600' },
  { value: 'col', label: 'COL Credit Earned', icon: Award, hoverClass: 'hover:border-emerald-300 hover:bg-emerald-50', iconClass: 'text-emerald-600' },
];

// Shown right after ensurePresentAttendance() auto-marks a hospital+date as
// Present for the first time today, so the doctor can immediately capture
// what kind of day it was — including Extra Duty / COL Credit, which are
// recorded as status='extra_duty' (extra_duty_type='extra'|'col'), the same
// schema the Hospitals attendance form already uses for these.
export default function PresentDutyPrompt({ attendanceId, hospitalName, onClose }: Props) {
  const [saving, setSaving] = useState(false);

  const choose = async (choice: Choice) => {
    setSaving(true);
    const update = choice === 'normal' || choice === 'duty'
      ? { duty_type: choice }
      : { status: 'extra_duty', extra_duty_type: choice };
    await supabase.from('attendance').update(update).eq('id', attendanceId);
    setSaving(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-lg w-full max-w-sm p-5">
        <p className="text-sm font-semibold text-slate-700">
          Marked Present{hospitalName ? ` — ${hospitalName}` : ''}
        </p>
        <p className="text-xs text-slate-400 mt-1 mb-4">What kind of day was this?</p>

        <div className="grid grid-cols-2 gap-3">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              disabled={saving}
              onClick={() => choose(o.value)}
              className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-slate-200 transition disabled:opacity-50 ${o.hoverClass}`}
            >
              <o.icon className={`w-5 h-5 ${o.iconClass}`} />
              <span className="text-sm font-medium text-slate-700 text-center">{o.label}</span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onClose} className="w-full mt-3 text-xs text-slate-400 hover:text-slate-600">
          Skip
        </button>
      </div>
    </div>
  );
}
