import { X, PartyPopper, Zap, CalendarCheck2, CalendarX2, Clock } from 'lucide-react';
import { formatDate, daysUntil } from '@/lib/helpers';
import { ColCreditDate } from '@/lib/col';

export type ColDetailKind = 'used' | 'available' | 'wasted';

export interface ColDetailItem {
  credit: ColCreditDate;
  usedOn?: string;
}

const META: Record<ColDetailKind, { title: string; empty: string; icon: typeof Zap; tone: string }> = {
  used: { title: 'COL availed', empty: 'No COL leave taken in this year.', icon: CalendarCheck2, tone: 'text-sky-600 bg-sky-100' },
  available: { title: 'COL available', empty: 'No COL credits available right now.', icon: Zap, tone: 'text-emerald-600 bg-emerald-100' },
  wasted: { title: 'COL wasted', empty: 'No COL credits wasted in this year — nice.', icon: CalendarX2, tone: 'text-rose-600 bg-rose-100' },
};

export default function ColDetailsModal({ kind, year, items, onClose }: { kind: ColDetailKind; year: number; items: ColDetailItem[]; onClose: () => void }) {
  const meta = META[kind];
  const Icon = meta.icon;
  return (
    <div className="fixed inset-0 bg-slate-950/40 backdrop-blur-[2px] flex items-end sm:items-center justify-center z-50 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 p-5 border-b border-slate-100">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.tone}`}><Icon className="w-5 h-5" /></div>
          <div className="flex-1">
            <h2 className="font-semibold text-slate-800">{meta.title}</h2>
            <p className="text-xs text-slate-500">{kind === 'available' ? 'Valid right now, soonest expiry first' : `Calendar year ${year}`} · {items.length} credit{items.length === 1 ? '' : 's'}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100" aria-label="Close"><X className="w-5 h-5" /></button>
        </div>
        <div className="overflow-y-auto p-3 space-y-2">
          {items.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-10">{meta.empty}</p>
          ) : items.map(({ credit, usedOn }) => {
            const left = daysUntil(credit.expiryDate);
            const expiringSoon = kind === 'available' && left !== null && left <= 30;
            return (
              <div key={`${credit.attendanceId}-${usedOn || ''}`} className="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3">
                <div className="w-12 text-center rounded-lg bg-white border border-slate-200 py-1 flex-shrink-0">
                  <p className="text-[10px] font-semibold text-slate-400 uppercase leading-none">{new Date(`${credit.date}T00:00:00`).toLocaleDateString('en-GB', { month: 'short' })}</p>
                  <p className="text-lg font-bold text-slate-800 leading-tight">{Number(credit.date.substring(8, 10))}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                    {credit.source === 'holiday' && <PartyPopper className="w-3.5 h-3.5 text-amber-500 flex-shrink-0" />}
                    <span className="truncate">{credit.reason || (credit.source === 'holiday' ? 'Government holiday duty' : 'COL duty')}</span>
                  </p>
                  <p className="text-xs text-slate-500 truncate">{credit.hospitalName} · worked {formatDate(credit.date)}</p>
                  <p className="text-xs mt-1">
                    {kind === 'used' && usedOn && <span className="text-sky-700 font-medium">Availed on {formatDate(usedOn)}</span>}
                    {kind === 'available' && (
                      <span className={`inline-flex items-center gap-1 font-medium ${expiringSoon ? 'text-amber-700' : 'text-emerald-700'}`}>
                        <Clock className="w-3 h-3" /> Valid till {formatDate(credit.expiryDate)}{left !== null ? ` · ${left === 0 ? 'last day' : `${left} days left`}` : ''}
                      </span>
                    )}
                    {kind === 'wasted' && <span className="text-rose-600 font-medium">Expired unused on {formatDate(credit.expiryDate)}</span>}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
