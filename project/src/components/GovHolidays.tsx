import { useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { GovHoliday } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { secondSaturdaysOfYear, SECOND_SATURDAY_NAME } from '@/lib/holidays';
import { PartyPopper, Plus, Trash2, ChevronLeft, ChevronRight, Ban, RotateCcw, AlertCircle } from 'lucide-react';

interface Props {
  holidays: GovHoliday[];
  userId: string;
  onChanged: () => void;
}

interface HolidayRow {
  date: string;
  name: string;
  kind: 'second_saturday' | 'custom';
  cancelled: boolean;
  row: GovHoliday | null;
}

const weekday = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
};

// Government holiday calendar (applies to every government hospital):
// second Saturdays are holidays automatically unless cancelled here, plus
// any named holidays the doctor enters. Duty on any of these days at a
// government hospital earns a COL credit.
export default function GovHolidays({ holidays, userId, onChanged }: Props) {
  const [year, setYear] = useState(new Date().getFullYear());
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const rows = useMemo<HolidayRow[]>(() => {
    const byDate = new Map(holidays.map((h) => [h.holiday_date.substring(0, 10), h]));
    const list: HolidayRow[] = secondSaturdaysOfYear(year).map((d) => {
      const row = byDate.get(d) || null;
      return {
        date: d,
        name: row && !row.is_cancelled && row.name.trim() ? row.name : SECOND_SATURDAY_NAME,
        kind: row && !row.is_cancelled && row.name.trim() && row.name !== SECOND_SATURDAY_NAME ? 'custom' : 'second_saturday',
        cancelled: !!row?.is_cancelled,
        row,
      };
    });
    holidays
      .filter((h) => h.holiday_date.startsWith(String(year)) && !list.some((l) => l.date === h.holiday_date.substring(0, 10)))
      .forEach((h) => list.push({ date: h.holiday_date.substring(0, 10), name: h.name || 'Government holiday', kind: 'custom', cancelled: h.is_cancelled, row: h }));
    return list.sort((a, b) => a.date.localeCompare(b.date));
  }, [holidays, year]);

  const activeCount = rows.filter((r) => !r.cancelled).length;

  const run = async (op: () => PromiseLike<{ error: { message: string } | null }>) => {
    setBusy(true);
    setError(null);
    const { error: err } = await op();
    setBusy(false);
    if (err) {
      setError(err.message.includes('gov_holidays')
        ? 'Holiday storage is not set up yet — run the database update in Supabase first (see the instructions you were given).'
        : err.message);
      return false;
    }
    onChanged();
    return true;
  };

  const addHoliday = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!date || !name.trim()) { setError('Enter both the date and the holiday name.'); return; }
    const ok = await run(() => supabase.from('gov_holidays').upsert(
      { user_id: userId, holiday_date: date, name: name.trim(), is_cancelled: false },
      { onConflict: 'user_id,holiday_date' },
    ));
    if (ok) { setDate(''); setName(''); }
  };

  const cancelSecondSaturday = (d: string) => run(() => supabase.from('gov_holidays').upsert(
    { user_id: userId, holiday_date: d, name: SECOND_SATURDAY_NAME, is_cancelled: true },
    { onConflict: 'user_id,holiday_date' },
  ));

  const removeRow = (row: GovHoliday) => run(() => supabase.from('gov_holidays').delete().eq('id', row.id));

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between flex-wrap gap-3 mb-4">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center"><PartyPopper className="w-5 h-5" /></div>
          <div>
            <h2 className="font-semibold text-slate-800">Government Holidays</h2>
            <p className="text-xs text-slate-500">Duty on these days at a government hospital earns COL automatically</p>
          </div>
        </div>
        <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-1">
          <button onClick={() => setYear(year - 1)} className="p-1 rounded-md hover:bg-white transition" aria-label="Previous year"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
          <span className="text-sm font-semibold text-slate-700 px-2 tabular-nums">{year}</span>
          <button onClick={() => setYear(year + 1)} className="p-1 rounded-md hover:bg-white transition" aria-label="Next year"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
        </div>
      </div>

      <form onSubmit={addHoliday} className="grid grid-cols-1 sm:grid-cols-[10rem_1fr_auto] gap-2 mb-4">
        <input type="date" aria-label="Holiday date" value={date} onChange={(e) => setDate(e.target.value)} className="form-input text-sm" />
        <input type="text" aria-label="Holiday name" value={name} onChange={(e) => setName(e.target.value)} className="form-input text-sm" placeholder="Holiday name — e.g. Pongal, Independence Day" />
        <button type="submit" disabled={busy} className="btn-primary bg-amber-600 hover:bg-amber-700 justify-center">
          <Plus className="w-4 h-4" /> Add
        </button>
      </form>

      {error && (
        <div className="flex items-start gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg mb-3">
          <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /> {error}
        </div>
      )}

      <p className="text-xs text-slate-400 mb-2">{activeCount} holiday{activeCount === 1 ? '' : 's'} in {year}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-96 overflow-y-auto pr-1">
        {rows.map((r) => (
          <div
            key={r.date}
            className={`flex items-center gap-3 rounded-xl border px-3 py-2.5 ${r.cancelled ? 'border-slate-200 bg-slate-50 opacity-60' : r.kind === 'custom' ? 'border-amber-200 bg-amber-50/60' : 'border-slate-200 bg-white'}`}
          >
            <div className={`w-11 text-center rounded-lg py-1 flex-shrink-0 ${r.cancelled ? 'bg-slate-200 text-slate-500' : 'bg-amber-500 text-white'}`}>
              <p className="text-[10px] font-medium uppercase leading-none">{weekday(r.date)}</p>
              <p className="text-base font-bold leading-tight">{Number(r.date.substring(8, 10))}</p>
            </div>
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium truncate ${r.cancelled ? 'line-through text-slate-500' : 'text-slate-700'}`}>{r.name}</p>
              <p className="text-[11px] text-slate-400">{formatDate(r.date)}{r.cancelled ? ' · cancelled' : r.kind === 'second_saturday' ? ' · automatic' : ''}</p>
            </div>
            {r.kind === 'second_saturday' && !r.cancelled && !r.row && (
              <button onClick={() => cancelSecondSaturday(r.date)} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-red-600 px-2 py-1 rounded-md hover:bg-red-50 transition" title="Cancel this second Saturday holiday">
                <Ban className="w-3.5 h-3.5" /> Cancel
              </button>
            )}
            {r.cancelled && r.row && (
              <button onClick={() => removeRow(r.row!)} disabled={busy} className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600 hover:text-emerald-700 px-2 py-1 rounded-md hover:bg-emerald-50 transition" title="Restore this holiday">
                <RotateCcw className="w-3.5 h-3.5" /> Restore
              </button>
            )}
            {!r.cancelled && r.row && (
              <button onClick={() => removeRow(r.row!)} disabled={busy} className="p-1.5 text-slate-400 hover:text-red-600 rounded-md hover:bg-red-50 transition" title={r.kind === 'custom' && !secondSaturdaysOfYear(year).includes(r.date) ? 'Delete holiday' : 'Remove custom name'}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
