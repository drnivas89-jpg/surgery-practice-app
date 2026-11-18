import { useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileUp, Presentation, Recycle, X } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { uploadImage, todayLocalDateStr } from '@/lib/helpers';
import { findReusable, matchFilesToClasses } from '@/lib/pptMatch';
import type { ClassEntry } from '@/lib/types';

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const pad = (n: number) => String(n).padStart(2, '0');
const filesOf = (c: ClassEntry) => (c.ppt_paths && c.ppt_paths.length > 0 ? c.ppt_paths : c.ppt_path ? [c.ppt_path] : []);

interface Props {
  classes: ClassEntry[];
  userId: string;
  onEdit: (c: ClassEntry) => void;
  onChanged: () => void;
}

// Month view of the teaching schedule. Classes without slides are flagged;
// "Match PPTs" takes a batch of files and pairs each with a class this month
// (by topic words and any date in the file name) for review before upload.
export default function ClassCalendar({ classes, userId, onEdit, onChanged }: Props) {
  const today = todayLocalDateStr();
  const [month, setMonth] = useState(today.substring(0, 7));
  const [review, setReview] = useState<{ file: File; classId: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [y, m] = month.split('-').map(Number);
  const inMonth = useMemo(() => classes.filter((c) => c.class_date?.startsWith(month)), [classes, month]);
  const byDay = useMemo(() => {
    const map = new Map<string, ClassEntry[]>();
    inMonth.forEach((c) => {
      const d = c.class_date!.substring(0, 10);
      map.set(d, [...(map.get(d) || []), c]);
    });
    return map;
  }, [inMonth]);
  const missing = inMonth.filter((c) => filesOf(c).length === 0);
  const withFiles = useMemo(() => classes.map((c) => ({ ...c, ppt_paths: filesOf(c) })), [classes]);
  const reusable = missing
    .map((c) => ({ c, from: findReusable(c, withFiles) }))
    .filter((r): r is { c: ClassEntry; from: ClassEntry & { ppt_paths: string[] } } => !!r.from);

  // Monday-first grid with leading/trailing blanks.
  const first = new Date(y, m - 1, 1);
  const lead = (first.getDay() + 6) % 7;
  const days = new Date(y, m, 0).getDate();
  const cells: (string | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => `${month}-${pad(i + 1)}`)];
  while (cells.length % 7) cells.push(null);

  const shift = (delta: number) => {
    const d = new Date(y, m - 1 + delta, 1);
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`);
  };

  const pickFiles = (list: FileList | null) => {
    const files = Array.from(list || []);
    if (fileInput.current) fileInput.current.value = '';
    if (files.length === 0) return;
    // Prefer classes still missing slides; fall back to all classes this month.
    const pool = missing.length ? missing : inMonth;
    const matched = matchFilesToClasses(files.map((f) => f.name), pool.map((c) => ({ id: c.id, topic: c.topic, class_date: c.class_date })));
    setError(null);
    setReview(files.map((file, i) => ({ file, classId: matched[i] || '' })));
  };

  const attach = async (classId: string, newPaths: string[]) => {
    const c = classes.find((x) => x.id === classId)!;
    const paths = [...filesOf(c), ...newPaths.filter((p) => !filesOf(c).includes(p))];
    return supabase.from('classes').update({ ppt_paths: paths, ppt_path: paths[0] || null }).eq('id', classId);
  };

  const confirmUpload = async () => {
    if (!review) return;
    setBusy(true);
    setError(null);
    const byClass = new Map<string, string[]>();
    for (const r of review) {
      if (!r.classId) continue;
      const path = await uploadImage(r.file, userId, 'class-ppt');
      if (!path) { setError(`Upload failed for ${r.file.name}.`); setBusy(false); return; }
      byClass.set(r.classId, [...(byClass.get(r.classId) || []), path]);
    }
    for (const [classId, paths] of byClass) {
      const { error: err } = await attach(classId, paths);
      if (err) { setError(err.message); setBusy(false); return; }
    }
    setBusy(false);
    setReview(null);
    onChanged();
  };

  const reuse = async (classId: string, paths: string[]) => {
    setBusy(true);
    const { error: err } = await attach(classId, paths);
    setBusy(false);
    if (err) setError(err.message);
    else onChanged();
  };

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <button onClick={() => shift(-1)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Previous month"><ChevronLeft className="w-4 h-4" /></button>
        <p className="font-semibold text-slate-700 w-36 text-center">{first.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}</p>
        <button onClick={() => shift(1)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Next month"><ChevronRight className="w-4 h-4" /></button>
        {month !== today.substring(0, 7) && <button onClick={() => setMonth(today.substring(0, 7))} className="text-xs font-semibold text-violet-600 hover:text-violet-700">Today</button>}
        <span className="text-xs text-slate-500 ml-auto">
          {inMonth.length} class{inMonth.length === 1 ? '' : 'es'}{missing.length ? ` · ${missing.length} without slides` : ''}
        </span>
        <button onClick={() => fileInput.current?.click()} disabled={inMonth.length === 0} className="btn-secondary py-1.5" title="Choose several PPT/PDF files — each is matched to a class this month">
          <FileUp className="w-4 h-4 text-violet-600" /> Match PPTs
        </button>
        <input ref={fileInput} type="file" accept=".ppt,.pptx,.pdf,.key" multiple className="hidden" onChange={(e) => pickFiles(e.target.files)} />
      </div>

      {reusable.length > 0 && (
        <div className="mb-3 rounded-xl border border-violet-200 bg-violet-50 p-3 space-y-1.5">
          <p className="text-xs font-semibold text-violet-700 inline-flex items-center gap-1"><Recycle className="w-3.5 h-3.5" /> Slides from earlier classes on the same topic</p>
          {reusable.map(({ c, from }) => (
            <div key={c.id} className="flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-700 font-medium">{c.topic}</span>
              <span className="text-slate-400">← {from.topic} ({from.class_date ? new Date(from.class_date).toLocaleDateString('en-GB', { month: 'short', year: 'numeric' }) : 'undated'})</span>
              <button onClick={() => reuse(c.id, from.ppt_paths)} disabled={busy} className="ml-auto font-semibold text-violet-600 hover:text-violet-700 disabled:opacity-50">Use these slides</button>
            </div>
          ))}
        </div>
      )}
      {error && !review && <p className="text-sm text-rose-600 mb-2">{error}</p>}

      <div className="grid grid-cols-7 gap-px rounded-xl overflow-hidden border border-slate-200 bg-slate-200 text-xs">
        {WEEKDAYS.map((d) => <div key={d} className="bg-slate-50 px-1.5 py-1 font-semibold text-slate-500 text-center">{d}</div>)}
        {cells.map((d, i) => (
          <div key={d || `blank-${i}`} className={`min-h-[78px] p-1 ${d ? 'bg-white' : 'bg-slate-50'}`}>
            {d && (
              <>
                <p className={`text-[11px] mb-0.5 ${d === today ? 'inline-flex w-5 h-5 items-center justify-center rounded-full bg-violet-600 text-white font-semibold' : 'text-slate-400'}`}>{Number(d.slice(8))}</p>
                <div className="space-y-0.5">
                  {(byDay.get(d) || []).map((c) => {
                    const has = filesOf(c).length > 0;
                    return (
                      <button
                        key={c.id}
                        onClick={() => onEdit(c)}
                        title={`${c.topic || 'Class'}${c.class_time ? ` · ${c.class_time}` : ''}${has ? '' : ' — no slides yet'}`}
                        className={`w-full text-left truncate rounded px-1 py-0.5 text-[11px] font-medium ${has ? 'bg-violet-100 text-violet-700' : 'border border-dashed border-amber-300 text-amber-700'}`}
                      >
                        {has && <Presentation className="inline w-3 h-3 mr-0.5 -mt-0.5" />}{c.topic || c.class_type || 'Class'}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 mt-2">Solid = slides attached · dashed = no slides yet. Tap a class to edit it.</p>

      {review && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => !busy && setReview(null)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-lg font-semibold text-slate-800">Match slides to classes</h2>
              <button onClick={() => setReview(null)} disabled={busy} className="text-slate-400 hover:text-slate-600" aria-label="Close"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-xs text-slate-500 mb-4">Matched by topic words and any date in the file name. Check each one — nothing is uploaded until you confirm.</p>
            <div className="space-y-3">
              {review.map((r, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-700 truncate mb-1.5">{r.file.name}</p>
                  <select
                    value={r.classId}
                    onChange={(e) => setReview(review.map((x, j) => (j === i ? { ...x, classId: e.target.value } : x)))}
                    className={`form-input py-1.5 text-sm ${r.classId ? '' : 'border-amber-300'}`}
                  >
                    <option value="">Skip this file</option>
                    {inMonth.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.class_date ? new Date(c.class_date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' }) : ''} — {c.topic || c.class_type || 'Class'}{filesOf(c).length ? ' (has slides)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-rose-600 mt-3">{error}</p>}
            <button onClick={confirmUpload} disabled={busy || review.every((r) => !r.classId)} className="mt-4 w-full py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition disabled:opacity-60">
              {busy ? 'Uploading…' : `Upload ${review.filter((r) => r.classId).length} file(s)`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
