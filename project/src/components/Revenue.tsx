import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Hospital, Patient, Payment, MonthlyEntry, RevenueTransaction } from '@/lib/types';
import { formatCurrency, formatDate, todayLocalDateStr } from '@/lib/helpers';
import { IndianRupee, TrendingUp, Building2, Calendar, Plus, X, Trash2, Pencil, Activity, Receipt } from 'lucide-react';

export default function Revenue() {
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [monthlyEntries, setMonthlyEntries] = useState<MonthlyEntry[]>([]);
  const [revenueTransactions, setRevenueTransactions] = useState<RevenueTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHospital, setSelectedHospital] = useState<string>('all');
  const [selectedMonth, setSelectedMonth] = useState<string>('all');
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showEntryForm, setShowEntryForm] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [showTxnForm, setShowTxnForm] = useState(false);

  // Revenue transaction form state (multiple OP/IP/Opinion + fee entries per hospital+day)
  const [txnHospital, setTxnHospital] = useState('');
  const [txnDate, setTxnDate] = useState(todayLocalDateStr());
  const [txnDescription, setTxnDescription] = useState('');
  const [txnOpCount, setTxnOpCount] = useState('');
  const [txnIpCount, setTxnIpCount] = useState('');
  const [txnOpinionCount, setTxnOpinionCount] = useState('');
  const [txnAmountGen, setTxnAmountGen] = useState('');
  const [txnAmountRec, setTxnAmountRec] = useState('');
  const [txnError, setTxnError] = useState<string | null>(null);

  // Entry form state
  const [entryHospital, setEntryHospital] = useState('');
  const [entryDate, setEntryDate] = useState(new Date().toISOString().split('T')[0]);
  const [entryOp, setEntryOp] = useState('');
  const [entryIp, setEntryIp] = useState('');
  const [entryFeesGen, setEntryFeesGen] = useState('');
  const [entryFeesRec, setEntryFeesRec] = useState('');
  const [entryNotes, setEntryNotes] = useState('');
  const [entryError, setEntryError] = useState<string | null>(null);

  // Payment form state
  const [payHospital, setPayHospital] = useState('');
  const [payPatient, setPayPatient] = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(new Date().toISOString().split('T')[0]);
  const [payNotes, setPayNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const load = async () => {
    const [{ data: h }, { data: p }, { data: pay }, { data: me }, { data: rt }] = await Promise.all([
      supabase.from('hospitals').select('*').order('name'),
      supabase.from('patients').select('*, hospital:hospitals(*)').order('created_at', { ascending: false }),
      supabase.from('payments').select('*, patient:patients(*)').order('payment_date', { ascending: false }),
      supabase.from('monthly_entries').select('*, hospital:hospitals(*)').order('month', { ascending: false }),
      supabase.from('revenue_transactions').select('*, hospital:hospitals(*)').order('entry_date', { ascending: false }),
    ]);
    setHospitals(h || []);
    setPatients(p || []);
    setPayments(pay || []);
    setMonthlyEntries(me || []);
    setRevenueTransactions(rt || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const filteredPayments = payments.filter((p) => {
    if (selectedHospital !== 'all' && p.hospital_id !== selectedHospital) return false;
    if (selectedMonth !== 'all') {
      const payMonth = p.payment_date.substring(0, 7);
      if (payMonth !== selectedMonth) return false;
    }
    return true;
  });

  const filteredPatients = patients.filter((p) => {
    if (selectedHospital !== 'all' && p.hospital_id !== selectedHospital) return false;
    return true;
  });

  const filteredRevenueTransactions = revenueTransactions.filter((rt) => {
    if (selectedHospital !== 'all' && rt.hospital_id !== selectedHospital) return false;
    if (selectedMonth !== 'all' && rt.entry_date.substring(0, 7) !== selectedMonth) return false;
    return true;
  });

  const totalFees = filteredPatients.reduce((s, p) => s + (p.fees || 0), 0)
    + filteredRevenueTransactions.reduce((s, rt) => s + rt.amount_generated, 0);
  const totalReceived = filteredPayments.reduce((s, p) => s + p.amount, 0)
    + filteredRevenueTransactions.reduce((s, rt) => s + rt.amount_received, 0);
  const totalPending = totalFees - totalReceived;

  const hospitalRevenue = hospitals.map((h) => {
    const hospPatients = patients.filter((p) => p.hospital_id === h.id);
    const hospPayments = payments.filter((p) => p.hospital_id === h.id);
    const hospMonthly = monthlyEntries.filter((me) => me.hospital_id === h.id);
    const hospTxns = revenueTransactions.filter((rt) => rt.hospital_id === h.id);
    const feesFromPatients = hospPatients.reduce((s, p) => s + (p.fees || 0), 0);
    const feesFromMonthly = hospMonthly.reduce((s, me) => s + me.fees_generated, 0);
    const feesFromTxns = hospTxns.reduce((s, rt) => s + rt.amount_generated, 0);
    const receivedFromPayments = hospPayments.reduce((s, p) => s + p.amount, 0);
    const receivedFromMonthly = hospMonthly.reduce((s, me) => s + me.fees_received, 0);
    const receivedFromTxns = hospTxns.reduce((s, rt) => s + rt.amount_received, 0);
    const fees = feesFromPatients + feesFromMonthly + feesFromTxns;
    const received = receivedFromPayments + receivedFromMonthly + receivedFromTxns;
    return {
      hospital: h,
      fees,
      received,
      pending: fees - received,
      patientCount: hospPatients.length,
    };
  });

  // Daily rollup — live sum of every discrete transaction on a given
  // hospital+date, per the multi-transaction spec ("Total Fees Generated"
  // and "Total Fees Credited" for the date recompute from all rows, not a
  // single overwritable number).
  const dailyRollup = Object.values(
    filteredRevenueTransactions.reduce((acc, rt) => {
      const key = `${rt.hospital_id}::${rt.entry_date}`;
      if (!acc[key]) {
        acc[key] = { hospitalId: rt.hospital_id, hospitalName: rt.hospital?.name || '—', date: rt.entry_date, generated: 0, received: 0, op: 0, ip: 0, opinion: 0, count: 0 };
      }
      acc[key].generated += rt.amount_generated;
      acc[key].received += rt.amount_received;
      acc[key].op += rt.op_count;
      acc[key].ip += rt.ip_count;
      acc[key].opinion += rt.opinion_count;
      acc[key].count += 1;
      return acc;
    }, {} as Record<string, { hospitalId: string; hospitalName: string; date: string; generated: number; received: number; op: number; ip: number; opinion: number; count: number }>)
  ).sort((a, b) => b.date.localeCompare(a.date));

  const availableMonths = [...new Set(payments.map((p) => p.payment_date.substring(0, 7)))].sort().reverse();

  const openPaymentForm = (hospitalId?: string) => {
    setPayHospital(hospitalId || '');
    setPayPatient('');
    setPayAmount('');
    setPayNotes('');
    setFormError(null);
    setShowPaymentForm(true);
  };

  const handleAddPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!payHospital) {
      setFormError('Please select a hospital.');
      return;
    }
    const payload: Record<string, unknown> = {
      hospital_id: payHospital,
      amount: parseFloat(payAmount),
      payment_date: payDate,
      notes: payNotes,
    };
    if (payPatient) {
      payload.patient_id = payPatient;
    }
    const { error } = await supabase.from('payments').insert(payload);
    if (error) {
      setFormError(error.message);
      return;
    }
    setShowPaymentForm(false);
    load();
  };

  const handleDeletePayment = async (id: string) => {
    if (!confirm('Delete this payment?')) return;
    await supabase.from('payments').delete().eq('id', id);
    load();
  };

  const filteredEntries = monthlyEntries.filter((me) => {
    if (selectedHospital !== 'all' && me.hospital_id !== selectedHospital) return false;
    if (selectedMonth !== 'all') {
      const meMonth = (me.entry_date || me.month).substring(0, 7);
      if (meMonth !== selectedMonth) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.entry_date || b.month).getTime() - new Date(a.entry_date || a.month).getTime());

  const openEntryForm = (entry?: MonthlyEntry) => {
    if (entry) {
      setEditingEntryId(entry.id);
      setEntryHospital(entry.hospital_id);
      setEntryDate((entry.entry_date || entry.month).substring(0, 10));
      setEntryOp(entry.op_patients.toString());
      setEntryIp(entry.ip_patients.toString());
      setEntryFeesGen(entry.fees_generated.toString());
      setEntryFeesRec(entry.fees_received.toString());
      setEntryNotes(entry.notes || '');
    } else {
      setEditingEntryId(null);
      setEntryHospital('');
      setEntryDate(new Date().toISOString().split('T')[0]);
      setEntryOp(''); setEntryIp(''); setEntryFeesGen(''); setEntryFeesRec(''); setEntryNotes('');
    }
    setEntryError(null);
    setShowEntryForm(true);
  };

  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    setEntryError(null);
    if (!entryHospital) { setEntryError('Please select a hospital.'); return; }
    const payload = {
      hospital_id: entryHospital,
      entry_date: entryDate,
      month: entryDate.substring(0, 7) + '-01',
      op_patients: parseInt(entryOp) || 0,
      ip_patients: parseInt(entryIp) || 0,
      fees_generated: parseFloat(entryFeesGen) || 0,
      fees_received: parseFloat(entryFeesRec) || 0,
      notes: entryNotes,
    };
    let result;
    if (editingEntryId) {
      result = await supabase.from('monthly_entries').update(payload).eq('id', editingEntryId);
    } else {
      result = await supabase.from('monthly_entries').insert(payload);
    }
    if (result.error) { setEntryError(result.error.message); return; }
    setShowEntryForm(false);
    load();
  };

  const handleDeleteEntry = async (id: string) => {
    if (!confirm('Delete this daily entry?')) return;
    await supabase.from('monthly_entries').delete().eq('id', id);
    load();
  };

  const openTxnForm = (hospitalId?: string) => {
    setTxnHospital(hospitalId || '');
    setTxnDate(todayLocalDateStr());
    setTxnDescription('');
    setTxnOpCount(''); setTxnIpCount(''); setTxnOpinionCount('');
    setTxnAmountGen('');
    setTxnAmountRec('');
    setTxnError(null);
    setShowTxnForm(true);
  };

  const handleAddTxn = async (e: React.FormEvent) => {
    e.preventDefault();
    setTxnError(null);
    if (!txnHospital) { setTxnError('Please select a hospital.'); return; }
    const amountGenerated = parseFloat(txnAmountGen) || 0;
    const amountReceived = parseFloat(txnAmountRec) || 0;
    const opCount = parseInt(txnOpCount) || 0;
    const ipCount = parseInt(txnIpCount) || 0;
    const opinionCount = parseInt(txnOpinionCount) || 0;
    if (amountGenerated === 0 && amountReceived === 0 && opCount === 0 && ipCount === 0 && opinionCount === 0) {
      setTxnError('Enter at least one amount or count.');
      return;
    }
    const { error } = await supabase.from('revenue_transactions').insert({
      hospital_id: txnHospital,
      entry_date: txnDate,
      description: txnDescription,
      amount_generated: amountGenerated,
      amount_received: amountReceived,
      op_count: opCount,
      ip_count: ipCount,
      opinion_count: opinionCount,
    });
    if (error) { setTxnError(error.message); return; }
    setShowTxnForm(false);
    load();
  };

  const handleDeleteTxn = async (id: string) => {
    if (!confirm('Delete this transaction?')) return;
    await supabase.from('revenue_transactions').delete().eq('id', id);
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Revenue</h1>
          <p className="text-slate-500 text-sm mt-0.5">Track payments and revenue by hospital</p>
        </div>
        <button
          onClick={() => openPaymentForm()}
          disabled={hospitals.length === 0}
          className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 transition shadow-sm disabled:opacity-50"
        >
          <Plus className="w-4 h-4" />
          Record Payment
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select
          id="rev-filter-hospital"
          name="filterHospital"
          aria-label="Filter by hospital"
          value={selectedHospital}
          onChange={(e) => setSelectedHospital(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
        >
          <option value="all">All Hospitals</option>
          {hospitals.map((h) => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
        <select
          id="rev-filter-month"
          name="filterMonth"
          aria-label="Filter by month"
          value={selectedMonth}
          onChange={(e) => setSelectedMonth(e.target.value)}
          className="px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
        >
          <option value="all">All Months</option>
          {availableMonths.map((m) => (
            <option key={m} value={m}>
              {new Date(m + '-01').toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
            </option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center mb-3">
            <IndianRupee className="w-5 h-5 text-slate-600" />
          </div>
          <p className="text-2xl font-bold text-slate-800">{formatCurrency(totalFees)}</p>
          <p className="text-sm text-slate-400">Total Fees Billed</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalReceived)}</p>
          <p className="text-sm text-slate-400">Total Received</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5 text-red-600" />
          </div>
          <p className={`text-2xl font-bold ${totalPending > 0 ? 'text-red-600' : 'text-slate-500'}`}>
            {formatCurrency(totalPending)}
          </p>
          <p className="text-sm text-slate-400">Total Pending</p>
        </div>
      </div>

      {/* Hospital Breakdown */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <Building2 className="w-4 h-4 text-slate-500" />
          <h2 className="font-semibold text-slate-700">Revenue by Hospital</h2>
        </div>
        {hospitalRevenue.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No hospitals added yet.</p>
        ) : (
          <div className="space-y-3">
            {hospitalRevenue.map((hr) => {
              const pct = hr.fees > 0 ? Math.min(100, (hr.received / hr.fees) * 100) : 0;
              return (
                <div key={hr.hospital.id} className="p-4 rounded-lg border border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="font-medium text-slate-700">{hr.hospital.name}</p>
                      <p className="text-xs text-slate-400">{hr.patientCount} patients</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-sm font-medium text-emerald-600">{formatCurrency(hr.received)}</p>
                        <p className="text-xs text-slate-400">of {formatCurrency(hr.fees)}</p>
                      </div>
                      <button
                        onClick={() => openPaymentForm(hr.hospital.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-medium hover:bg-emerald-100 transition"
                      >
                        <Plus className="w-3 h-3" />
                        Record
                      </button>
                    </div>
                  </div>
                  <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  {hr.pending > 0 && (
                    <p className="text-xs text-red-500 mt-1.5">Pending: {formatCurrency(hr.pending)}</p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Payment History */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Payment History</h2>
        {filteredPayments.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No payments found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Patient</th>
                  <th className="px-3 py-2 font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredPayments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-50 group">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(p.payment_date)}</td>
                    <td className="px-3 py-2.5 text-slate-500">
                      {hospitals.find((h) => h.id === p.hospital_id)?.name || '—'}
                    </td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{p.patient?.patient_name || '—'}</td>
                    <td className="px-3 py-2.5 font-medium text-emerald-600">{formatCurrency(p.amount)}</td>
                    <td className="px-3 py-2.5 text-slate-400">{p.notes || '—'}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleDeletePayment(p.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Daily Entries (OP/IP/Fees) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-sky-500" />
            <h2 className="font-semibold text-slate-700">Daily Entries (OP / IP / Fees)</h2>
          </div>
          <button
            onClick={() => openEntryForm()}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-50 text-sky-600 rounded-lg text-sm font-medium hover:bg-sky-100 transition"
          >
            <Plus className="w-4 h-4" /> Add Entry
          </button>
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
                  <th className="px-3 py-2 font-medium">Notes</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredEntries.map((me) => (
                  <tr key={me.id} className="border-b border-slate-50 group">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(me.entry_date || me.month)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{me.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{me.op_patients}</td>
                    <td className="px-3 py-2.5 text-slate-600">{me.ip_patients}</td>
                    <td className="px-3 py-2.5 text-slate-600">{formatCurrency(me.fees_generated)}</td>
                    <td className="px-3 py-2.5 text-emerald-600 font-medium">{formatCurrency(me.fees_received)}</td>
                    <td className="px-3 py-2.5 text-slate-400 max-w-xs truncate">{me.notes || '—'}</td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => openEntryForm(me)}
                          className="opacity-0 group-hover:opacity-100 text-slate-400 hover:text-sky-500 transition p-1"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteEntry(me.id)}
                          className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition p-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Revenue Transactions — multiple OP/IP/Opinion + fee entries per hospital+day */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Receipt className="w-4 h-4 text-violet-500" />
            <h2 className="font-semibold text-slate-700">Daily Activity Transactions</h2>
          </div>
          <button
            onClick={() => openTxnForm()}
            disabled={hospitals.length === 0}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-50 text-violet-600 rounded-lg text-sm font-medium hover:bg-violet-100 transition disabled:opacity-50"
          >
            <Plus className="w-4 h-4" /> Add Transaction
          </button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Log any number of separate OP / IP / Opinion counts and fee entries for the same hospital and date — a morning round, evening OP, a cash or online settlement — and the day's totals below sum live across all of them.
        </p>

        {dailyRollup.length > 0 && (
          <div className="mb-5 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Entries</th>
                  <th className="px-3 py-2 font-medium">OP</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Opinion</th>
                  <th className="px-3 py-2 font-medium">Total Generated</th>
                  <th className="px-3 py-2 font-medium">Total Received</th>
                </tr>
              </thead>
              <tbody>
                {dailyRollup.map((r) => (
                  <tr key={`${r.hospitalId}::${r.date}`} className="border-b border-slate-50">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(r.date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{r.hospitalName}</td>
                    <td className="px-3 py-2.5 text-slate-500">{r.count}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.op}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.ip}</td>
                    <td className="px-3 py-2.5 text-slate-600">{r.opinion}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatCurrency(r.generated)}</td>
                    <td className="px-3 py-2.5 text-emerald-600 font-medium">{formatCurrency(r.received)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {filteredRevenueTransactions.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No transactions found for the selected filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                  <th className="px-3 py-2 font-medium">Date</th>
                  <th className="px-3 py-2 font-medium">Hospital</th>
                  <th className="px-3 py-2 font-medium">Description</th>
                  <th className="px-3 py-2 font-medium">OP</th>
                  <th className="px-3 py-2 font-medium">IP</th>
                  <th className="px-3 py-2 font-medium">Opinion</th>
                  <th className="px-3 py-2 font-medium">Generated</th>
                  <th className="px-3 py-2 font-medium">Received</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {filteredRevenueTransactions.map((rt) => (
                  <tr key={rt.id} className="border-b border-slate-50 group">
                    <td className="px-3 py-2.5 text-slate-600">{formatDate(rt.entry_date)}</td>
                    <td className="px-3 py-2.5 font-medium text-slate-700">{rt.hospital?.name || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-500">{rt.description || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{rt.op_count || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{rt.ip_count || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-600">{rt.opinion_count || '—'}</td>
                    <td className="px-3 py-2.5 text-slate-700">{formatCurrency(rt.amount_generated)}</td>
                    <td className="px-3 py-2.5 text-emerald-600 font-medium">{formatCurrency(rt.amount_received)}</td>
                    <td className="px-3 py-2.5">
                      <button
                        onClick={() => handleDeleteTxn(rt.id)}
                        className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Form Modal */}
      {showPaymentForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowPaymentForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Record Payment</h2>
              <button onClick={() => setShowPaymentForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddPayment} className="space-y-4">
              <div>
                <label htmlFor="pay-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
                <select
                  id="pay-hospital"
                  name="hospital"
                  required
                  value={payHospital}
                  onChange={(e) => {
                    setPayHospital(e.target.value);
                    setPayPatient('');
                  }}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white"
                >
                  <option value="">Select hospital...</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="pay-patient" className="block text-sm font-medium text-slate-600 mb-1.5">
                  Patient <span className="text-slate-400 font-normal">(optional)</span>
                </label>
                <select
                  id="pay-patient"
                  name="patient"
                  value={payPatient}
                  onChange={(e) => setPayPatient(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white"
                >
                  <option value="">No specific patient</option>
                  {patients
                    .filter((p) => !payHospital || p.hospital_id === payHospital)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.patient_name} ({p.unique_id})
                      </option>
                    ))}
                </select>
              </div>
              <div>
                <label htmlFor="pay-amount" className="block text-sm font-medium text-slate-600 mb-1.5">Amount (INR) *</label>
                <input
                  id="pay-amount"
                  name="amount"
                  type="number"
                  step="0.01"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                />
              </div>
              <div>
                <label htmlFor="pay-date" className="block text-sm font-medium text-slate-600 mb-1.5">Payment Date *</label>
                <input
                  id="pay-date"
                  name="paymentDate"
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                />
              </div>
              <div>
                <label htmlFor="pay-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
                <input
                  id="pay-notes"
                  name="notes"
                  type="text"
                  value={payNotes}
                  onChange={(e) => setPayNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                  placeholder="Optional..."
                />
              </div>
              {formError && <p className="text-sm text-red-600">{formError}</p>}
              <button type="submit" className="w-full py-2.5 bg-emerald-600 text-white rounded-lg font-medium hover:bg-emerald-700 transition">
                Save Payment
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Daily Entry Form Modal */}
      {showEntryForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowEntryForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">{editingEntryId ? 'Edit Daily Entry' : 'Add Daily Entry'}</h2>
              <button onClick={() => setShowEntryForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div>
                <label htmlFor="rev-entry-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
                <select
                  id="rev-entry-hospital"
                  name="hospital"
                  required
                  value={entryHospital}
                  onChange={(e) => setEntryHospital(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white"
                >
                  <option value="">Select hospital...</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="rev-entry-date" className="block text-sm font-medium text-slate-600 mb-1.5">Date *</label>
                <input
                  id="rev-entry-date"
                  name="entryDate"
                  type="date"
                  required
                  value={entryDate}
                  onChange={(e) => setEntryDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rev-entry-op" className="block text-sm font-medium text-slate-600 mb-1.5">OP Patients</label>
                  <input
                    id="rev-entry-op"
                    name="opPatients"
                    type="number"
                    value={entryOp}
                    onChange={(e) => setEntryOp(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="rev-entry-ip" className="block text-sm font-medium text-slate-600 mb-1.5">IP Patients</label>
                  <input
                    id="rev-entry-ip"
                    name="ipPatients"
                    type="number"
                    value={entryIp}
                    onChange={(e) => setEntryIp(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="rev-entry-fees-gen" className="block text-sm font-medium text-slate-600 mb-1.5">Fees Generated</label>
                  <input
                    id="rev-entry-fees-gen"
                    name="feesGenerated"
                    type="number"
                    step="0.01"
                    value={entryFeesGen}
                    onChange={(e) => setEntryFeesGen(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="rev-entry-fees-rec" className="block text-sm font-medium text-slate-600 mb-1.5">Fees Received</label>
                  <input
                    id="rev-entry-fees-rec"
                    name="feesReceived"
                    type="number"
                    step="0.01"
                    value={entryFeesRec}
                    onChange={(e) => setEntryFeesRec(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <label htmlFor="rev-entry-notes" className="block text-sm font-medium text-slate-600 mb-1.5">Notes</label>
                <input
                  id="rev-entry-notes"
                  name="notes"
                  type="text"
                  value={entryNotes}
                  onChange={(e) => setEntryNotes(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                  placeholder="Optional..."
                />
              </div>
              {entryError && <p className="text-sm text-red-600">{entryError}</p>}
              <button type="submit" className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition">
                {editingEntryId ? 'Update Entry' : 'Save Entry'}
              </button>
            </form>
          </div>
        </div>
      )}
      {/* Revenue Transaction Form Modal */}
      {showTxnForm && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={() => setShowTxnForm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-slate-800">Add Transaction</h2>
              <button onClick={() => setShowTxnForm(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleAddTxn} className="space-y-4">
              <div>
                <label htmlFor="txn-hospital" className="block text-sm font-medium text-slate-600 mb-1.5">Hospital *</label>
                <select
                  id="txn-hospital"
                  name="hospital"
                  required
                  value={txnHospital}
                  onChange={(e) => setTxnHospital(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none bg-white"
                >
                  <option value="">Select hospital...</option>
                  {hospitals.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="txn-date" className="block text-sm font-medium text-slate-600 mb-1.5">Date *</label>
                <input
                  id="txn-date"
                  name="txnDate"
                  type="date"
                  required
                  value={txnDate}
                  onChange={(e) => setTxnDate(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                />
              </div>
              <div>
                <label htmlFor="txn-description" className="block text-sm font-medium text-slate-600 mb-1.5">Description</label>
                <input
                  id="txn-description"
                  name="description"
                  type="text"
                  value={txnDescription}
                  onChange={(e) => setTxnDescription(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                  placeholder="e.g. Evening round fee, Cash settlement..."
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label htmlFor="txn-op" className="block text-sm font-medium text-slate-600 mb-1.5">OP Count</label>
                  <input
                    id="txn-op"
                    name="opCount"
                    type="number"
                    value={txnOpCount}
                    onChange={(e) => setTxnOpCount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="txn-ip" className="block text-sm font-medium text-slate-600 mb-1.5">IP Count</label>
                  <input
                    id="txn-ip"
                    name="ipCount"
                    type="number"
                    value={txnIpCount}
                    onChange={(e) => setTxnIpCount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="txn-opinion" className="block text-sm font-medium text-slate-600 mb-1.5">Opinion Count</label>
                  <input
                    id="txn-opinion"
                    name="opinionCount"
                    type="number"
                    value={txnOpinionCount}
                    onChange={(e) => setTxnOpinionCount(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="txn-amount-gen" className="block text-sm font-medium text-slate-600 mb-1.5">Amount Generated</label>
                  <input
                    id="txn-amount-gen"
                    name="amountGenerated"
                    type="number"
                    step="0.01"
                    value={txnAmountGen}
                    onChange={(e) => setTxnAmountGen(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
                <div>
                  <label htmlFor="txn-amount-rec" className="block text-sm font-medium text-slate-600 mb-1.5">Amount Received</label>
                  <input
                    id="txn-amount-rec"
                    name="amountReceived"
                    type="number"
                    step="0.01"
                    value={txnAmountRec}
                    onChange={(e) => setTxnAmountRec(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none"
                    placeholder="0"
                  />
                </div>
              </div>
              <p className="text-xs text-slate-400">Enter any combination — e.g. just an OP count, just a fee, or both — whatever this particular entry represents.</p>
              {txnError && <p className="text-sm text-red-600">{txnError}</p>}
              <button type="submit" className="w-full py-2.5 bg-violet-600 text-white rounded-lg font-medium hover:bg-violet-700 transition">
                Save Transaction
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
