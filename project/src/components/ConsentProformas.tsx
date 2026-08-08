import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { ConsentProforma } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { FileText, Plus, Search, Edit2, Trash2, X, Save, Languages, Stethoscope, Download, FileType } from 'lucide-react';
import { downloadProformaPdf, downloadProformaWord } from '@/lib/proformaExport';

const LANGUAGES = ['English', 'Hindi', 'Tamil', 'Telugu', 'Kannada', 'Malayalam', 'Marathi', 'Bengali', 'Gujarati', 'Punjabi', 'Urdu', 'Arabic', 'Other'];

export default function ConsentProformas() {
  const { user } = useAuth();
  const [proformas, setProformas] = useState<ConsentProforma[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [langFilter, setLangFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [procName, setProcName] = useState('');
  const [language, setLanguage] = useState('English');
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data, error } = await supabase
        .from('consent_proformas')
        .select('*')
        .order('procedure_name', { ascending: true });
      if (!error) setProformas(data || []);
      setLoading(false);
    })();
  }, [user]);

  const filtered = proformas.filter((p) => {
    const matchesSearch =
      !search ||
      p.procedure_name.toLowerCase().includes(search.toLowerCase()) ||
      p.content.toLowerCase().includes(search.toLowerCase());
    const matchesLang = !langFilter || p.language === langFilter;
    return matchesSearch && matchesLang;
  });

  const resetForm = () => {
    setProcName('');
    setLanguage('English');
    setContent('');
    setEditingId(null);
    setError('');
  };

  const openNew = () => {
    resetForm();
    setShowForm(true);
  };

  const openEdit = (p: ConsentProforma) => {
    setProcName(p.procedure_name);
    setLanguage(p.language);
    setContent(p.content);
    setEditingId(p.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!procName.trim()) {
      setError('Procedure name is required');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      procedure_name: procName.trim(),
      language,
      content,
      updated_at: new Date().toISOString(),
    };
    let result;
    if (editingId) {
      result = await supabase.from('consent_proformas').update(payload).eq('id', editingId);
    } else {
      result = await supabase.from('consent_proformas').insert({ ...payload, created_by: user?.id });
    }
    setSaving(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    const { data } = await supabase.from('consent_proformas').select('*').order('procedure_name', { ascending: true });
    setProformas(data || []);
    resetForm();
    setShowForm(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this consent proforma? This cannot be undone.')) return;
    const { error } = await supabase.from('consent_proformas').delete().eq('id', id);
    if (!error) setProformas(proformas.filter((p) => p.id !== id));
  };

  const handleDownloadPdf = (p: ConsentProforma) => {
    downloadProformaPdf(p);
  };

  const handleDownloadWord = async (p: ConsentProforma) => {
    setDownloadingId(p.id);
    try {
      await downloadProformaWord(p);
    } catch (e) {
      console.error(e);
    } finally {
      setDownloadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Consent Proformas</h1>
          <p className="text-slate-500 text-sm mt-0.5">A shared library of typed consent forms for various procedures in multiple languages</p>
        </div>
        <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition">
          <Plus className="w-4 h-4" /> New Proforma
        </button>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by procedure or content..."
            className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <select value={langFilter} onChange={(e) => setLangFilter(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500">
          <option value="">All languages</option>
          {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 mb-1">No consent proformas found.</p>
          <p className="text-sm text-slate-400">Create one to start building your shared library.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => (
            <div key={p.id} className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col hover:shadow-md transition">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-sky-50 text-sky-600 flex items-center justify-center flex-shrink-0">
                    <Stethoscope className="w-4 h-4" />
                  </div>
                  <h3 className="font-semibold text-slate-800 truncate">{p.procedure_name}</h3>
                </div>
              </div>
              <div className="flex items-center gap-1.5 mb-3">
                <Languages className="w-3.5 h-3.5 text-slate-400" />
                <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded">{p.language}</span>
              </div>
              <p className="text-sm text-slate-500 line-clamp-3 flex-1 whitespace-pre-wrap">{p.content || 'No content yet'}</p>
              <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                <span className="text-xs text-slate-400">Updated {formatDate(p.updated_at)}</span>
                <div className="flex gap-1">
                  <button onClick={() => handleDownloadPdf(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 transition" title="Download PDF">
                    <Download className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDownloadWord(p)} disabled={downloadingId === p.id} className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition disabled:opacity-50" title="Download Word">
                    <FileType className="w-4 h-4" />
                  </button>
                  <button onClick={() => openEdit(p)} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-sky-600 transition" title="Edit">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition" title="Delete">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {showForm && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-semibold text-slate-800">{editingId ? 'Edit Proforma' : 'New Consent Proforma'}</h2>
              <button onClick={() => { setShowForm(false); resetForm(); }} className="text-slate-400 hover:text-slate-600 transition">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4 overflow-y-auto">
              {error && <div className="p-3 rounded-lg bg-red-50 text-red-600 text-sm">{error}</div>}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Procedure Name</label>
                  <input
                    type="text"
                    value={procName}
                    onChange={(e) => setProcName(e.target.value)}
                    placeholder="e.g. Laparoscopic Cholecystectomy"
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600 mb-1.5">Language</label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-600 mb-1.5">Consent Proforma Content</label>
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={14}
                  placeholder="Type the full consent proforma text here. Include patient declaration, procedure description, risks, and signature sections..."
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-sky-500 resize-y"
                />
                <p className="text-xs text-slate-400 mt-1">This is saved permanently and available to everyone who can access the app.</p>
              </div>
            </div>
            <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-100">
              <button onClick={() => { setShowForm(false); resetForm(); }} className="px-4 py-2 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 transition">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-4 py-2 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition disabled:opacity-50"
              >
                <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Proforma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
