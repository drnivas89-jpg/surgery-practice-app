import { useMemo, useState } from 'react';
import { formatMonth } from '@/lib/fees';
import { clavienLabel, isMajorComplication } from '@/lib/complications';

export interface InsightCase {
  date: string | null; // yyyy-mm-dd
  category: string;
  procedure: string;
  hospital: string;
  role: 'performed' | 'assisted';
  outcome: string;
  grade: string; // Clavien–Dindo value, '' when not recorded
  hpe: 'none' | 'awaiting' | 'received';
}

const TOP_N = 8;

function countBy<T>(items: T[], key: (t: T) => string): { label: string; value: number }[] {
  const map = new Map<string, number>();
  items.forEach((t) => {
    const k = key(t).trim();
    if (k) map.set(k, (map.get(k) || 0) + 1);
  });
  return Array.from(map, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value);
}

// Case-mix analytics for study/thesis use. Every chart is a single measure
// (counts), so one hue throughout; values are printed on the bars and the
// month chart has a per-bar hover readout.
export default function CaseInsights({ cases }: { cases: InsightCase[] }) {
  const years = useMemo(
    () => Array.from(new Set(cases.map((c) => c.date?.substring(0, 4)).filter(Boolean) as string[])).sort().reverse(),
    [cases]
  );
  const [year, setYear] = useState<string>('all');
  const [hover, setHover] = useState<string | null>(null);

  const scoped = year === 'all' ? cases : cases.filter((c) => c.date?.startsWith(year));

  const months = useMemo(() => {
    const keys: string[] = [];
    if (year === 'all') {
      const now = new Date();
      for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
      }
    } else {
      for (let m = 1; m <= 12; m++) keys.push(`${year}-${String(m).padStart(2, '0')}`);
    }
    return keys.map((k) => ({ key: k, value: scoped.filter((c) => c.date?.startsWith(k)).length }));
  }, [scoped, year]);
  const monthMax = Math.max(1, ...months.map((m) => m.value));

  const performed = scoped.filter((c) => c.role === 'performed').length;
  const hpeReceived = scoped.filter((c) => c.hpe === 'received').length;
  const hpeAwaiting = scoped.filter((c) => c.hpe === 'awaiting').length;
  const withOutcome = scoped.filter((c) => c.outcome.trim()).length;
  const graded = scoped.filter((c) => c.grade);
  const withComplication = graded.filter((c) => c.grade !== 'none').length;
  const major = graded.filter((c) => isMajorComplication(c.grade)).length;
  const pct = (n: number) => `${Math.round((n / graded.length) * 100)}%`;

  if (cases.length === 0) {
    return <div className="card p-8 text-center text-slate-500">Record surgical cases to see insights here.</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-slate-500">Period</span>
        {['all', ...years].map((y) => (
          <button
            key={y}
            onClick={() => setYear(y)}
            aria-pressed={year === y}
            className={`text-sm font-semibold px-3 py-1.5 rounded-full transition ${year === y ? 'bg-slate-800 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {y === 'all' ? 'Last 12 months / all' : y}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
        <Tile value={scoped.length} label="Cases" />
        <Tile value={scoped.length ? `${Math.round((performed / scoped.length) * 100)}%` : '—'} label={`Performed (${performed}) vs assisted (${scoped.length - performed})`} />
        <Tile value={hpeReceived} label={`HPE reports received${hpeAwaiting ? ` · ${hpeAwaiting} awaited` : ''}`} />
        <Tile value={withOutcome} label="Cases with outcome recorded" />
        <Tile value={graded.length ? pct(withComplication) : '—'} label={graded.length ? `Complication rate (${withComplication}/${graded.length} graded) · major ${pct(major)}` : 'Complication rate — grade cases to see it'} />
      </div>

      <div className="card p-5">
        <h3 className="font-semibold text-slate-800">Cases per month</h3>
        <p className="text-xs text-slate-500 mb-4">{year === 'all' ? 'Last 12 months' : year}</p>
        <div className="relative">
          <div className="flex items-end gap-1.5 h-44 border-b border-slate-200">
            {months.map((m) => (
              <div
                key={m.key}
                className="relative flex-1 h-full flex flex-col justify-end items-center group cursor-default"
                onMouseEnter={() => setHover(m.key)}
                onMouseLeave={() => setHover(null)}
                onTouchStart={() => setHover(m.key)}
              >
                {m.value > 0 && <span className="text-[11px] font-semibold text-slate-600 mb-1 tabular-nums">{m.value}</span>}
                <div
                  className={`w-full max-w-[36px] rounded-t transition-colors ${hover === m.key ? 'bg-sky-700' : 'bg-sky-500'}`}
                  style={{ height: `${(m.value / monthMax) * 82}%`, minHeight: m.value ? 4 : 0 }}
                />
                {hover === m.key && (
                  <div className="absolute bottom-full mb-1 z-10 whitespace-nowrap rounded-md bg-slate-800 px-2 py-1 text-xs text-white shadow-lg">
                    {formatMonth(m.key)}: <strong>{m.value}</strong> case{m.value === 1 ? '' : 's'}
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="flex gap-1.5 mt-1.5">
            {months.map((m) => (
              <span key={m.key} className="flex-1 text-center text-[10px] text-slate-400">{formatMonth(m.key).split(' ')[0]}</span>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <BarList title="By type of surgery" items={countBy(scoped, (c) => c.category || 'Unclassified')} />
        <BarList title="By hospital" items={countBy(scoped, (c) => c.hospital)} />
        <BarList title={`Top ${TOP_N} procedures`} items={countBy(scoped, (c) => c.procedure).slice(0, TOP_N)} />
        <BarList title="Complications (Clavien–Dindo)" items={countBy(graded.filter((c) => c.grade !== 'none'), (c) => clavienLabel(c.grade))} empty={graded.length ? 'No complications among graded cases.' : 'No grades recorded yet — set one when editing a surgery.'} />
        <BarList title="Recorded outcomes" items={countBy(scoped, (c) => c.outcome.toLowerCase().replace(/\s+/g, ' ').replace(/^./, (s) => s.toUpperCase())).slice(0, TOP_N)} empty="No outcomes recorded yet — add them from the Surgical Logbook." />
      </div>
    </div>
  );
}

function Tile({ value, label }: { value: number | string; label: string }) {
  return (
    <div className="card p-4">
      <p className="text-2xl font-bold text-slate-900 tabular-nums">{value}</p>
      <p className="text-xs text-slate-500 mt-0.5">{label}</p>
    </div>
  );
}

function BarList({ title, items, empty = 'No data for this period.' }: { title: string; items: { label: string; value: number }[]; empty?: string }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  const total = items.reduce((s, i) => s + i.value, 0);
  return (
    <div className="card p-5">
      <h3 className="font-semibold text-slate-800 mb-3">{title}</h3>
      {items.length === 0 ? (
        <p className="text-sm text-slate-400 py-4 text-center">{empty}</p>
      ) : (
        <div className="space-y-2.5">
          {items.map((i) => (
            <div key={i.label} title={`${i.label}: ${i.value} (${Math.round((i.value / total) * 100)}%)`}>
              <div className="flex items-baseline justify-between gap-3 text-sm mb-1">
                <span className="text-slate-700 truncate">{i.label}</span>
                <span className="text-slate-500 tabular-nums flex-shrink-0">{i.value} <span className="text-xs text-slate-400">· {Math.round((i.value / total) * 100)}%</span></span>
              </div>
              <div className="h-2 rounded-full bg-slate-100">
                <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(i.value / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
