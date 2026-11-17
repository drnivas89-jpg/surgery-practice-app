import { useState } from 'react';
import { X, DatabaseBackup, FileSpreadsheet, FileJson, CheckCircle2, AlertCircle } from 'lucide-react';
import { fetchAllData, downloadExcelBackup, downloadJsonBackup, recordBackupDone, lastBackupDate, BackupData } from '@/lib/backup';
import { formatDate } from '@/lib/helpers';

export default function BackupModal({ onClose }: { onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cache, setCache] = useState<BackupData | null>(null);
  const last = lastBackupDate();

  const run = async (kind: 'excel' | 'json') => {
    setError(null);
    setDone(null);
    try {
      let data = cache;
      if (!data) {
        data = await fetchAllData((t) => setBusy(`Reading ${t.replace(/_/g, ' ')}…`));
        setCache(data);
      }
      setBusy('Preparing file…');
      if (kind === 'excel') await downloadExcelBackup(data); else downloadJsonBackup(data);
      recordBackupDone();
      const total = Object.values(data).reduce((s, rows) => s + rows.length, 0);
      setDone(`${kind === 'excel' ? 'Excel' : 'JSON'} backup downloaded — ${total.toLocaleString('en-IN')} records.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup failed.');
    } finally {
      setBusy(null);
    }
  };

  const option = (kind: 'excel' | 'json', Icon: typeof FileSpreadsheet, title: string, hint: string, tone: string) => (
    <button
      onClick={() => run(kind)}
      disabled={!!busy}
      className="w-full flex items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-sky-300 hover:bg-sky-50/40 transition disabled:opacity-50"
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${tone}`}><Icon className="w-5 h-5" /></div>
      <div>
        <p className="text-sm font-semibold text-slate-800">{title}</p>
        <p className="text-xs text-slate-500 mt-0.5">{hint}</p>
      </div>
    </button>
  );

  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-2xl shadow-2xl p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-sky-100 text-sky-600 flex items-center justify-center"><DatabaseBackup className="w-5 h-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">Backup your data</h2>
            <p className="text-xs text-slate-500">{last ? `Last backup on this device: ${formatDate(last)}` : 'No backup taken on this device yet'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-2.5">
          {option('excel', FileSpreadsheet, 'Excel workbook', 'Readable — one sheet per record type. Open in Excel or Google Sheets.', 'bg-emerald-100 text-emerald-600')}
          {option('json', FileJson, 'Complete JSON file', 'Every field exactly as stored — keep this one for a full restore.', 'bg-violet-100 text-violet-600')}
        </div>

        {busy && <p className="text-sm text-slate-500 mt-4 flex items-center gap-2"><span className="w-4 h-4 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" /> {busy}</p>}
        {done && <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3 mt-4 flex items-center gap-2"><CheckCircle2 className="w-4 h-4 flex-shrink-0" /> {done}</p>}
        {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg p-3 mt-4 flex items-center gap-2"><AlertCircle className="w-4 h-4 flex-shrink-0" /> {error}</p>}

        <p className="text-[11px] text-slate-400 mt-4">Photos and scans stay safely in your Supabase storage; the backup lists where each one is stored. Save backup files somewhere safe, such as Google Drive.</p>
      </div>
    </div>
  );
}
