import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Publication } from '@/lib/types';
import { uploadImage } from '@/lib/helpers';
import { BookOpen, Plus, Pencil, Trash2, X, Upload, Search, FileText } from 'lucide-react';

const PUBLICATION_TYPES = ['Paper', 'Poster', 'Journal Article', 'Case Report', 'Other'];
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export default function Publications() {
  const { user } = useAuth();
  const [publications, setPublications] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [pType, setPType] = useState('Paper');
  const [pTopic, setPTopic] = useState('');
  const [pAuthors, setPAuthors] = useState('');
  const [pMonth, setPMonth] = useState('');
  const [pYear, setPYear] = useState('');
  const [pPlatform, setPPlatform] = useState('');
  const [pNotes, setPNotes] = useState('');
  const [pFile, setPFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await supabase.from('publications').select('*').order('year', { ascending: false }).order('month', { ascending: false });
    setPublications(data || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setPType('Paper'); setPTopic(''); setPAuthors(''); setPMonth(''); setPYear('');
    setPPlatform(''); setPNotes(''); setPFile(null); setError(null);
  };

  const openEdit = (p: Publication) => {
    setEditingId(p.id);
    setPType(p.publication_type || 'Paper');
    setPTopic(p.topic || '');
    setPAuthors(p.author_details || '');
    setPMonth(p.month?.toString() || '');
    setPYear(p.year?.toString() || '');
    setPPlatform(p.platform || '');
    setPNotes(p.notes || '');
    setPFile(null);
    setError(null);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    setError(null);

    const payload: Record<string, unknown> = {
      publication_type: pType,
      topic: pTopic,
      author_details: pAuthors,
      month: pMonth ? parseInt(pMonth) : null,
      year: pYear ? parseInt(pYear) : null,
      platform: pPlatform,
      notes: pNotes,
    };

    if (pFile) {
      payload.file_path = await uploadImage(pFile, user.id, 'publication');
    } else if (!editingId) {
      payload.file_path = null;
    }

    if (editingId) {
      const { error } = await supabase.from('publications').update(payload).eq('id', editingId);
      if (error) { setError(error.message); setSaving(false); return; }
    } else {
      const { error } = await supabase.from('publications').insert({ ...payload, user_id: user.id });
      if (error) { setError(error.message); setSaving(false); return; }
    }
    setSaving(false);
    setShowForm(false);
    resetForm();
    load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this publication?')) return;
    await supabase.from('publications').delete().eq('id', id);
    load();
  };

  const filtered = publications.filter((p) => {
    const q = search.toLowerCase();
    return (
      p.topic.toLowerCase().includes(q) ||
      p.author_details.toLowerCase().includes(q) ||
      p.platform.toLowerCase().includes(q) ||
      p.publication_type.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Publications</h1>
          <p className="text-slate-500 text-sm mt-0.5">{publications.length} total publications</p>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition shadow-sm"
        >
          <Plus className="w-4 h-4" /> Add Publication
        </button>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <input
          id="pub-search"
          name="search"
          aria-label="Search publications"
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by topic, author, platform..."
          className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <BookOpen className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">No publications logged yet.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full">{p.publication_type}</span>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition">
                  <button onClick={() => openEdit(p)} className="text-slate-300 hover:text-sky-500 transition p-1"><Pencil className="w-3.5 h-3.5" /></button>
                  <button onClick={() => handleDelete(p.id)} className="text-slate-300 hover:text-red-500 transition p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                </div>
              </div>
              <p className="font-semibold text-slate-800 mb-1">{p.topic || 'Untitled'}</p>
              <p className="text-sm text-slate-500 mb-1">{p.author_details || '—'}</p>
              <p className="text-xs text-slate-400 mb-3">{p.platform || '—'}</p>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>{p.month ? MONTH_NAMES[p.month - 1] : ''} {p.year || ''}</span>
                {p.file_path && <span className="flex items-center gap-1 text-emerald-600"><FileText className="w-3.5 h-3.5" /> File attached</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => { setShowForm(false); resetForm(); }}>
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Publication' : 'Add Publication'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="p-1 rounded-lg hover:bg-slate-100 transition"><X className="w-4 h-4 text-slate-400" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-4">
              <div>
                <label htmlFor="pub-type" className="block text-sm font-medium text-slate-600 mb-1.5">Type of Publication</label>
                <select id="pub-type" name="publicationType" value={pType} onChange={(e) => setPType(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none">
                  {PUBLICATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="pub-topic" className="block text-sm font-medium text-slate-600 mb-1.5">Topic</label>
                <input id="pub-topic" name="topic" type="text" value={pTopic} onChange={(e) => setPTopic(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" autoFocus />
              </div>
              <div>
                <label htmlFor="pub-authors" className="block text-sm font-medium text-slate-600 mb-1.5">Author Details</label>
                <input id="pub-authors" name="authorDetails" type="text" value={pAuthors} onChange={(e) => setPAuthors(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. co-authors, author order" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="pub-month" className="block text-sm font-medium text-slate-600 mb-1.5">Month</label>
                  <select id="pub-month" name="month" value={pMonth} onChange={(e) => setPMonth(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 bg-white focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none">
                    <option value="">—</option>
                    {MONTH_NAMES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="pub-year" className="block text-sm font-medium text-slate-600 mb-1.5">Year</label>
                  <input id="pub-year" name="year" type="number" value={pYear} onChange={(e) => setPYear(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. 2026" />
                </div>
              </div>
              <div>
                <label htmlFor="pub-platform" className="block text-sm font-medium text-slate-600 mb-1.5">Platform / Journal</label>
                <input id="pub-platform" name="platform" type="text" value={pPlatform} onChange={(e) => setPPlatform(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="e.g. Indian Journal of Surgery" />
              </div>
              <div>
                <label htmlFor="pub-file" className="block text-sm font-medium text-slate-600 mb-1.5">Attach File (optional)</label>
                <label htmlFor="pub-file" className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-dashed border-slate-300 text-sm text-slate-500 cursor-pointer hover:border-sky-400 hover:text-sky-600 transition">
                  <Upload className="w-4 h-4" />
                  {pFile ? pFile.name : editingId ? 'Replace uploaded file' : 'Upload PDF / image'}
                </label>
                <input id="pub-file" name="file" type="file" accept="image/*,.pdf" className="hidden" onChange={(e) => setPFile(e.target.files?.[0] || null)} />
              </div>
              <div>
                <label htmlFor="pub-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
                <input id="pub-notes" name="notes" type="text" value={pNotes} onChange={(e) => setPNotes(e.target.value)} className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none" placeholder="Optional..." />
              </div>
              {error && <div className="text-sm text-red-600 bg-red-50 p-3 rounded-lg">{error}</div>}
              <button type="submit" disabled={saving} className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition disabled:opacity-60">
                {saving ? 'Saving...' : editingId ? 'Save Changes' : 'Add Publication'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
