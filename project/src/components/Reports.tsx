import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Hospital, MonthlyEntry, Surgery, Patient, Attendance } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/helpers';
import { FileBarChart, Building2, Calendar, IndianRupee, Activity, Users, Download, FileSpreadsheet, Clock, CheckCircle2, LogOut, Zap } from 'lucide-react';
import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';

export default function Reports() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [surgeries, setSurgeries] = useState<Surgery[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [loading, setLoading] = useState(true);

  const [hospitalFilter, setHospitalFilter] = useState('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const load = async () => {
    const [{ data: h }, { data: me }, { data: s }, { data: p }, { data: att }] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
      supabase.from('surgeries').select('*, patient:patients(*)').order('surgery_date', { ascending: false }),
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('attendance').select('*, hospital:hospitals(*)').order('attendance_date', { ascending: false }),
    ]);
    setHospitals(h || []);
    setMonthlyEntries(me || []);
    setSurgeries(s || []);
    setPatients(p || []);
    setAttendance(att || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const inDateRange = (dateStr: string | null): boolean => {
    if (!dateStr) return false;
    const d = dateStr.substring(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  const inMonthRange = (monthStr: string): boolean => {
    const d = monthStr.substring(0, 10);
    if (startDate && d < startDate) return false;
    if (endDate && d > endDate) return false;
    return true;
  };

  const filteredEntries = monthlyEntries.filter((me) => {
    if (hospitalFilter !== 'all' && me.hospital_id !== hospitalFilter) return false;
    if (startDate || endDate) {
      if (!inMonthRange(me.entry_date || me.month)) return false;
    }
    return true;
  });

  const filteredSurgeries = surgeries.filter((s) => {
    if (hospitalFilter !== 'all') {
      const patient = patients.find((p) => p.id === s.patient_id);
      if (!patient || patient.hospital_id !== hospitalFilter) return false;
    }
    if (startDate || endDate) {
      if (!inDateRange(s.surgery_date)) return false;
    }
    return true;
  });

  const filteredAttendance = attendance.filter((a) => {
    if (hospitalFilter !== 'all' && a.hospital_id !== hospitalFilter) return false;
    if (startDate || endDate) {
      if (!inDateRange(a.attendance_date)) return false;
    }
    return true;
  }).sort((a, b) => a.attendance_date.localeCompare(b.attendance_date));

  const attPresent = filteredAttendance.filter((a) => a.status === 'present').length;
  const attLeave = filteredAttendance.filter((a) => a.status === 'leave');
  const attExtra = filteredAttendance.filter((a) => a.status === 'extra_duty');
  const leaveTypeCounts: Record<string, number> = {};
  attLeave.forEach((l) => { const t = l.leave_type || 'Unknown'; leaveTypeCounts[t] = (leaveTypeCounts[t] || 0) + 1; });
  const extraTypeCounts: Record<string, number> = {};
  attExtra.forEach((e) => { const t = e.extra_duty_type || 'Unknown'; extraTypeCounts[t] = (extraTypeCounts[t] || 0) + 1; });

  const attendanceByHospital = hospitals.map((h) => {
    const hospAtt = filteredAttendance.filter((a) => a.hospital_id === h.id);
    const present = hospAtt.filter((a) => a.status === 'present').length;
    const leaves = hospAtt.filter((a) => a.status === 'leave');
    const extras = hospAtt.filter((a) => a.status === 'extra_duty');
    const lt: Record<string, number> = {};
    leaves.forEach((l) => { const t = l.leave_type || 'Unknown'; lt[t] = (lt[t] || 0) + 1; });
    const et: Record<string, number> = {};
    extras.forEach((e) => { const t = e.extra_duty_type || 'Unknown'; et[t] = (et[t] || 0) + 1; });
    return { hospital: h, present, leaveCount: leaves.length, extraCount: extras.length, leaveTypes: lt, extraTypes: et };
  }).filter((a) => a.present > 0 || a.leaveCount > 0 || a.extraCount > 0);

  const filteredPatients = patients.filter((p) => {
    if (hospitalFilter !== 'all' && p.hospital_id !== hospitalFilter) return false;
    if (startDate || endDate) {
      if (!inDateRange(p.admission_date) && !inDateRange(p.surgery_date) && !inDateRange(p.created_at)) return false;
    }
    return true;
  });

  const totalOp = filteredEntries.reduce((s, me) => s + me.op_patients, 0);
  const totalIp = filteredEntries.reduce((s, me) => s + me.ip_patients, 0);
  const totalFeesGen = filteredEntries.reduce((s, me) => s + me.fees_generated, 0);
  const totalFeesRec = filteredEntries.reduce((s, me) => s + me.fees_received, 0);

  // Surgery type breakdown
  const surgeryTypeCounts: Record<string, number> = {};
  filteredSurgeries.forEach((s) => {
    const type = s.surgery_type || 'Unspecified';
    surgeryTypeCounts[type] = (surgeryTypeCounts[type] || 0) + 1;
  });

  // Surgery role breakdown
  const surgeryRoleCounts: Record<string, number> = { 'Done by me': 0, 'Assisted by me': 0 };
  filteredSurgeries.forEach((s) => {
    const role = s.role === 'assisted_by_me' ? 'Assisted by me' : 'Done by me';
    surgeryRoleCounts[role] = (surgeryRoleCounts[role] || 0) + 1;
  });

  const totalSurgeries = filteredSurgeries.length;
  const totalPending = totalFeesGen - totalFeesRec;

  const setQuickRange = (months: number) => {
    const end = new Date();
    const start = new Date();
    start.setMonth(start.getMonth() - (months - 1));
    start.setDate(1);
    setStartDate(start.toISOString().substring(0, 10));
    setEndDate(end.toISOString().substring(0, 10));
  };

  const clearFilters = () => {
    setHospitalFilter('all');
    setStartDate('');
    setEndDate('');
  };

  const exportCsv = () => {
    const rows: string[] = [];
    rows.push('Type,Hospital,Date/Month,OP,IP,Fees Generated,Fees Received,Procedure,Surgery Type,Role');

    filteredEntries.forEach((me) => {
      rows.push([
        'Daily Entry',
        me.hospital?.name || '',
        new Date(me.entry_date || me.month).toLocaleDateString('en-GB'),
        me.op_patients,
        me.ip_patients,
        me.fees_generated,
        me.fees_received,
        '',
        '',
        '',
      ].join(','));
    });

    filteredSurgeries.forEach((s) => {
      const patient = patients.find((p) => p.id === s.patient_id);
      const hospital = hospitals.find((h) => h.id === patient?.hospital_id);
      rows.push([
        'Surgery',
        hospital?.name || '',
        s.surgery_date || '',
        '',
        '',
        '',
        '',
        s.procedure_name,
        s.surgery_type || '',
        s.role === 'assisted_by_me' ? 'Assisted by me' : 'Done by me',
      ].join(','));
    });

    filteredAttendance.forEach((a) => {
      rows.push([
        'Attendance',
        a.hospital?.name || '',
        a.attendance_date,
        '',
        '',
        '',
        '',
        '',
        a.status,
        a.leave_type || a.extra_duty_type || '',
      ].join(','));
    });

    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `report-${new Date().toISOString().substring(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportExcel = () => {
    const wb = XLSX.utils.book_new();
    const rangeLabel = startDate || endDate ? `${startDate || 'Start'} to ${endDate || 'Today'}` : 'All time';
    const hospitalLabel = hospitalFilter === 'all' ? 'All Hospitals' : (hospitals.find((h) => h.id === hospitalFilter)?.name || 'All Hospitals');

    // --- Summary sheet ---
    const summaryRows = [
      ['Surgical Practice Report'],
      ['Generated', new Date().toLocaleString('en-GB')],
      ['Hospital', hospitalLabel],
      ['Date Range', rangeLabel],
      [],
      ['Metric', 'Value'],
      ['Total OP Patients', totalOp],
      ['Total IP Patients', totalIp],
      ['Total Surgeries', totalSurgeries],
      ['Fees Generated', totalFeesGen],
      ['Fees Received', totalFeesRec],
      ['Pending', totalPending],
      ['Days Present', attPresent],
      ['Days on Leave', attLeave.length],
      ['Extra Duty Days', attExtra.length],
      [],
      ['Surgery Type', 'Count'],
      ...Object.entries(surgeryTypeCounts).map(([type, count]) => [type, count]),
      [],
      ['Surgery Role', 'Count'],
      ...Object.entries(surgeryRoleCounts).map(([role, count]) => [role, count]),
    ];
    const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
    summarySheet['!cols'] = [{ wch: 24 }, { wch: 20 }];
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // --- Hospital-wise sheet ---
    const hospitalRows = [
      ['Hospital', 'OP', 'IP', 'Surgeries', 'Fees Generated', 'Fees Received', 'Pending', 'Present', 'Leave', 'Extra Duty'],
      ...hospitals.map((h) => {
        const hEntries = filteredEntries.filter((me) => me.hospital_id === h.id);
        const hOp = hEntries.reduce((s, me) => s + me.op_patients, 0);
        const hIp = hEntries.reduce((s, me) => s + me.ip_patients, 0);
        const hFeesGen = hEntries.reduce((s, me) => s + me.fees_generated, 0);
        const hFeesRec = hEntries.reduce((s, me) => s + me.fees_received, 0);
        const hSurgeries = filteredSurgeries.filter((s) => {
          const patient = patients.find((p) => p.id === s.patient_id);
          return patient?.hospital_id === h.id;
        }).length;
        const hAtt = attendanceByHospital.find((a) => a.hospital.id === h.id);
        return [
          h.name, hOp, hIp, hSurgeries, hFeesGen, hFeesRec, hFeesGen - hFeesRec,
          hAtt?.present || 0, hAtt?.leaveCount || 0, hAtt?.extraCount || 0,
        ];
      }),
    ];
    const hospitalSheet = XLSX.utils.aoa_to_sheet(hospitalRows);
    hospitalSheet['!cols'] = Array(10).fill({ wch: 14 });
    XLSX.utils.book_append_sheet(wb, hospitalSheet, 'Hospital-wise');

    // --- Daily Entries sheet ---
    const entryRows = [
      ['Date', 'Hospital', 'OP', 'IP', 'Opinion', 'Fees Generated', 'Fees Received', 'Pending', 'Notes'],
      ...filteredEntries.map((me) => [
        formatDate(me.entry_date || me.month), me.hospital?.name || '', me.op_patients, me.ip_patients,
        me.opinion_patients, me.fees_generated, me.fees_received, me.fees_generated - me.fees_received, me.notes || '',
      ]),
    ];
    const entrySheet = XLSX.utils.aoa_to_sheet(entryRows);
    entrySheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 8 }, { wch: 8 }, { wch: 10 }, { wch: 14 }, { wch: 14 }, { wch: 12 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, entrySheet, 'Daily Entries');

    // --- Surgeries sheet ---
    const surgeryRows = [
      ['Date', 'Hospital', 'Patient', 'Unique ID', 'Procedure', 'Surgery Type', 'Anaesthesia', 'Role'],
      ...filteredSurgeries.map((s) => {
        const patient = patients.find((p) => p.id === s.patient_id);
        const hospital = hospitals.find((h) => h.id === patient?.hospital_id);
        return [
          formatDate(s.surgery_date), hospital?.name || '', patient?.patient_name || '', patient?.unique_id || '',
          s.procedure_name, s.surgery_type || '', s.anaesthesia_type || '',
          s.role === 'assisted_by_me' ? 'Assisted by me' : 'Done by me',
        ];
      }),
    ];
    const surgerySheet = XLSX.utils.aoa_to_sheet(surgeryRows);
    surgerySheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 20 }, { wch: 14 }, { wch: 26 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
    XLSX.utils.book_append_sheet(wb, surgerySheet, 'Surgeries');

    // --- Patients sheet ---
    const patientRows = [
      ['Unique ID', 'Name', 'Hospital', 'Type', 'Age', 'Sex', 'Mobile', 'Diagnosis', 'Fees', 'Admission', 'Discharge', 'Surgery Date', 'Follow-up'],
      ...filteredPatients.map((p) => [
        p.unique_id, p.patient_name, p.hospital?.name || '', p.patient_type || '', p.age ?? '', p.sex || '',
        p.mobile_number || '', p.diagnosis || '', p.fees || 0, p.admission_date || '', p.discharge_date || '',
        p.surgery_date || '', p.follow_up_date || '',
      ]),
    ];
    const patientSheet = XLSX.utils.aoa_to_sheet(patientRows);
    patientSheet['!cols'] = Array(13).fill({ wch: 14 });
    XLSX.utils.book_append_sheet(wb, patientSheet, 'Patients');

    // --- Attendance sheet ---
    const attendanceRows = [
      ['Date', 'Hospital', 'Status', 'Type', 'Notes'],
      ...filteredAttendance.map((a) => [
        formatDate(a.attendance_date), a.hospital?.name || '', a.status, a.leave_type || a.extra_duty_type || '', a.notes || '',
      ]),
    ];
    const attendanceSheet = XLSX.utils.aoa_to_sheet(attendanceRows);
    attendanceSheet['!cols'] = [{ wch: 12 }, { wch: 20 }, { wch: 12 }, { wch: 16 }, { wch: 24 }];
    XLSX.utils.book_append_sheet(wb, attendanceSheet, 'Attendance');

    const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob2 = new Blob([wbout], { type: 'application/octet-stream' });
    saveAs(blob2, `surgical-report-${new Date().toISOString().substring(0, 10)}.xlsx`);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Reports</h1>
          <p className="text-slate-500 text-sm mt-0.5">Generate reports by hospital and date range</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={exportCsv}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-lg text-sm font-medium hover:bg-slate-50 transition shadow-sm"
          >
            <Download className="w-4 h-4" />
            Export CSV
          </button>
          <button
            onClick={exportExcel}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export Excel
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-slate-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">Hospital</label>
            <select
              value={hospitalFilter}
              onChange={(e) => setHospitalFilter(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
            >
              <option value="all">All Hospitals</option>
              {hospitals.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">From Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">To Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 rounded-lg border border-slate-200 text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
            />
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => setQuickRange(1)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">This Month</button>
            <button onClick={() => setQuickRange(3)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">3 Months</button>
            <button onClick={() => setQuickRange(6)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">6 Months</button>
            <button onClick={() => setQuickRange(12)} className="px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 transition">1 Year</button>
          </div>
          <button onClick={clearFilters} className="px-3 py-2 text-xs font-medium rounded-lg text-slate-500 hover:bg-slate-100 transition">Clear</button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        <StatCard label="OP Patients" value={totalOp} icon={Users} color="sky" />
        <StatCard label="IP Patients" value={totalIp} icon={Activity} color="emerald" />
        <StatCard label="Surgeries" value={totalSurgeries} icon={Activity} color="violet" />
        <StatCard label="Fees Generated" value={formatCurrency(totalFeesGen)} icon={IndianRupee} color="amber" />
        <StatCard label="Fees Received" value={formatCurrency(totalFeesRec)} icon={IndianRupee} color="emerald" />
        <StatCard label="Pending" value={formatCurrency(totalPending)} icon={IndianRupee} color="red" />
      </div>

      {/* Surgery Type Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <FileBarChart className="w-4 h-4 text-violet-500" />
          <h2 className="font-semibold text-slate-700">Surgery Type Breakdown</h2>
        </div>
        {Object.keys(surgeryTypeCounts).length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No surgeries found for the selected filters.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(surgeryTypeCounts).sort((a, b) => b[1] - a[1]).map(([type, count]) => {
              const pct = totalSurgeries > 0 ? (count / totalSurgeries) * 100 : 0;
              return (
                <div key={type} className="flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-600 w-32 truncate">{type}</span>
                  <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full transition-all flex items-center justify-end pr-2"
                      style={{ width: `${Math.max(pct, 8)}%` }}
                    >
                      <span className="text-xs text-white font-medium">{count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Surgery Role Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-slate-700">Surgery Role Breakdown</h2>
        </div>
        {totalSurgeries === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No surgeries found for the selected filters.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Object.entries(surgeryRoleCounts).map(([role, count]) => {
              const pct = totalSurgeries > 0 ? (count / totalSurgeries) * 100 : 0;
              const isDone = role === 'Done by me';
              return (
                <div key={role} className="p-4 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium text-slate-600">{role}</span>
                    <span className="text-lg font-bold text-slate-800">{count}</span>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${isDone ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${Math.max(pct, 3)}%` }} />
                  </div>
                  <p className="text-xs text-slate-400 mt-1.5">{pct.toFixed(0)}% of total</p>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Monthly Entries Detail */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Calendar className="w-4 h-4 text-emerald-500" />
          <h2 className="font-semibold text-slate-700">Daily Entries</h2>
        </div>
        {filteredEntries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No daily entries found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">OP</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Fees Gen.</th>
                  <th className="px-3 py-2 font-medium">Fees Rec.</th>
                  <th className="px-3 py-2 font-medium">Pending</th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((me) => {
                  const pending = me.fees_generated - me.fees_received;
                  return (
                    <tr key={me.id} className="border-b border-slate-50">
                      <td className="px-3 py-2.5 text-slate-600">
                        {formatDate(me.entry_date || me.month)}
                      </td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{me.hospital?.name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{me.op_patients}</td>
                      <td className="px-3 py-2.5 text-slate-600">{me.ip_patients}</td>
                      <td className="px-3 py-2.5 text-slate-600">{formatCurrency(me.fees_generated)}</td>
                      <td className="px-3 py-2.5 text-emerald-600 font-medium">{formatCurrency(me.fees_received)}</td>
                      <td className={`px-3 py-2.5 font-medium ${pending > 0 ? 'text-red-600' : 'text-slate-400'}`}>
                        {formatCurrency(pending)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Surgery List */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Activity className="w-4 h-4 text-sky-500" />
          <h2 className="font-semibold text-slate-700">Surgeries in Range</h2>
        </div>
        {filteredSurgeries.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No surgeries found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Procedure</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Role</th>
                </tr>
              </thead>
              <tbody>
                {filteredSurgeries.map((s) => {
                  const patient = patients.find((p) => p.id === s.patient_id);
                  const hospital = hospitals.find((h) => h.id === patient?.hospital_id);
                  return (
                    <tr key={s.id} className="border-b border-slate-50">
                      <td className="px-3 py-2.5 text-slate-600">{formatDate(s.surgery_date)}</td>
                      <td className="px-3 py-2.5 font-medium text-slate-700">{patient?.patient_name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-500">{hospital?.name || '—'}</td>
                      <td className="px-3 py-2.5 text-slate-600">{s.procedure_name || '—'}</td>
                      <td className="px-3 py-2.5">
                        {s.surgery_type ? (
                          <span className="text-xs font-medium bg-sky-50 text-sky-600 px-2 py-0.5 rounded">{s.surgery_type}</span>
                        ) : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded ${s.role === 'assisted_by_me' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{s.role === 'assisted_by_me' ? 'Assisted' : 'Done by me'}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Attendance Summary */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-amber-500" />
          <h2 className="font-semibold text-slate-700">Attendance Summary</h2>
        </div>
        {filteredAttendance.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No attendance entries found for the selected filters.</p>
        ) : (
          <div className="space-y-4">
            {/* Overall counts */}
            <div className="flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-lg">
                <CheckCircle2 className="w-4 h-4" /> Present: {attPresent}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-red-700 bg-red-50 px-3 py-1.5 rounded-lg">
                <LogOut className="w-4 h-4" /> Leave: {attLeave.length}
              </span>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1.5 rounded-lg">
                <Zap className="w-4 h-4" /> Extra Duty: {attExtra.length}
              </span>
            </div>

            {/* Leave type breakdown */}
            {Object.keys(leaveTypeCounts).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Leave Types</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(leaveTypeCounts).map(([type, count]) => (
                    <span key={type} className="text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Extra duty type breakdown */}
            {Object.keys(extraTypeCounts).length > 0 && (
              <div>
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2">Extra Duty Types</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(extraTypeCounts).map(([type, count]) => (
                    <span key={type} className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                      {type}: {count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Hospital-wise breakdown */}
            {attendanceByHospital.length > 0 && (
              <div className="pt-2 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Hospital-wise Breakdown</p>
                <div className="space-y-3">
                  {attendanceByHospital.map((a) => (
                    <div key={a.hospital.id} className="p-3 rounded-lg border border-slate-100 bg-slate-50">
                      <p className="text-sm font-medium text-slate-700 mb-2">{a.hospital.name}</p>
                      <div className="flex flex-wrap gap-2">
                        <span className="text-xs font-medium text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">
                          Present: {a.present}
                        </span>
                        {Object.entries(a.leaveTypes).map(([type, count]) => (
                          <span key={type} className="text-xs font-medium text-red-700 bg-red-50 px-2.5 py-1 rounded-full">
                            Leave ({type}): {count}
                          </span>
                        ))}
                        {Object.entries(a.extraTypes).map(([type, count]) => (
                          <span key={type} className="text-xs font-medium text-amber-700 bg-amber-50 px-2.5 py-1 rounded-full">
                            Extra ({type}): {count}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Attendance Log */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Clock className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-700">Attendance Log</h2>
        </div>
        {filteredAttendance.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No attendance entries found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                </tr>
              </thead>
              <tbody>
                {filteredAttendance.map((a) => (
                  <tr key={a.id} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(a.attendance_date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{a.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5">
                      {a.status === 'present' && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full"><CheckCircle2 className="w-3 h-3" /> Present</span>}
                      {a.status === 'leave' && <span className="inline-flex items-center gap-1 text-xs font-medium text-red-700 bg-red-50 px-2 py-0.5 rounded-full"><LogOut className="w-3 h-3" /> Leave</span>}
                      {a.status === 'extra_duty' && <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full"><Zap className="w-3 h-3" /> Extra Duty</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-600">{a.leave_type || a.extra_duty_type || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-400">{a.notes || '—'}</td>
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

function StatCard({ label, value, icon: Icon, color }: { label: string; value: string | number; icon: typeof Users; color: string }) {
  const colorMap: Record<string, string> = {
    sky: 'bg-sky-50 text-sky-600',
    emerald: 'bg-emerald-50 text-emerald-600',
    amber: 'bg-amber-50 text-amber-600',
    red: 'bg-red-50 text-red-600',
    violet: 'bg-violet-50 text-violet-600',
  };
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4">
      <div className={`w-9 h-9 rounded-lg flex items-center justify-center mb-2 ${colorMap[color]}`}>
        <Icon className="w-4 h-4" />
      </div>
      <p className="text-xl font-bold text-slate-800">{value}</p>
      <p className="text-xs text-slate-400">{label}</p>
    </div>
  );
}
