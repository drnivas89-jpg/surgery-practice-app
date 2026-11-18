import { useEffect, useState } from 'react';
import { X, Trash2, RotateCcw, AlertCircle, CheckCircle2 } from 'lucide-react';
import { BinEntry, BIN_RETENTION_DAYS, deleteForever, listBin, purgeExpired, restoreFromBin } from '@/lib/recycleBin';

const KIND_LABEL: Record<string, string> = {
  case: 'Surgical case', surgery: 'Surgery', visit: 'Follow-up visit', pathology: 'Pathology / HPE', payment: 'Payment',
  investigation: 'Investigation', vitals: 'Vitals', day: 'Day record', class: 'Class', daily_entry: 'Daily entry',
  revenue: 'Revenue transaction', col_credit: 'COL credit', publication: 'Publication',
};

const daysLeft = (deletedAt: string) => Math.max(0, BIN_RETENTION_DAYS - Math.floor((Date.now() - new Date(deletedAt).getTime()) / 86400000));
const rowCount = (e: BinEntry) => Object.values(e.snapshot.tables || {}).reduce((s, rows) => s + rows.length, 0);

export default function RecycleBinModal({ onClose }: { onClose: () => void }) {
  const [entries, setEntries] = useState<BinEntry[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  const load = async () => {
    await purgeExpired();
    setEntries(await listBin());
  };
  useEffect(() => { load(); }, []);

  const restore = async (e: BinEntry) => {
    setBusy(e.id);
    setMessage(null);
    const { error } = await restoreFromBin(e);
    setBusy(null);
    setMessage(error ? { ok: false, text: error } : { ok: true, text: `Restored “${e.label || KIND_LABEL[e.kind] || e.kind}”. Refresh the page to see it.` });
    load();
  };

  const remove = async (id: string) => {
    setBusy(id);
    await deleteForever(id);
    setBusy(null);
    setConfirmId(null);
    load();
  };

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[88vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100">
          <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><Trash2 className="w-5 h-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Recycle bin</h2>
            <p className="text-xs text-slate-500">Deleted items are kept for {BIN_RETENTION_DAYS} days</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        {message && (
          <p className={`mx-5 mt-4 text-sm rounded-lg p-3 flex items-start gap-2 ${message.ok ? 'text-emerald-700 bg-emerald-50' : 'text-red-600 bg-red-50'}`}>
            {message.ok ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" /> : <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />} {message.text}
          </p>
        )}

        <div className="overflow-y-auto p-3 flex-1">
          {entries === null ? (
            <p className="text-sm text-slate-400 text-center py-10">Loading…</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">The recycle bin is empty.</p>
          ) : entries.map((e) => (
            <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-3 hover:bg-slate-50">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-800 truncate">{e.label || KIND_LABEL[e.kind] || e.kind}</p>
                <p className="text-xs text-slate-500">
                  {KIND_LABEL[e.kind] || e.kind} · deleted {new Date(e.deleted_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
                  {rowCount(e) > 1 ? ` · ${rowCount(e)} records` : ''} · {daysLeft(e.deleted_at)} days left
                </p>
              </div>
              {confirmId === e.id ? (
                <>
                  <button onClick={() => remove(e.id)} disabled={busy === e.id} className="text-xs font-semibold text-white bg-red-600 hover:bg-red-700 px-3 py-1.5 rounded-lg">Delete forever</button>
                  <button onClick={() => setConfirmId(null)} className="text-xs text-slate-500 px-2 py-1.5">Keep</button>
                </>
              ) : (
                <>
                  <button onClick={() => restore(e)} disabled={!!busy} className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg disabled:opacity-50">
                    <RotateCcw className="w-3.5 h-3.5" /> {busy === e.id ? 'Restoring…' : 'Restore'}
                  </button>
                  <button onClick={() => setConfirmId(e.id)} disabled={!!busy} className="p-1.5 text-slate-400 hover:text-red-600 rounded-lg hover:bg-red-50" aria-label="Delete forever">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
