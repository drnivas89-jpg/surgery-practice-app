import { useState } from 'react';
import { CalendarCheck, Pencil } from 'lucide-react';
import type { Attendance } from '@/lib/types';
import { HospitalQuota, leaveBalance, QUOTA_KEYS } from '@/lib/leaveBalance';

interface Props {
  hospitalId: string;
  attendance: Attendance[];
  quota: HospitalQuota | undefined;
  available: boolean;
  onSave: (quota: HospitalQuota) => Promise<string | null>;
}

// Yearly leave balance for one hospital card. Quotas are entered once per
// hospital; used days come from attendance marked as leave this year.
export default function LeaveBalance({ hospitalId, attendance, quota, available, onSave }: Props) {
  const year = new Date().getFullYear();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const rows = leaveBalance(attendance, hospitalId, year, quota);

  const startEdit = () => {
    setDraft(Object.fromEntries(QUOTA_KEYS.map(({ key }) => [key, quota?.[key] ? String(quota[key]) : ''])));
    setError(null);
    setEditing(true);
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: HospitalQuota = {};
    for (const { key } of QUOTA_KEYS) {
      const n = Number(draft[key]);
      if (draft[key]?.trim() && Number.isFinite(n) && n > 0) next[key] = Math.round(n);
    }
    const err = await onSave(next);
    if (err) setError(err);
    else setEditing(false);
  };

  if (!available) return null;

  if (editing) {
    return (
      <form onSubmit={submit} className="mt-3 pt-3 border-t border-slate-100 space-y-2">
        <p className="text-[10px] font-medium text-slate-400 uppercase">Yearly leave quota (days)</p>
        <div className="grid grid-cols-3 gap-2">
          {QUOTA_KEYS.map(({ key, label }) => (
            <label key={key} className="text-xs text-slate-500">
              {label}
              <input
                type="number" min={0} inputMode="numeric" value={draft[key] || ''}
                onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
                className="form-input mt-1 py-1.5 text-sm" placeholder="—"
              />
            </label>
          ))}
        </div>
        {error && <p className="text-xs text-rose-600">{error}</p>}
        <div className="flex gap-2">
          <button type="submit" className="px-3 py-1.5 bg-sky-600 text-white rounded-lg text-xs font-semibold hover:bg-sky-700">Save</button>
          <button type="button" onClick={() => setEditing(false)} className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:bg-slate-100">Cancel</button>
        </div>
      </form>
    );
  }

  return (
    <div className="mt-3 pt-3 border-t border-slate-100">
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] font-medium text-slate-400 uppercase inline-flex items-center gap-1"><CalendarCheck className="w-3 h-3" /> Leave balance {year}</p>
        <button type="button" onClick={startEdit} className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 inline-flex items-center gap-1">
          <Pencil className="w-3 h-3" /> {rows.length ? 'Edit quota' : 'Set quota'}
        </button>
      </div>
      {rows.length === 0 ? (
        <p className="text-xs text-slate-400">Set your yearly CL / Medical / PDO entitlement to track what's left.</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = Math.min(100, (r.used / r.quota) * 100);
            return (
              <div key={r.key} className="flex items-center gap-2 text-xs">
                <span className="w-14 text-slate-500">{r.label}</span>
                <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
                  <div className={`h-full rounded-full ${r.left < 0 ? 'bg-rose-500' : r.left <= 2 ? 'bg-amber-500' : 'bg-teal-500'}`} style={{ width: `${pct}%` }} />
                </div>
                <span className={`w-28 text-right font-semibold ${r.left < 0 ? 'text-rose-600' : 'text-slate-700'}`}>
                  {r.left < 0 ? `${-r.left} over` : `${r.left} left`} <span className="font-normal text-slate-400">({r.used}/{r.quota})</span>
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
