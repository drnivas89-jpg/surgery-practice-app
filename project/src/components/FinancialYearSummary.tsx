import { useMemo, useState } from 'react';
import { CalendarRange, FileSpreadsheet } from 'lucide-react';
import { buildFySummary, formatMonth, fyLabel, fyStartYear, MonthFeeTally } from '@/lib/fees';
import { formatCurrency, todayLocalDateStr } from '@/lib/helpers';

interface Props {
  tally: MonthFeeTally[];
  hospitalName: (id: string) => string;
}

// Financial-year (April–March) roll-up of the monthly fee tally, with an
// Excel download laid out for the accountant / income-tax return.
export default function FinancialYearSummary({ tally, hospitalName }: Props) {
  const currentFy = fyStartYear(todayLocalDateStr());
  const years = useMemo(() => {
    const set = new Set(tally.map((t) => fyStartYear(t.month)));
    set.add(currentFy);
    return [...set].sort((a, b) => b - a);
  }, [tally, currentFy]);
  const [start, setStart] = useState(currentFy);
  const fy = useMemo(() => buildFySummary(tally, start), [tally, start]);
  const maxMonth = Math.max(1, ...fy.byMonth.map((m) => m.totals.received));

  const download = async () => {
    const XLSX = await import('xlsx');
    const { saveAs } = await import('file-saver');
    const head = ['', 'Fees generated', 'Fees received', 'Pending', 'Excess'];
    const row = (label: string, t: typeof fy.totals) => [label, t.generated, t.received, t.pending, t.excess];
    const summary = XLSX.utils.aoa_to_sheet([
      [`Professional fees — ${fyLabel(start)} (1 Apr ${start} – 31 Mar ${start + 1})`],
      [],
      head,
      ...fy.byHospital.map((h) => row(hospitalName(h.hospitalId), h.totals)),
      row('Total', fy.totals),
    ]);
    summary['!cols'] = [28, 16, 16, 14, 14].map((wch) => ({ wch }));
    const months = XLSX.utils.aoa_to_sheet([
      ['Month', ...fy.byHospital.map((h) => hospitalName(h.hospitalId)), 'Total received'],
      ...fy.byMonth.map((m) => [
        formatMonth(m.month),
        ...fy.byHospital.map((h) => tally.filter((t) => t.month === m.month && t.hospitalId === h.hospitalId).reduce((s, t) => s + t.received, 0)),
        m.totals.received,
      ]),
      ['Total', ...fy.byHospital.map((h) => h.totals.received), fy.totals.received],
    ]);
    months['!cols'] = [12, ...fy.byHospital.map(() => 18), 16].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, summary, 'Summary');
    XLSX.utils.book_append_sheet(wb, months, 'Month-wise received');
    const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    saveAs(new Blob([out], { type: 'application/octet-stream' }), `fees-${fyLabel(start).replace(/[^0-9]+/g, '-').replace(/^-|-$/g, '')}.xlsx`);
  };

  return (
    <div className="card p-5">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <CalendarRange className="w-4 h-4 text-slate-500" />
        <h2 className="font-semibold text-slate-700">Financial Year Summary</h2>
        <select value={start} onChange={(e) => setStart(Number(e.target.value))} className="form-input w-auto py-1.5 text-sm ml-auto" aria-label="Financial year">
          {years.map((y) => <option key={y} value={y}>{fyLabel(y)}</option>)}
        </select>
        <button onClick={download} disabled={fy.byHospital.length === 0} className="btn-secondary">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" /> Excel for CA
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {([['Generated', fy.totals.generated, 'text-slate-800'], ['Received', fy.totals.received, 'text-emerald-700'], ['Pending', fy.totals.pending, 'text-rose-600'], ['Excess', fy.totals.excess, 'text-sky-700']] as const).map(([label, v, cls]) => (
          <div key={label} className="rounded-xl bg-slate-50 p-3">
            <p className={`text-lg font-bold ${cls}`}>{formatCurrency(v)}</p>
            <p className="text-[11px] text-slate-500 uppercase">{label}</p>
          </div>
        ))}
      </div>

      {fy.byHospital.length === 0 ? (
        <p className="text-sm text-slate-400">No fees recorded in {fyLabel(start)}.</p>
      ) : (
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-400 uppercase mb-2">Received by month</p>
            <div className="space-y-1">
              {fy.byMonth.map((m) => (
                <div key={m.month} className="flex items-center gap-2 text-xs">
                  <span className="w-16 text-slate-500">{formatMonth(m.month)}</span>
                  <div className="flex-1 h-2.5 rounded-full bg-slate-100 overflow-hidden" aria-hidden>
                    <div className="h-full rounded-full bg-emerald-500" style={{ width: `${(m.totals.received / maxMonth) * 100}%` }} />
                  </div>
                  <span className="w-24 text-right font-medium text-slate-700">{m.totals.received ? formatCurrency(m.totals.received) : '—'}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <p className="text-xs font-medium text-slate-400 uppercase mb-2">By hospital</p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-slate-400 uppercase">
                  <th className="py-1.5 font-medium">Hospital</th>
                  <th className="py-1.5 font-medium text-right">Generated</th>
                  <th className="py-1.5 font-medium text-right">Received</th>
                  <th className="py-1.5 font-medium text-right">Pending</th>
                </tr>
              </thead>
              <tbody>
                {fy.byHospital.map((h) => (
                  <tr key={h.hospitalId} className="border-t border-slate-100">
                    <td className="py-2 text-slate-700">{hospitalName(h.hospitalId)}</td>
                    <td className="py-2 text-right">{formatCurrency(h.totals.generated)}</td>
                    <td className="py-2 text-right text-emerald-700 font-medium">{formatCurrency(h.totals.received)}</td>
                    <td className="py-2 text-right text-rose-600">{h.totals.pending ? formatCurrency(h.totals.pending) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
