import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { getColSummary } from '@/lib/col';
import { Zap, Calendar, LogOut, AlertCircle } from 'lucide-react';

export default function COLDashboard() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: att } = await supabase
        .from('attendance')
        .select('*, hospital:hospitals(*)')
        .order('attendance_date', { ascending: false });
      setAttendance(att || []);
      setLoading(false);
    })();
  }, []);

  const summary = useMemo(() => getColSummary(attendance), [attendance]);
  const availableDateSet = useMemo(() => new Set(summary.availableDates.map((d) => d.date)), [summary]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">COL Extra Duty Dashboard</h1>
        <p className="text-slate-500 text-sm mt-0.5">
          Track COL (Compensatory Off) credits earned via extra duty, and which leave dates redeemed them.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{summary.accrued}</p>
          <p className="text-sm text-slate-400">Total Accrued</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-600">{summary.redeemed}</p>
          <p className="text-sm text-slate-400">Total Redeemed</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center mb-3">
            <AlertCircle className="w-5 h-5 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-sky-600">{summary.available}</p>
          <p className="text-sm text-slate-400">Available Credits</p>
        </div>
      </div>

      {/* COL Used Dates */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <LogOut className="w-4 h-4 text-red-500" />
          <h2 className="font-semibold text-slate-700">COL Used Dates</h2>
        </div>
        {summary.usage.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No COL leave taken yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Leave Date</th>
                  <th className="px-3 py-2 font-medium">Compensated Working Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                </tr>
              </thead>
              <tbody>
                {summary.usage.map((u, i) => (
                  <tr key={i} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(u.leaveDate)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">
                      {formatDate(u.compensatedWorkingDate)}
                      {u.inferred && <span className="ml-2 text-[10px] font-normal text-slate-400" title="Recorded before explicit linking existed — inferred by date order">(inferred)</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{u.hospitalName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* COL credit-earning dates */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">COL Duty Dates</h2>
        {summary.creditDates.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No COL extra duties recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {summary.creditDates.map((c) => {
              const available = availableDateSet.has(c.date);
              return (
                <div
                  key={c.attendanceId}
                  className={`flex items-center gap-3 p-3.5 rounded-lg border transition ${
                    available ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    available ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${available ? 'text-slate-700' : 'text-slate-400 line-through'}`}>
                      {formatDate(c.date)}
                    </p>
                    <p className="text-xs text-slate-400">{c.hospitalName}</p>
                  </div>
                  {available ? (
                    <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                      Pending
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                      Compensated
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
