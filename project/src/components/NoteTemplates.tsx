import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { FileText, Save, Trash2, ChevronDown } from 'lucide-react';

interface Template { id: string; name: string; procedure_name: string; content: string }

// Operative-note templates: pick one to insert, or save the current notes
// as a template. Templates for the current procedure are listed first.
export default function NoteTemplates({ procedureName, notes, onInsert }: { procedureName: string; notes: string; onInsert: (content: string) => void }) {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  const load = async () => {
    const { data } = await supabase.from('note_templates').select('id, name, procedure_name, content').order('name');
    setTemplates(data || []);
  };
  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const proc = procedureName.trim().toLowerCase();
  const sorted = [...templates].sort((a, b) => Number(b.procedure_name.toLowerCase() === proc) - Number(a.procedure_name.toLowerCase() === proc));

  const saveTemplate = async () => {
    if (!notes.trim()) { setMessage('Write the notes first.'); return; }
    setSaving(true);
    const name = procedureName.trim() || `Template ${templates.length + 1}`;
    const { error } = await supabase.from('note_templates').insert({ name, procedure_name: procedureName.trim(), content: notes });
    setSaving(false);
    setMessage(error ? (error.message.includes('note_templates') ? 'Run the latest database update first.' : error.message) : `Saved as “${name}”.`);
    if (!error) load();
  };

  const remove = async (id: string) => {
    await supabase.from('note_templates').delete().eq('id', id);
    load();
  };

  return (
    <div className="relative inline-flex items-center gap-1" ref={box}>
      <button type="button" onClick={() => setOpen(!open)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200">
        <FileText className="w-3.5 h-3.5" /> Templates{templates.length ? ` (${templates.length})` : ''} <ChevronDown className="w-3 h-3" />
      </button>
      <button type="button" onClick={saveTemplate} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold bg-slate-100 text-slate-700 hover:bg-slate-200 disabled:opacity-50" title="Save these notes as a template">
        <Save className="w-3.5 h-3.5" /> Save as template
      </button>
      {message && <span className="text-[11px] text-slate-500">{message}</span>}
      {open && (
        <div className="absolute left-0 top-full mt-1 z-30 w-72 max-h-72 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl p-1">
          {sorted.length === 0 ? (
            <p className="text-xs text-slate-400 p-3">No templates yet — write a note and tap “Save as template”.</p>
          ) : sorted.map((t) => (
            <div key={t.id} className="flex items-start gap-1 rounded-lg hover:bg-slate-50">
              <button type="button" onClick={() => { onInsert(t.content); setOpen(false); }} className="flex-1 text-left px-3 py-2 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{t.name}{t.procedure_name.toLowerCase() === proc && proc ? ' ★' : ''}</p>
                <p className="text-[11px] text-slate-400 truncate">{t.content.slice(0, 80)}</p>
              </button>
              <button type="button" onClick={() => remove(t.id)} className="p-2 text-slate-300 hover:text-red-500" aria-label={`Delete template ${t.name}`}><Trash2 className="w-3.5 h-3.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
