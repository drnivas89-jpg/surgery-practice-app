import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { Attendance, Hospital } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { Zap, Calendar, LogOut, AlertCircle } from 'lucide-react';

export default function COLDashboard() {
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [{ data: att }, { data: h }] = await Promise.all([
        supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
        supabase.from('hospitals').select('*').order('name'),
      ]);
      setAttendance(att || []);
      setHospitals(h || []);
      setLoading(false);
    })();
  }, []);

  const { colEntries, struckDates, leaveEntries } = useMemo(() => {
    const colEntries = attendance
      .filter((a) => a.status === 'extra_duty' && (a.extra_duty_type || '').toLowerCase() === 'col')
      .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

    const leaveEntries = attendance
      .filter((a) => a.status === 'leave')
      .sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

    const struckDates = new Set<string>();
    for (const leave of leaveEntries) {
      const colBefore = colEntries
        .filter((c) => c.attendance_date <= leave.attendance_date)
        .map((c) => c.attendance_date);
      for (const d of colBefore) {
        if (!struckDates.has(d)) {
          struckDates.add(d);
          break;
        }
      }
    }
    return { colEntries, struckDates, leaveEntries };
  }, [attendance]);

  const totalCol = colEntries.length;
  const struckCount = struckDates.size;
  const pendingCount = totalCol - struckCount;

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
          Track COL extra duties and their compensation through leave. Struck-through dates have been compensated.
        </p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center mb-3">
            <Zap className="w-5 h-5 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{totalCol}</p>
          <p className="text-sm text-slate-400">Total COL Duties</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5 text-slate-500" />
          </div>
          <p className="text-2xl font-bold text-slate-600">{struckCount}</p>
          <p className="text-sm text-slate-400">Compensated (Struck)</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-sky-50 rounded-lg flex items-center justify-center mb-3">
            <AlertCircle className="w-5 h-5 text-sky-600" />
          </div>
          <p className="text-2xl font-bold text-sky-600">{pendingCount}</p>
          <p className="text-sm text-slate-400">Pending Compensation</p>
        </div>
      </div>

      {/* COL entries timeline */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">COL Duty Dates</h2>
        {colEntries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No COL extra duties recorded yet.</p>
        ) : (
          <div className="space-y-2">
            {colEntries.map((c) => {
              const struck = struckDates.has(c.attendance_date);
              return (
                <div
                  key={c.id}
                  className={`flex items-center gap-3 p-3.5 rounded-lg border transition ${
                    struck ? 'border-slate-200 bg-slate-50' : 'border-amber-200 bg-amber-50'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    struck ? 'bg-slate-200 text-slate-400' : 'bg-amber-100 text-amber-600'
                  }`}>
                    <Zap className="w-4 h-4" />
                  </div>
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${struck ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                      {formatDate(c.attendance_date)}
                    </p>
                    <p className="text-xs text-slate-400">
                      {c.hospital?.name || '—'}{c.notes ? ` · ${c.notes}` : ''}
                    </p>
                  </div>
                  {struck ? (
                    <span className="text-xs font-medium text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full">
                      Compensated
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-amber-600 bg-amber-100 px-2.5 py-1 rounded-full">
                      Pending
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Leave entries that compensated COL */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <LogOut className="w-4 h-4 text-red-500" />
          <h2 className="font-semibold text-slate-700">Leave Entries (used for compensation)</h2>
        </div>
        {leaveEntries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No leave entries recorded.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Leave Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Leave Type</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {leaveEntries.map((l) => (
                  <tr key={l.id} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(l.attendance_date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{l.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{l.leave_type || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{l.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
