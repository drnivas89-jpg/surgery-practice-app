import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { Collaborator, Hospital, Patient, Surgery, MonthlyEntry, Attendance } from '@/lib/types';
import { formatCurrency, formatDate } from '@/lib/helpers';
import {
  Share2, UserPlus, Mail, Check, X, Trash2, Eye, ArrowLeft,
  Clock, ShieldCheck, Users, Building2, Activity,
} from 'lucide-react';

export default function Sharing() {
  const { user } = useAuth();
  const [outgoing, setOutgoing] = useState<Collaborator[]>([]);
  const [incoming, setIncoming] = useState<Collaborator[]>([]);
  const [ownerEmails, setOwnerEmails] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);

  // Read-only shared view
  const [viewingOwner, setViewingOwner] = useState<Collaborator | null>(null);
  const [sharedLoading, setSharedLoading] = useState(false);
  const [sharedHospitals, setSharedHospitals] = useState<Hospital[]>([]);
  const [sharedPatients, setSharedPatients] = useState<Patient[]>([]);
  const [sharedSurgeries, setSharedSurgeries] = useState<Surgery[]>([]);
  const [sharedEntries, setSharedEntries] = useState<MonthlyEntry[]>([]);
  const [sharedAttendance, setSharedAttendance] = useState<Attendance[]>([]);

  const load = async () => {
    if (!user) return;
    const incomingFilter = user.email
      ? `invited_user_id.eq.${user.id},invited_email.eq.${user.email}`
      : `invited_user_id.eq.${user.id}`;
    const [{ data: out }, { data: inc }] = await Promise.all([
      supabase.from('collaborators').select('*').eq('owner_user_id', user.id).order('created_at', { ascending: false }),
      supabase.from('collaborators').select('*').or(incomingFilter).order('created_at', { ascending: false }),
    ]);
    setOutgoing(out || []);
    setIncoming(inc || []);
    setLoading(false);

    // Look up owner emails for incoming shares
    const ownerIds = Array.from(new Set((inc || []).map((c) => c.owner_user_id)));
    const emailPairs = await Promise.all(
      ownerIds.map(async (id) => {
        const { data } = await supabase.rpc('user_email_for_collaborator', { p_user_id: id });
        return [id, (data as string) || 'Unknown'] as const;
      })
    );
    setOwnerEmails(Object.fromEntries(emailPairs));
  };

  useEffect(() => { load(); }, [user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    setInviteError(null);
    setInviteSuccess(null);
    if (!inviteEmail.trim()) return;
    if (!user) return;
    if (inviteEmail.trim().toLowerCase() === user.email?.toLowerCase()) {
      setInviteError("You can't invite yourself.");
      return;
    }
    setInviting(true);
    const { error } = await supabase.from('collaborators').insert({
      owner_user_id: user.id,
      invited_email: inviteEmail.trim().toLowerCase(),
      status: 'pending',
    });
    setInviting(false);
    if (error) { setInviteError(error.message); return; }
    setInviteSuccess(`Invitation sent to ${inviteEmail.trim()}.`);
    setInviteEmail('');
    load();
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Revoke this invitation? They will no longer be able to view your data.')) return;
    await supabase.from('collaborators').update({ status: 'revoked', responded_at: new Date().toISOString() }).eq('id', id);
    load();
  };

  const handleAccept = async (c: Collaborator) => {
    if (!user) return;
    await supabase.from('collaborators').update({
      invited_user_id: user.id,
      status: 'accepted',
      responded_at: new Date().toISOString(),
    }).eq('id', c.id);
    load();
  };

  const handleDecline = async (c: Collaborator) => {
    if (!user) return;
    await supabase.from('collaborators').update({
      invited_user_id: user.id,
      status: 'declined',
      responded_at: new Date().toISOString(),
    }).eq('id', c.id);
    load();
  };

  const openSharedView = async (c: Collaborator) => {
    setViewingOwner(c);
    setSharedLoading(true);
    const [{ data: h }, { data: p }, { data: s }, { data: me }, { data: att }] = await Promise.all([
      supabase.rpc('shared_hospitals', { p_owner_id: c.owner_user_id }),
      supabase.rpc('shared_patients', { p_owner_id: c.owner_user_id }),
      supabase.rpc('shared_surgeries', { p_owner_id: c.owner_user_id }),
      supabase.rpc('shared_monthly_entries', { p_owner_id: c.owner_user_id }),
      supabase.rpc('shared_attendance', { p_owner_id: c.owner_user_id }),
    ]);
    setSharedHospitals(h || []);
    setSharedPatients(p || []);
    setSharedSurgeries(s || []);
    setSharedEntries(me || []);
    setSharedAttendance(att || []);
    setSharedLoading(false);
  };

  const statusBadge = (status: Collaborator['status']) => {
    const map: Record<Collaborator['status'], string> = {
      pending: 'bg-amber-50 text-amber-700',
      accepted: 'bg-emerald-50 text-emerald-700',
      revoked: 'bg-slate-100 text-slate-500',
      declined: 'bg-red-50 text-red-600',
    };
    return <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${map[status]}`}>{status}</span>;
  };

  // --- Read-only shared practice view ---
  if (viewingOwner) {
    const hospitalStats = sharedHospitals.map((h) => {
      const hEntries = sharedEntries.filter((me) => me.hospital_id === h.id);
      const hOp = hEntries.reduce((s, me) => s + me.op_patients, 0);
      const hIp = hEntries.reduce((s, me) => s + me.ip_patients, 0);
      const patientById = new Map(sharedPatients.map((p) => [p.id, p]));
      const hSurgeries = sharedSurgeries.filter((s) => patientById.get(s.patient_id)?.hospital_id === h.id).length;
      const hAtt = sharedAttendance.filter((a) => a.hospital_id === h.id);
      const present = hAtt.filter((a) => a.status === 'present').length;
      const leave = hAtt.filter((a) => a.status === 'leave').length;
      return { hospital: h, hOp, hIp, hSurgeries, present, leave };
    });

    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <button onClick={() => setViewingOwner(null)} className="p-2 rounded-lg hover:bg-slate-100 transition">
            <ArrowLeft className="w-5 h-5 text-slate-500" />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-slate-800">{ownerEmails[viewingOwner.owner_user_id] || 'Shared Practice'}</h1>
            <p className="text-slate-500 text-sm mt-0.5 flex items-center gap-1.5">
              <Eye className="w-3.5 h-3.5" /> Read-only — you cannot edit this colleague's data
            </p>
          </div>
        </div>

        {sharedLoading ? (
          <div className="flex items-center justify-center h-40">
            <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Building2 className="w-4 h-4 text-sky-500" />
                <h2 className="font-semibold text-slate-700">Hospital-wise Summary (all-time)</h2>
              </div>
              {hospitalStats.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No hospital data shared yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide">
                        <th className="px-3 py-2 font-medium">Hospital</th>
                        <th className="px-3 py-2 font-medium text-right">OP</th>
                        <th className="px-3 py-2 font-medium text-right">IP</th>
                        <th className="px-3 py-2 font-medium text-right">Surgeries</th>
                        <th className="px-3 py-2 font-medium text-right">Present</th>
                        <th className="px-3 py-2 font-medium text-right">Leave</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hospitalStats.map((hs) => (
                        <tr key={hs.hospital.id} className="border-b border-slate-50">
                          <td className="px-3 py-2.5 font-medium text-slate-700">{hs.hospital.name}</td>
                          <td className="px-3 py-2.5 text-right text-sky-700">{hs.hOp}</td>
                          <td className="px-3 py-2.5 text-right text-emerald-700">{hs.hIp}</td>
                          <td className="px-3 py-2.5 text-right text-violet-700">{hs.hSurgeries}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{hs.present}</td>
                          <td className="px-3 py-2.5 text-right text-slate-600">{hs.leave}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="text-xs text-slate-400 mt-3">Fee amounts are not included in the shared view.</p>
            </div>

            <div className="bg-white rounded-xl border border-slate-200 p-5">
              <div className="flex items-center gap-2 mb-4">
                <Users className="w-4 h-4 text-sky-500" />
                <h2 className="font-semibold text-slate-700">Patients ({sharedPatients.length})</h2>
              </div>
              {sharedPatients.length === 0 ? (
                <p className="text-sm text-slate-400 py-4 text-center">No patients shared yet.</p>
              ) : (
                <div className="overflow-x-auto max-h-96 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-xs text-slate-500 uppercase tracking-wide sticky top-0 bg-white">
                        <th className="px-3 py-2 font-medium">Unique ID</th>
                        <th className="px-3 py-2 font-medium">Name</th>
                        <th className="px-3 py-2 font-medium">Hospital</th>
                        <th className="px-3 py-2 font-medium">Type</th>
                        <th className="px-3 py-2 font-medium">Diagnosis</th>
                        <th className="px-3 py-2 font-medium">Surgery Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sharedPatients.map((p) => (
                        <tr key={p.id} className="border-b border-slate-50">
                          <td className="px-3 py-2.5 font-mono text-xs text-sky-600">{p.unique_id}</td>
                          <td className="px-3 py-2.5 font-medium text-slate-700">{p.patient_name}</td>
                          <td className="px-3 py-2.5 text-slate-500">{sharedHospitals.find((h) => h.id === p.hospital_id)?.name || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500">{p.patient_type?.toUpperCase() || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500">{p.diagnosis || '—'}</td>
                          <td className="px-3 py-2.5 text-slate-500">{formatDate(p.surgery_date)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  }

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
        <h1 className="text-2xl font-bold text-slate-800">Sharing</h1>
        <p className="text-slate-500 text-sm mt-0.5">Share your practice data with a colleague, read-only, right from the app</p>
      </div>

      {/* Invite */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 mb-4">
          <UserPlus className="w-4 h-4 text-sky-500" />
          <h2 className="font-semibold text-slate-700">Invite a Colleague</h2>
        </div>
        <form onSubmit={handleInvite} className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@example.com"
              className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>
          <button
            type="submit"
            disabled={inviting}
            className="flex items-center justify-center gap-2 px-5 py-2.5 bg-sky-600 text-white rounded-lg text-sm font-medium hover:bg-sky-700 transition disabled:opacity-50"
          >
            <Share2 className="w-4 h-4" /> {inviting ? 'Sending...' : 'Send Invite'}
          </button>
        </form>
        {inviteError && <p className="text-sm text-red-600 mt-2">{inviteError}</p>}
        {inviteSuccess && <p className="text-sm text-emerald-600 mt-2">{inviteSuccess}</p>}
        <p className="text-xs text-slate-400 mt-3 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5" /> Colleagues get read-only access — they can view but never edit or delete your data.
        </p>
      </div>

      {/* People I've shared with */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">People I've Shared My Data With</h2>
        {outgoing.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">You haven't invited anyone yet.</p>
        ) : (
          <div className="space-y-2">
            {outgoing.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{c.invited_email}</p>
                  <p className="text-xs text-slate-400">Invited {formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {statusBadge(c.status)}
                  {c.status !== 'revoked' && (
                    <button onClick={() => handleRevoke(c.id)} className="text-slate-300 hover:text-red-500 transition p-1" title="Revoke access">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Shared with me */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h2 className="font-semibold text-slate-700 mb-4">Shared With Me</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-slate-400 py-4 text-center">No one has shared their data with you yet.</p>
        ) : (
          <div className="space-y-2">
            {incoming.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                <div>
                  <p className="text-sm font-medium text-slate-700">{ownerEmails[c.owner_user_id] || 'Loading...'}</p>
                  <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Invited {formatDate(c.created_at)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {c.status === 'pending' ? (
                    <>
                      <button onClick={() => handleAccept(c)} className="flex items-center gap-1 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-3 py-1.5 rounded-lg transition">
                        <Check className="w-3.5 h-3.5" /> Accept
                      </button>
                      <button onClick={() => handleDecline(c)} className="flex items-center gap-1 text-xs font-medium text-slate-500 bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg transition">
                        <X className="w-3.5 h-3.5" /> Decline
                      </button>
                    </>
                  ) : c.status === 'accepted' ? (
                    <>
                      {statusBadge(c.status)}
                      <button onClick={() => openSharedView(c)} className="flex items-center gap-1 text-xs font-medium text-sky-600 bg-sky-50 hover:bg-sky-100 px-3 py-1.5 rounded-lg transition">
                        <Eye className="w-3.5 h-3.5" /> View Data
                      </button>
                    </>
                  ) : (
                    statusBadge(c.status)
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
