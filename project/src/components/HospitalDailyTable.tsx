import { useMemo, useState } from 'react';
import { formatDate, formatCurrency } from '@/lib/helpers';
import { DailyRow } from '@/lib/hospitalSummary';
import { Pencil, Trash2, ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react';

export type { DailyRow };

const STATUS_FILTERS = ['All', 'Present', '24 Hrs Duty', 'Leave', 'Extra Duty', 'Missing', 'Zero Activity'] as const;
type StatusFilter = typeof STATUS_FILTERS[number];

const PAGE_SIZE = 12;

function statusBadgeClass(label: string): string {
  if (label === 'Present') return 'bg-emerald-50 text-emerald-700';
  if (label === '24 Hrs Duty') return 'bg-sky-50 text-sky-700';
  if (label.startsWith('Leave')) return 'bg-red-50 text-red-700';
  if (label === 'Extra Duty') return 'bg-amber-50 text-amber-700';
  return 'bg-slate-100 text-slate-600';
}

interface Props {
  rows: DailyRow[];
  onEditDate: (date: string) => void;
  onDeleteDate: (date: string) => void;
}

// Section 2 / Level-3 of the dashboard hierarchy: a filterable, paginated,
// color-coded date-wise table for a single hospital. Red rows = nothing at
// all logged that date (missing record). Yellow rows = attendance marked
// Present but zero clinical activity (OP/IP/Opinion all 0) — an explicit
// visual alert distinct from a genuinely missing day.
export default function HospitalDailyTable({ rows, onEditDate, onDeleteDate }: Props) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('All');
  const [page, setPage] = useState(0);

  const filtered = useMemo(() => {
    switch (statusFilter) {
      case 'All': return rows;
      case 'Missing': return rows.filter((r) => r.isMissing);
      case 'Zero Activity': return rows.filter((r) => r.isZeroActivity);
      case 'Leave': return rows.filter((r) => r.attendanceStatusLabel?.startsWith('Leave'));
      default: return rows.filter((r) => r.attendanceStatusLabel === statusFilter);
    }
  }, [rows, statusFilter]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  const changeFilter = (f: StatusFilter) => { setStatusFilter(f); setPage(0); };

  return (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="p-4 border-b border-slate-100 flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => changeFilter(f)}
            className={`text-xs font-medium px-3 py-1.5 rounded-full transition ${
              statusFilter === f ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
            }`}
          >
            {f}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 text-xs text-slate-400">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-red-100 border border-red-300" /> Missing</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-amber-100 border border-amber-300" /> Zero activity</span>
        </div>
      </div>

      {pageRows.length === 0 ? (
        <p className="text-sm text-slate-400 py-8 text-center">No dates match this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 bg-slate-50 text-left text-xs text-slate-500 uppercase tracking-wide">
                <th className="px-3 py-2.5 font-medium">Date</th>
                <th className="px-3 py-2.5 font-medium">Hospital</th>
                <th className="px-3 py-2.5 font-medium">Attendance</th>
                <th className="px-3 py-2.5 font-medium text-right">OP</th>
                <th className="px-3 py-2.5 font-medium text-right">IP</th>
                <th className="px-3 py-2.5 font-medium text-right">Opinions</th>
                <th className="px-3 py-2.5 font-medium text-right">Surgeries</th>
                <th className="px-3 py-2.5 font-medium text-right">Fees Gen.</th>
                <th className="px-3 py-2.5 font-medium text-right">Fees Rec.</th>
                <th className="px-3 py-2.5 font-medium text-right">Pending</th>
                <th className="px-3 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((r) => {
                const rowClass = r.isMissing
                  ? 'bg-red-50/70 hover:bg-red-50'
                  : r.isZeroActivity
                  ? 'bg-amber-50/70 hover:bg-amber-50'
                  : 'hover:bg-slate-50';
                return (
                  <tr key={r.date} className={`border-b border-slate-50 group transition ${rowClass}`}>
                    <td className="px-3 py-2.5 font-medium text-slate-700 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        {r.isMissing && <AlertTriangle className="w-3.5 h-3.5 text-red-500 flex-shrink-0" />}
                        {formatDate(r.date)}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{r.hospitalName}</td>
                    <td className="px-3 py-2.5">
                      {r.attendanceStatusLabel ? (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusBadgeClass(r.attendanceStatusLabel)}`}
                          title={r.colReason || undefined}
                        >
                          {r.attendanceStatusLabel}
                        </span>
                      ) : (
                        <span className="text-xs font-medium text-red-600">No Entry</span>
                      )}
                      {r.colReason && <p className="text-[10px] text-slate-400 mt-0.5 truncate max-w-[160px]">{r.colReason}</p>}
                    </td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{r.opCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{r.ipCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{r.opinionCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{r.surgeriesCount}</td>
                    <td className="px-3 py-2.5 text-right text-slate-600">{formatCurrency(r.feesGenerated)}</td>
                    <td className="px-3 py-2.5 text-right text-emerald-600 font-medium">{formatCurrency(r.feesReceived)}</td>
                    <td className={`px-3 py-2.5 text-right font-medium ${r.pendingFees > 0 ? 'text-red-600' : 'text-slate-400'}`}>{formatCurrency(r.pendingFees)}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition">
                        <button onClick={() => onEditDate(r.date)} className="p-1.5 rounded-lg text-slate-400 hover:bg-sky-50 hover:text-sky-600 transition" title="Edit this date">
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        {r.hasAnyRecord && (
                          <button onClick={() => onDeleteDate(r.date)} className="p-1.5 rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600 transition" title="Delete this date's records">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pageCount > 1 && (
        <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
          <p className="text-xs text-slate-400">Page {currentPage + 1} of {pageCount} · {filtered.length} dates</p>
          <div className="flex items-center gap-1">
            <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={currentPage >= pageCount - 1} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 disabled:opacity-30 transition">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
