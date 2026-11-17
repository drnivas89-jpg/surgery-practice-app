import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { formatDate } from '@/lib/helpers';
import { fetchGovHolidays } from '@/lib/holidays';
import { Search, UserRound, Building2, PartyPopper, GraduationCap, Activity, X } from 'lucide-react';
import type { View } from './Layout';

interface Result {
  key: string;
  icon: typeof Search;
  title: string;
  subtitle: string;
  action: () => void;
}

interface Index {
  patients: { id: string; patient_name: string; unique_id: string; diagnosis: string | null; mobile_number: string | null; surgery_date: string | null; hospital: { name: string } | null }[];
  surgeries: { patient_id: string; procedure_name: string; surgery_date: string | null }[];
  hospitals: { id: string; name: string }[];
  holidays: { holiday_date: string; name: string; is_cancelled: boolean }[];
  classes: { id: string; topic: string; class_type: string; class_date: string | null }[];
}

const MAX_PER_GROUP = 6;

export default function SearchPalette({ onClose, onNavigate, onOpenPatient }: {
  onClose: () => void;
  onNavigate: (view: View) => void;
  onOpenPatient: (id: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [index, setIndex] = useState<Index | null>(null);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    (async () => {
      const [{ data: p }, { data: s }, { data: h }, hol, { data: c }] = await Promise.all([
        supabase.from('patients').select('id, patient_name, unique_id, diagnosis, mobile_number, surgery_date, hospital:hospitals(name)'),
        supabase.from('surgeries').select('patient_id, procedure_name, surgery_date'),
        supabase.from('hospitals').select('id, name'),
        fetchGovHolidays(),
        supabase.from('classes').select('id, topic, class_type, class_date'),
      ]);
      setIndex({
        patients: (p || []) as unknown as Index['patients'],
        surgeries: s || [],
        hospitals: h || [],
        holidays: hol.filter((x) => !x.is_cancelled),
        classes: c || [],
      });
    })();
  }, []);

  const results = useMemo<Result[]>(() => {
    const q = query.trim().toLowerCase();
    if (!index || q.length < 2) return [];
    const has = (...vals: (string | null | undefined)[]) => vals.some((v) => (v || '').toLowerCase().includes(q));
    const patientById = new Map(index.patients.map((p) => [p.id, p]));
    const out: Result[] = [];
    const go = (fn: () => void) => () => { fn(); onClose(); };

    index.patients.filter((p) => has(p.patient_name, p.unique_id, p.diagnosis, p.mobile_number)).slice(0, MAX_PER_GROUP).forEach((p) => out.push({
      key: `p-${p.id}`, icon: UserRound, title: p.patient_name,
      subtitle: [p.unique_id, p.hospital?.name, p.diagnosis].filter(Boolean).join(' · '),
      action: go(() => onOpenPatient(p.id)),
    }));
    index.surgeries.filter((s) => has(s.procedure_name)).slice(0, MAX_PER_GROUP).forEach((s, i) => {
      const p = patientById.get(s.patient_id);
      out.push({
        key: `s-${s.patient_id}-${i}`, icon: Activity, title: s.procedure_name,
        subtitle: [p?.patient_name, formatDate(s.surgery_date)].filter(Boolean).join(' · '),
        action: go(() => p ? onOpenPatient(p.id) : onNavigate('patients')),
      });
    });
    index.hospitals.filter((h) => has(h.name)).slice(0, MAX_PER_GROUP).forEach((h) => out.push({
      key: `h-${h.id}`, icon: Building2, title: h.name, subtitle: 'Hospital', action: go(() => onNavigate('hospitals')),
    }));
    index.holidays.filter((h) => has(h.name)).slice(0, MAX_PER_GROUP).forEach((h) => out.push({
      key: `g-${h.holiday_date}`, icon: PartyPopper, title: h.name, subtitle: `Government holiday · ${formatDate(h.holiday_date)}`, action: go(() => onNavigate('hospitals')),
    }));
    index.classes.filter((c) => has(c.topic, c.class_type)).slice(0, MAX_PER_GROUP).forEach((c) => out.push({
      key: `c-${c.id}`, icon: GraduationCap, title: c.topic || c.class_type, subtitle: `Class · ${formatDate(c.class_date)}`, action: go(() => onNavigate('hospitals')),
    }));
    return out;
  }, [query, index, onClose, onNavigate, onOpenPatient]);

  useEffect(() => { setActive(0); }, [query]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
    else if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && results[active]) results[active].action();
  };

  return (
    <div className="fixed inset-0 z-[60] bg-slate-950/40 backdrop-blur-[2px] flex items-start justify-center p-3 sm:pt-[12vh]" onClick={onClose}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
        <div className="flex items-center gap-3 px-4 border-b border-slate-100">
          <Search className="w-5 h-5 text-slate-400" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search patients, procedures, hospitals, holidays, classes…"
            aria-label="Search everything"
            className="flex-1 py-4 text-base outline-none bg-transparent"
          />
          <button onClick={onClose} className="p-1 rounded-md text-slate-400 hover:bg-slate-100" aria-label="Close search"><X className="w-5 h-5" /></button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {!index ? (
            <p className="text-sm text-slate-400 text-center py-8">Loading…</p>
          ) : query.trim().length < 2 ? (
            <p className="text-sm text-slate-400 text-center py-8">Type at least 2 letters.</p>
          ) : results.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">Nothing matches “{query}”.</p>
          ) : results.map((r, i) => (
            <button
              key={r.key}
              onClick={r.action}
              onMouseEnter={() => setActive(i)}
              className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ${i === active ? 'bg-sky-50' : ''}`}
            >
              <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-500 flex items-center justify-center flex-shrink-0"><r.icon className="w-4 h-4" /></div>
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{r.title}</p>
                <p className="text-xs text-slate-500 truncate">{r.subtitle}</p>
              </div>
            </button>
          ))}
        </div>
        <p className="hidden sm:block text-[11px] text-slate-400 px-4 py-2 border-t border-slate-100">↑ ↓ to move · Enter to open · Esc to close</p>
      </div>
    </div>
  );
}
