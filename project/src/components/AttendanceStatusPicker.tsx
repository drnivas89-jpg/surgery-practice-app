import { AttendanceChoiceState, DUTY_KIND_OPTIONS, LEAVE_TYPE_OPTIONS } from '@/lib/attendance';
import { ColCreditDate } from '@/lib/col';
import { formatDate } from '@/lib/helpers';
import { Briefcase, Plane, PartyPopper, Info } from 'lucide-react';

interface Props {
  value: AttendanceChoiceState;
  onChange: (next: AttendanceChoiceState) => void;
  // COL credits this leave may redeem — callers pass redeemableOn(summary, date).
  colAvailableDates: ColCreditDate[];
  // Government holiday name when the selected hospital is a government
  // hospital and the date is a holiday — any duty then earns COL.
  holidayName?: string | null;
  size?: 'full' | 'compact';
}

// Single shared attendance picker used by every attendance entry point
// (Hospitals modal, EditDayModal, PresentDutyPrompt). Purely presentational
// — persistence stays with each caller via buildAttendanceFields.
export default function AttendanceStatusPicker({ value, onChange, colAvailableDates, holidayName, size = 'full' }: Props) {
  const compact = size === 'compact';
  const set = (patch: Partial<AttendanceChoiceState>) => onChange({ ...value, ...patch });
  const isDuty = value.choice === 'duty';

  const statusBtn = (active: boolean, tone: 'duty' | 'leave') =>
    `flex items-center justify-center gap-2 rounded-xl border-2 font-semibold transition ${compact ? 'py-2.5 text-sm' : 'py-3.5'} ${
      active
        ? tone === 'duty' ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-rose-500 bg-rose-50 text-rose-700'
        : 'border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50'
    }`;

  const chip = (active: boolean, tone: 'duty' | 'col' | 'leave') =>
    `rounded-lg text-xs font-semibold transition px-2 py-2 ${
      active
        ? tone === 'col' ? 'bg-amber-500 text-white shadow-sm' : tone === 'leave' ? 'bg-rose-600 text-white shadow-sm' : 'bg-emerald-600 text-white shadow-sm'
        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
    }`;

  return (
    <div className="space-y-3">
      <div>
        {!compact && <span className="form-label">Status *</span>}
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => set({ choice: 'duty' })} className={statusBtn(isDuty, 'duty')} aria-pressed={isDuty}>
            <Briefcase className="w-4 h-4" /> Duty
          </button>
          <button type="button" onClick={() => set({ choice: 'leave' })} className={statusBtn(!isDuty, 'leave')} aria-pressed={!isDuty}>
            <Plane className="w-4 h-4" /> Leave
          </button>
        </div>
      </div>

      {isDuty && holidayName && (
        <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-2.5">
          <PartyPopper className="w-4 h-4 flex-shrink-0 text-amber-500" />
          <span><strong>{holidayName}</strong> — government holiday. Any duty today earns a COL credit automatically.</span>
        </div>
      )}

      {isDuty && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Type of duty</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
            {DUTY_KIND_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ dutyKind: o.value })}
                className={chip(value.dutyKind === o.value, o.value === 'col' ? 'col' : 'duty')}
                aria-pressed={value.dutyKind === o.value}
                title={o.hint}
              >
                {o.label}
              </button>
            ))}
          </div>

          {value.dutyKind === 'duty24' && (
            <input
              type="text"
              aria-label="Type of 24 hour duty"
              value={value.dutySubtype}
              onChange={(e) => set({ dutySubtype: e.target.value })}
              className="form-input bg-white text-sm"
              placeholder="Duty details (optional) — e.g. Casualty, ICU cover"
            />
          )}
          {value.dutyKind === 'extra' && (
            <input
              type="text"
              aria-label="Extra duty details"
              value={value.extraDutyDetails}
              onChange={(e) => set({ extraDutyDetails: e.target.value })}
              className="form-input bg-white text-sm"
              placeholder="Details (optional) — e.g. Camp duty, VIP duty"
            />
          )}
          {value.dutyKind === 'col' && (
            <div className="space-y-1.5">
              <input
                type="text"
                aria-label="COL reason or occasion"
                value={value.colReason}
                onChange={(e) => set({ colReason: e.target.value })}
                className="form-input bg-white text-sm"
                placeholder="Occasion (optional) — e.g. Republic Day duty"
              />
              <p className="flex items-center gap-1 text-[11px] text-slate-500">
                <Info className="w-3 h-3" /> Earns 1 COL credit, valid for 6 months.
              </p>
            </div>
          )}
        </div>
      )}

      {!isDuty && (
        <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3 space-y-3">
          <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wide">Type of leave *</span>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {LEAVE_TYPE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => set({ leaveType: o.value, compensatedWorkingDate: o.value === 'col' ? value.compensatedWorkingDate : '' })}
                className={chip(value.leaveType === o.value, 'leave')}
                aria-pressed={value.leaveType === o.value}
              >
                {o.label}
              </button>
            ))}
          </div>
          {value.leaveType === 'col' && (
            colAvailableDates.length > 0 ? (
              <div>
                <label htmlFor="att-col-credit" className="form-label">Use which COL credit? *</label>
                <select
                  id="att-col-credit"
                  required
                  value={value.compensatedWorkingDate}
                  onChange={(e) => set({ compensatedWorkingDate: e.target.value })}
                  className="form-input bg-white text-sm"
                >
                  <option value="">Select credit...</option>
                  {colAvailableDates.map((c) => (
                    <option key={c.attendanceId} value={c.date}>
                      {formatDate(c.date)}{c.reason ? ` · ${c.reason}` : ''} — valid till {formatDate(c.expiryDate)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">Only credits earned at this hospital and still valid on this date.</p>
              </div>
            ) : (
              <p className="text-xs text-amber-700 bg-amber-50 p-2.5 rounded-lg">No valid COL credit at this hospital for this date — none earned yet, or all are used or wasted (credits last 6 months).</p>
            )
          )}
        </div>
      )}
    </div>
  );
}
