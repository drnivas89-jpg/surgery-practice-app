import { useEffect, useState, useMemo } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Attendance, Hospital, GovHoliday } from '@/lib/types';
import { formatDate } from '@/lib/helpers';
import { getColSummary, groupColByYear } from '@/lib/col';
import { buildColContext, fetchGovHolidays } from '@/lib/holidays';
import {
  Zap, Building2, ArrowLeft, ChevronLeft, ChevronRight, Pencil, Trash2, Unlink, Check, X, Plus, PartyPopper,
} from 'lucide-react';
import ColMonthCalendar from './ColMonthCalendar';

export default function COLDashboard() {
  const { user } = useAuth();
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [holidays, setHolidays] = useState<GovHoliday[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingCreditId, setEditingCreditId] = useState<string | null>(null);
  const [editDate, setEditDate] = useState('');
  const [showCalendar, setShowCalendar] = useState(false);

  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [level, setLevel] = useState<'cards' | 'detail'>('cards');
  const [selectedHospitalId, setSelectedHospitalId] = useState<string | null>(null);

  const load = async () => {
    const [{ data: h }, { data: att }, hol] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
      fetchGovHolidays(),
    ]);
    setHospitals(h || []);
    setHolidays(hol);
    setAttendance(att || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const colContext = useMemo(() => buildColContext(holidays, hospitals), [holidays, hospitals]);
  const hospitalBuckets = useMemo(
    () => hospitals.map((h) => {
      const summary = getColSummary(attendance, h.id, { context: colContext });
      return { hospital: h, balance: summary.available, wasted: summary.wasted, buckets: groupColByYear(summary) };
    }),
    [hospitals, attendance, colContext]
  );
  const selected = hospitalBuckets.find((hb) => hb.hospital.id === selectedHospitalId) || null;
  const selectedColSummary = useMemo(
    () => (selectedHospitalId ? getColSummary(attendance, selectedHospitalId, { context: colContext }) : null),
    [attendance, selectedHospitalId, colContext]
  );

  const openHospitalDetail = (hospitalId: string) => { setSelectedHospitalId(hospitalId); setLevel('detail'); };

  const startEditCredit = (attendanceId: string, currentDate: string) => {
    setEditingCreditId(attendanceId);
    setEditDate(currentDate.substring(0, 10));
  };
  const saveEditCredit = async (attendanceId: string) => {
    await supabase.from('attendance').update({ attendance_date: editDate }).eq('id', attendanceId);
    setEditingCreditId(null);
    load();
  };
  const deleteCredit = async (attendanceId: string) => {
    if (!confirm('Delete this COL credit? If it has already been redeemed by a leave, that leave will lose its link.')) return;
    await supabase.from('attendance').delete().eq('id', attendanceId);
    load();
  };
  const unlinkUsage = async (leaveAttendanceId: string) => {
    if (!confirm('Unlink this leave from the COL credit it redeemed? The credit becomes available again.')) return;
    await supabase.from('attendance').update({ compensated_working_date: null }).eq('id', leaveAttendanceId);
    load();
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
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          {level === 'detail' && (
            <button onClick={() => { setLevel('cards'); setSelectedHospitalId(null); }} className="p-2 rounded-lg hover:bg-slate-100 transition">
              <ArrowLeft className="w-5 h-5 text-slate-500" />
            </button>
          )}
          <div>
            <h1 className="page-title">
              {level === 'cards' ? 'COL Dashboard' : selected?.hospital.name || 'Hospital'}
            </h1>
            <p className="text-slate-500 text-sm mt-0.5">
              {level === 'cards'
                ? 'Hospital-wise COL credits (COL duty + government-holiday duty), each valid for 6 months. COL is hospital-strict.'
                : 'Every COL credit with its validity — struck through once used, faded once wasted.'}
            </p>
          </div>
        </div>
        {level === 'cards' && (
          <div className="flex items-center gap-2 bg-white rounded-xl border border-slate-200 px-3 py-2">
            <button onClick={() => setSelectedYear((y) => y - 1)} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronLeft className="w-4 h-4 text-slate-500" /></button>
            <select value={selectedYear} onChange={(e) => setSelectedYear(parseInt(e.target.value))} className="text-sm font-medium text-slate-700 bg-transparent focus:outline-none cursor-pointer">
              {[selectedYear - 2, selectedYear - 1, selectedYear, selectedYear + 1].filter((y) => y <= now.getFullYear() + 1).map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button onClick={() => setSelectedYear((y) => y + 1)} className="p-1 rounded-lg hover:bg-slate-100 transition"><ChevronRight className="w-4 h-4 text-slate-500" /></button>
          </div>
        )}
      </div>

      {level === 'cards' && (
        hospitals.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-8 text-center">
            <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">No hospitals added yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {hospitalBuckets.map(({ hospital, balance, wasted, buckets }) => {
              const yearBucket = buckets.find((b) => b.year === selectedYear) || { creditedCount: 0, usedCount: 0, wastedCount: 0 };
              return (
                <button
                  key={hospital.id}
                  onClick={() => openHospitalDetail(hospital.id)}
                  className="card card-hover p-5 text-left group"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 bg-amber-50 rounded-lg flex items-center justify-center flex-shrink-0">
                        <Zap className="w-4.5 h-4.5 text-amber-600" />
                      </div>
                      <h3 className="font-semibold text-slate-800">{hospital.name}</h3>
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full whitespace-nowrap">
                      {balance} available{wasted > 0 ? ` · ${wasted} wasted` : ''}
                    </span>
                  </div>
                  <p className="text-[10px] font-medium text-slate-400 uppercase mb-1.5">{selectedYear}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <p className="text-lg font-bold text-amber-700">{yearBucket.creditedCount}</p>
                      <p className="text-[10px] text-slate-400 uppercase">Credited</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <p className="text-lg font-bold text-sky-700">{yearBucket.usedCount}</p>
                      <p className="text-[10px] text-slate-400 uppercase">Used</p>
                    </div>
                    <div className="p-2.5 rounded-lg bg-slate-50">
                      <p className="text-lg font-bold text-rose-600">{yearBucket.wastedCount}</p>
                      <p className="text-[10px] text-slate-400 uppercase">Wasted</p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )
      )}

      {level === 'detail' && selected && selectedColSummary && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-full inline-flex items-center gap-1">
              <Zap className="w-3.5 h-3.5" /> {selectedColSummary.available} available / {selectedColSummary.accrued} accrued
              {selectedColSummary.wasted > 0 ? ` / ${selectedColSummary.wasted} wasted` : ''}
            </span>
            <button
              onClick={() => setShowCalendar(true)}
              className="flex items-center gap-2 px-4 py-2 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 transition shadow-sm"
            >
              <Plus className="w-4 h-4" /> Add COL Entry
            </button>
          </div>

          {selected.buckets.length === 0 ? (
            <p className="text-sm text-slate-400 py-8 text-center card">No COL credits recorded yet at this hospital.</p>
          ) : (
            selected.buckets.map((bucket) => (
              <div key={bucket.year} className="card p-5">
                <h2 className="font-semibold text-slate-700 mb-4">
                  {bucket.year} <span className="text-xs font-normal text-slate-400">— {bucket.creditedCount} credited, {bucket.usedCount} used{bucket.wastedCount > 0 ? `, ${bucket.wastedCount} wasted` : ''}</span>
                </h2>
                <div className="space-y-2">
                  {bucket.creditDates.map((c) => {
                    const isEditing = editingCreditId === c.attendanceId;
                    return (
                      <div
                        key={c.attendanceId}
                        className={`flex items-center gap-3 p-3.5 rounded-lg border transition ${
                          c.status === 'available' ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
                        } ${c.status === 'wasted' ? 'opacity-60' : ''}`}
                      >
                        <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          c.status === 'available' ? 'bg-amber-100 text-amber-600' : 'bg-slate-200 text-slate-400'
                        }`}>
                          {c.source === 'holiday' ? <PartyPopper className="w-4 h-4" /> : <Zap className="w-4 h-4" />}
                        </div>
                        <div className="flex-1">
                          {isEditing ? (
                            <input
                              type="date"
                              value={editDate}
                              onChange={(e) => setEditDate(e.target.value)}
                              className="px-2 py-1 rounded border border-slate-200 text-sm"
                              autoFocus
                            />
                          ) : (
                            <p className={`text-sm font-medium ${
                              c.status === 'used' ? 'text-sky-700 line-through' : c.status === 'wasted' ? 'text-slate-400' : 'text-slate-700'
                            }`}>
                              {formatDate(c.date)}
                            </p>
                          )}
                          {c.reason && <p className="text-xs text-slate-500 mt-0.5">{c.reason}</p>}
                          <p className="text-[11px] text-slate-400 mt-0.5">{c.status === 'wasted' ? 'Expired' : 'Valid till'} {formatDate(c.expiryDate)}</p>
                        </div>
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <button onClick={() => saveEditCredit(c.attendanceId)} className="p-1.5 text-emerald-600 hover:bg-emerald-100 rounded-lg transition"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditingCreditId(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg transition"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <>
                            {c.status === 'used' ? (
                              <span className="text-xs font-medium text-sky-700 bg-sky-50 px-2.5 py-1 rounded-full">Used</span>
                            ) : c.status === 'wasted' ? (
                              <span className="text-xs font-medium text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">Wasted</span>
                            ) : (
                              <span className="text-xs font-medium text-emerald-700 bg-emerald-100 px-2.5 py-1 rounded-full">Available</span>
                            )}
                            {c.source === 'holiday' ? (
                              <span className="text-[10px] text-slate-400 w-14 text-center" title="Earned automatically for duty on a government holiday — change it from the Hospitals attendance log">auto</span>
                            ) : (
                            <div className="flex items-center gap-1">
                              <button onClick={() => startEditCredit(c.attendanceId, c.date)} className="p-1.5 text-slate-400 hover:text-sky-600 hover:bg-sky-50 rounded-lg transition"><Pencil className="w-3.5 h-3.5" /></button>
                              <button onClick={() => deleteCredit(c.attendanceId)} className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"><Trash2 className="w-3.5 h-3.5" /></button>
                            </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}

          {selectedColSummary.usage.length > 0 && (
            <div className="card p-5">
              <h2 className="font-semibold text-slate-700 mb-4">Redemptions</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                      <th className="px-3 py-2 font-medium">Leave Date</th>
                      <th className="px-3 py-2 font-medium">Compensated Working Date</th>
                      <th className="px-3 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedColSummary.usage.map((u, i) => (
                      <tr key={i} className="border-b border-slate-50 group">
                        <td className="px-3 py-2.5 text-slate-600">{formatDate(u.leaveDate)}</td>
                        <td className="px-3 py-2.5 font-medium text-slate-700">
                          {formatDate(u.compensatedWorkingDate)}
                          {u.inferred && <span className="ml-2 text-[10px] font-normal text-slate-400" title="Recorded before explicit linking existed — inferred by date order">(inferred)</span>}
                        </td>
                        <td className="px-3 py-2.5 text-right">
                          {!u.inferred && (
                            <button
                              onClick={() => unlinkUsage(u.leaveAttendanceId)}
                              className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-red-500 transition inline-flex items-center gap-1 text-xs"
                              title="Unlink this redemption"
                            >
                              <Unlink className="w-3.5 h-3.5" /> Unlink
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {showCalendar && selected && user && (
        <ColMonthCalendar
          hospitalId={selected.hospital.id}
          hospitalName={selected.hospital.name}
          attendance={attendance}
          colContext={colContext}
          userId={user.id}
          initialYear={selectedYear}
          onClose={() => setShowCalendar(false)}
          onSaved={() => { setShowCalendar(false); load(); }}
        />
      )}
    </div>
  );
}
