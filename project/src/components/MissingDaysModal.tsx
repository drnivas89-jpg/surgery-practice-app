import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance, Hospital } from '@/lib/types';
import { formatDate, todayLocalDateStr } from '@/lib/helpers';
import { ColContext } from '@/lib/holidays';
import { buildAttendanceFields, defaultAttendanceChoiceState, LEAVE_TYPE_OPTIONS } from '@/lib/attendance';
import { LeaveTypeSlug } from '@/lib/types';
import { X, CalendarCheck2, CheckCircle2, AlertCircle } from 'lucide-react';

interface Props {
  hospitals: Hospital[];
  attendance: Attendance[];
  colContext: ColContext;
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

const RANGES = [7, 14, 30] as const;

function lastNDates(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  for (let i = 1; i <= n; i++) {
    const day = new Date(d.getFullYear(), d.getMonth(), d.getDate() - i);
    out.push(todayLocalDateStr(day));
  }
  return out;
}

const isSunday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() === 0;
};

// Bulk-fills attendance for past days that have no record at one hospital.
// Never overwrites: only dates with no attendance row are offered, and the
// insert ignores any row that appeared meanwhile.
export default function MissingDaysModal({ hospitals, attendance, colContext, userId, onClose, onSaved }: Props) {
  const [hospitalId, setHospitalId] = useState(hospitals.find((h) => h.is_government)?.id || hospitals[0]?.id || '');
  const [range, setRange] = useState<(typeof RANGES)[number]>(14);
  const [includeOff, setIncludeOff] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'duty' | LeaveTypeSlug>('duty');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const isGov = colContext.governmentHospitalIds.has(hospitalId);
  const recorded = useMemo(
    () => new Set(attendance.filter((a) => a.hospital_id === hospitalId).map((a) => a.attendance_date)),
    [attendance, hospitalId]
  );
  const days = useMemo(() => lastNDates(range)
    .filter((d) => !recorded.has(d))
    .map((d) => ({ date: d, sunday: isSunday(d), holiday: isGov ? colContext.holidayNameOn(d) : null }))
    .filter((d) => includeOff || (!d.sunday && !d.holiday)),
  [range, recorded, includeOff, isGov, colContext]);

  const allSelected = days.length > 0 && days.every((d) => selected.has(d.date));
  const toggle = (date: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(date)) next.delete(date); else next.add(date);
    return next;
  });

  const save = async () => {
    const dates = days.map((d) => d.date).filter((d) => selected.has(d));
    if (dates.length === 0) { setError('Tick at least one day.'); return; }
    setError(null);
    setSaving(true);
    const fields = mode === 'duty'
      ? buildAttendanceFields(defaultAttendanceChoiceState())
      : buildAttendanceFields({ ...defaultAttendanceChoiceState(), choice: 'leave', leaveType: mode });
    const rows = dates.map((d) => ({ user_id: userId, hospital_id: hospitalId, attendance_date: d, ...fields, notes: 'Filled from missing days' }));
    const { error: err } = await supabase.from('attendance').upsert(rows, { onConflict: 'user_id,hospital_id,attendance_date', ignoreDuplicates: true });
    setSaving(false);
    if (err) { setError(err.message); return; }
    setSelected(new Set());
    setResult(`${dates.length} day${dates.length === 1 ? '' : 's'} marked as ${mode === 'duty' ? 'Regular duty' : `${LEAVE_TYPE_OPTIONS.find((o) => o.value === mode)?.label} leave`}.`);
    onSaved();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[92vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center"><CalendarCheck2 className="w-5 h-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Fill missing days</h2>
            <p className="text-xs text-slate-500">Past days with no attendance — existing entries are never changed</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-3 border-b border-slate-100">
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <select aria-label="Hospital" value={hospitalId} onChange={(e) => { setHospitalId(e.target.value); setSelected(new Set()); setResult(null); }} className="form-input text-sm">
              {hospitals.map((h) => <option key={h.id} value={h.id}>{h.name}{h.is_government ? ' (Govt)' : ''}</option>)}
            </select>
            <div className="flex bg-slate-100 rounded-lg p-1">
              {RANGES.map((r) => (
                <button key={r} onClick={() => { setRange(r); setSelected(new Set()); }} className={`px-2.5 rounded-md text-xs font-semibold ${range === r ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500'}`}>{r}d</button>
              ))}
            </div>
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-500 cursor-pointer">
            <input type="checkbox" checked={includeOff} onChange={(e) => setIncludeOff(e.target.checked)} className="w-4 h-4 rounded border-slate-300" />
            Also show Sundays{isGov ? ' and government holidays' : ''}
          </label>
        </div>

        <div className="overflow-y-auto p-3 flex-1">
          {days.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">No missing days in the last {range} days. 🎉</p>
          ) : (
            <>
              <label className="flex items-center gap-2 px-2 py-1.5 text-xs font-semibold text-slate-500 cursor-pointer">
                <input type="checkbox" checked={allSelected} onChange={() => setSelected(allSelected ? new Set() : new Set(days.map((d) => d.date)))} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
                Select all ({days.length})
              </label>
              {days.map((d) => (
                <label key={d.date} className="flex items-center gap-3 px-2 py-2 rounded-lg hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selected.has(d.date)} onChange={() => toggle(d.date)} className="w-4 h-4 rounded border-slate-300 text-emerald-600" />
                  <span className="text-sm text-slate-700 flex-1">{formatDate(d.date)} <span className="text-xs text-slate-400">{new Date(`${d.date}T00:00:00`).toLocaleDateString('en-GB', { weekday: 'long' })}</span></span>
                  {d.holiday && <span className="text-[11px] font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">{d.holiday}</span>}
                  {d.sunday && !d.holiday && <span className="text-[11px] text-slate-400">Sunday</span>}
                </label>
              ))}
            </>
          )}
        </div>

        <div className="p-5 border-t border-slate-100 space-y-3">
          <div className="flex flex-wrap gap-1.5">
            <button onClick={() => setMode('duty')} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode === 'duty' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}>Regular duty</button>
            {LEAVE_TYPE_OPTIONS.filter((o) => o.value !== 'col').map((o) => (
              <button key={o.value} onClick={() => setMode(o.value)} className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${mode === o.value ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}>{o.label} leave</button>
            ))}
          </div>
          {error && <p className="text-sm text-red-600 flex items-center gap-1.5"><AlertCircle className="w-4 h-4" /> {error}</p>}
          {result && <p className="text-sm text-emerald-700 flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> {result}</p>}
          <button onClick={save} disabled={saving || selected.size === 0} className="w-full py-2.5 rounded-lg bg-emerald-600 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50">
            {saving ? 'Saving…' : `Mark ${selected.size || ''} day${selected.size === 1 ? '' : 's'}`}
          </button>
          <p className="text-[11px] text-slate-400">COL leave isn't offered here because each COL leave must be linked to a specific credit — use Add Attendance for that.</p>
        </div>
      </div>
    </div>
  );
}
