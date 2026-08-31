import { AttendanceChoice, AttendanceChoiceState, LEAVE_TYPE_OPTIONS } from '@/lib/attendance';
import { ColCreditDate } from '@/lib/col';
import { formatDate } from '@/lib/helpers';
import { CheckCircle2, Zap, LogOut } from 'lucide-react';

interface Props {
  value: AttendanceChoiceState;
  onChange: (next: AttendanceChoiceState) => void;
  colAvailableDates: ColCreditDate[];
  size?: 'full' | 'compact';
}

const CHOICES: { value: AttendanceChoice; label: string }[] = [
  { value: 'duty', label: 'Duty' },
  { value: 'duty24', label: '24 Hrs Duty' },
  { value: 'extra_duty', label: 'Extra Duty' },
  { value: 'leave', label: 'Leave' },
];

// Single shared 4-way attendance status picker used by Hospitals.tsx's
// Add Attendance modal, EditDayModal, and PresentDutyPrompt, so all three
// entry points capture the exact same fields the exact same way. This
// component is purely presentational — persistence stays with each caller.
export default function AttendanceStatusPicker({ value, onChange, colAvailableDates, size = 'full' }: Props) {
  const compact = size === 'compact';
  const set = (patch: Partial<AttendanceChoiceState>) => onChange({ ...value, ...patch });

  return (
    <div className="space-y-3">
      <div>
        {!compact && <span className="block text-sm font-medium text-slate-600 mb-1.5">Status *</span>}
        <div className={`grid gap-1.5 ${compact ? 'grid-cols-4' : 'grid-cols-4'}`}>
          {CHOICES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => set({ choice: c.value })}
              className={
                compact
                  ? `py-2 rounded-lg text-xs font-medium transition ${value.choice === c.value ? 'bg-sky-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`
                  : `flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 transition ${
                      value.choice === c.value ? 'border-sky-500 bg-sky-50' : 'border-slate-200 hover:border-slate-300'
                    }`
              }
            >
              {!compact && (
                c.value === 'leave'
                  ? <LogOut className={`w-5 h-5 ${value.choice === c.value ? 'text-sky-600' : 'text-slate-400'}`} />
                  : c.value === 'extra_duty'
                  ? <Zap className={`w-5 h-5 ${value.choice === c.value ? 'text-sky-600' : 'text-slate-400'}`} />
                  : <CheckCircle2 className={`w-5 h-5 ${value.choice === c.value ? 'text-sky-600' : 'text-slate-400'}`} />
              )}
              <span className={compact ? '' : 'text-xs font-medium text-slate-700'}>{c.label}</span>
            </button>
          ))}
        </div>
      </div>

      {value.choice === 'duty24' && (
        <div>
          <label className="block text-sm font-medium text-slate-600 mb-1.5">Type of Duty</label>
          <input
            type="text"
            value={value.dutySubtype}
            onChange={(e) => set({ dutySubtype: e.target.value })}
            className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
            placeholder="e.g. ICU cover, Casualty..."
          />
        </div>
      )}

      {value.choice === 'extra_duty' && (
        <div>
          <span className="block text-sm font-medium text-slate-600 mb-1.5">Credit for COL?</span>
          <div className="flex gap-2 mb-2">
            {(['col', 'extra', 'others'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => set({ extraDutyKind: t })}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                  value.extraDutyKind === t ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t === 'col' ? 'COL' : t === 'extra' ? 'Extra' : 'Others'}
              </button>
            ))}
          </div>
          {value.extraDutyKind === 'others' && (
            <input
              type="text"
              value={value.extraDutyOthersText}
              onChange={(e) => set({ extraDutyOthersText: e.target.value })}
              className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
              placeholder="Describe the extra duty type..."
            />
          )}
        </div>
      )}

      {value.choice === 'leave' && (
        <div className="space-y-3">
          <div>
            <span className="block text-sm font-medium text-slate-600 mb-1.5">Type of Leave *</span>
            <div className="grid grid-cols-5 gap-1.5">
              {LEAVE_TYPE_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => set({ leaveType: o.value, compensatedWorkingDate: o.value === 'col' ? value.compensatedWorkingDate : '' })}
                  className={`py-2 rounded-lg text-xs font-medium transition ${
                    value.leaveType === o.value ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          {value.leaveType === 'col' && (
            colAvailableDates.length > 0 ? (
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Compensates COL credit *</label>
                <select
                  required
                  value={value.compensatedWorkingDate}
                  onChange={(e) => set({ compensatedWorkingDate: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white"
                >
                  <option value="">Select credit date...</option>
                  {colAvailableDates.map((c) => (
                    <option key={c.date} value={c.date}>{formatDate(c.date)}</option>
                  ))}
                </select>
                <p className="text-xs text-slate-400 mt-1">Only showing COL credits earned at this hospital — COL can only be redeemed at the same hospital it was earned.</p>
              </div>
            ) : (
              <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg">No COL credits available at this hospital yet.</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
