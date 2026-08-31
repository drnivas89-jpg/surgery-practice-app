import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { buildAttendanceFields } from '@/lib/attendance';
import { ChevronLeft, ChevronRight, X, Zap, LogOut } from 'lucide-react';

interface Props {
  hospitalId: string;
  hospitalName: string;
  attendance: Attendance[];
  userId: string;
  initialMonth?: number;
  initialYear?: number;
  onClose: () => void;
  onSaved: () => void;
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

// Hand-rolled month grid (no calendar library installed) for quickly
// marking a date as a COL Credit (extra duty earning COL) or COL Utilised
// (a leave redeeming an earlier credit at this hospital). Both paths go
// through buildAttendanceFields — the same mapping every other attendance
// entry point uses — so numbers can never diverge across the app.
export default function ColMonthCalendar({ hospitalId, hospitalName, attendance, userId, initialMonth, initialYear, onClose, onSaved }: Props) {
  const now = new Date();
  const [month, setMonth] = useState(initialMonth ?? now.getMonth());
  const [year, setYear] = useState(initialYear ?? now.getFullYear());
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [redeemChoice, setRedeemChoice] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const colSummary = useMemo(() => getColSummary(attendance, hospitalId), [attendance, hospitalId]);
  const attendanceByDate = useMemo(() => {
    const map = new Map<string, Attendance>();
    attendance.filter((a) => a.hospital_id === hospitalId).forEach((a) => map.set(a.attendance_date, a));
    return map;
  }, [attendance, hospitalId]);

  const goPrevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const goNextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = new Date(year, month, 1).getDay();
  const cells: (string | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month + 1).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`),
  ];

  const dotClassFor = (date: string) => {
    const a = attendanceByDate.get(date);
    if (!a) return null;
    if (a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col') return 'bg-amber-500';
    if (a.status === 'leave' && a.compensated_working_date) return 'bg-red-500';
    return 'bg-slate-300';
  };

  const openPicker = (date: string) => { setPickedDate(date); setRedeemChoice(''); setError(null); };

  const saveEntry = async (kind: 'credit' | 'utilised') => {
    if (!pickedDate) return;
    if (kind === 'utilised' && !redeemChoice) { setError('Please select which COL credit date this redeems.'); return; }
    setError(null);
    setSaving(true);

    // Preserve the one-row-per-hospital-per-day invariant: confirm before
    // overwriting an existing, differently-shaped record for this date.
    const { data: existing } = await supabase
      .from('attendance')
      .select('id')
      .eq('hospital_id', hospitalId)
      .eq('attendance_date', pickedDate)
      .maybeSingle();
    if (existing && !confirm('A record already exists for this hospital on this date. Replace it with this COL entry?')) {
      setSaving(false);
      return;
    }

    const fields = kind === 'credit'
      ? buildAttendanceFields({ choice: 'extra_duty', extraDutyKind: 'col', extraDutyOthersText: '', dutySubtype: '', leaveType: '', compensatedWorkingDate: '' })
      : buildAttendanceFields({ choice: 'leave', leaveType: 'col', compensatedWorkingDate: redeemChoice, extraDutyKind: 'col', extraDutyOthersText: '', dutySubtype: '' });

    const payload = { user_id: userId, hospital_id: hospitalId, attendance_date: pickedDate, ...fields, notes: '' };
    const { error: saveError } = await supabase.from('attendance').upsert(payload, { onConflict: 'user_id,hospital_id,attendance_date' });
    setSaving(false);
    if (saveError) {
      setError(saveError.code === '23505' ? 'That COL credit date is already redeemed by another leave entry.' : saveError.message);
      return;
    }
    setPickedDate(null);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-800">Add COL Entry</h2>
            <p className="text-xs text-slate-400">{hospitalName}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex items-center justify-between mb-3">
          <button onClick={goPrevMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
          <p className="text-sm font-semibold text-slate-700">{MONTHS[month]} {year}</p>
          <button onClick={goNextMonth} className="p-1.5 rounded-lg hover:bg-slate-100 transition"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
        </div>

        <div className="grid grid-cols-7 gap-1 mb-1">
          {WEEKDAYS.map((w) => <div key={w} className="text-center text-[10px] font-medium text-slate-400 py-1">{w}</div>)}
        </div>
        <div className="grid grid-cols-7 gap-1 mb-4">
          {cells.map((date, i) => {
            if (!date) return <div key={i} />;
            const dot = dotClassFor(date);
            return (
              <button
                key={date}
                type="button"
                onClick={() => openPicker(date)}
                className={`aspect-square rounded-lg text-xs flex flex-col items-center justify-center gap-0.5 transition hover:bg-sky-50 ${
                  pickedDate === date ? 'bg-sky-100 ring-2 ring-sky-400' : 'bg-slate-50'
                }`}
              >
                <span className="text-slate-600">{Number(date.substring(8, 10))}</span>
                {dot && <span className={`w-1.5 h-1.5 rounded-full ${dot}`} />}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-3 text-[11px] text-slate-400 mb-4">
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-500" /> Credit</span>
          <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> Utilised</span>
        </div>

        {pickedDate && (
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <p className="text-sm font-medium text-slate-700">{formatDate(pickedDate)}</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => saveEntry('credit')}
                disabled={saving}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-amber-200 hover:border-amber-400 hover:bg-amber-50 transition disabled:opacity-50"
              >
                <Zap className="w-4 h-4 text-amber-600" />
                <span className="text-xs font-medium text-slate-700">Credit</span>
              </button>
              <button
                type="button"
                onClick={() => setRedeemChoice(redeemChoice || 'pending')}
                disabled={saving}
                className="flex flex-col items-center gap-1.5 p-3 rounded-lg border-2 border-red-200 hover:border-red-400 hover:bg-red-50 transition disabled:opacity-50"
              >
                <LogOut className="w-4 h-4 text-red-600" />
                <span className="text-xs font-medium text-slate-700">Utilised</span>
              </button>
            </div>

            {redeemChoice !== '' && (
              colSummary.availableDates.length > 0 ? (
                <div>
                  <label className="block text-xs font-medium text-slate-600 mb-1.5">Redeems which COL credit? *</label>
                  <select
                    value={redeemChoice === 'pending' ? '' : redeemChoice}
                    onChange={(e) => setRedeemChoice(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                  >
                    <option value="">Select credit date...</option>
                    {colSummary.availableDates.map((c) => (
                      <option key={c.date} value={c.date}>{formatDate(c.date)}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => saveEntry('utilised')}
                    disabled={saving || !redeemChoice || redeemChoice === 'pending'}
                    className="w-full mt-2 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition disabled:opacity-50"
                  >
                    {saving ? 'Saving...' : 'Save as Utilised'}
                  </button>
                </div>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 p-2.5 rounded-lg">No COL credits available at this hospital yet.</p>
              )
            )}

            {error && <p className="text-xs text-red-600">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}
