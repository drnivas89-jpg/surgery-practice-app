import { ReactNode, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LayoutDashboard, Users, Building2, DollarSign, LogOut, Stethoscope, FileBarChart, FileText, ClipboardList, Zap, Share2, KeyRound, X, CheckCircle2, AlertCircle, BookOpen } from 'lucide-react';

export type View = 'dashboard' | 'patients' | 'hospitals' | 'revenue' | 'reports' | 'consent' | 'logbook' | 'col' | 'sharing' | 'publications';

interface LayoutProps {
  current: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'patients', label: 'Patient Details', icon: Users },
  { id: 'hospitals', label: 'Hospitals', icon: Building2 },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'logbook', label: 'Surgical Logbook', icon: ClipboardList },
  { id: 'consent', label: 'Consent Proformas', icon: FileText },
  { id: 'col', label: 'COL Dashboard', icon: Zap },
  { id: 'publications', label: 'Publications', icon: BookOpen },
  { id: 'sharing', label: 'Sharing', icon: Share2 },
];

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    if (password !== confirmPassword) { setError('Passwords do not match.'); return; }
    setSaving(true);
    const { error } = await updatePassword(password);
    setSaving(false);
    if (error) { setError(error); return; }
    setSuccess(true);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-800">Change Password</h2>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-slate-100 transition">
            <X className="w-4 h-4 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-sm text-emerald-700 bg-emerald-50 p-3 rounded-lg">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              Password updated successfully.
            </div>
            <button onClick={onClose} className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition">
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="cp-new-password" className="block text-sm font-medium text-slate-600 mb-1.5">New Password</label>
              <input
                id="cp-new-password"
                name="newPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                placeholder="At least 6 characters"
                autoFocus
              />
            </div>
            <div>
              <label htmlFor="cp-confirm-password" className="block text-sm font-medium text-slate-600 mb-1.5">Confirm New Password</label>
              <input
                id="cp-confirm-password"
                name="confirmNewPassword"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full px-3 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                placeholder="Re-enter new password"
              />
            </div>
            {error && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-lg border border-slate-200 text-slate-600 font-medium hover:bg-slate-50 transition">
                Cancel
              </button>
              <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition disabled:opacity-60">
                {saving ? 'Saving...' : 'Update'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className="w-60 bg-white border-r border-slate-200 flex flex-col fixed h-screen">
        <div className="p-5 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-sky-600 rounded-lg flex items-center justify-center">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800 leading-tight">Surgery Practice</p>
              <p className="text-xs text-slate-400">Management Suite</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = current === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  active
                    ? 'bg-sky-50 text-sky-700'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-3 border-t border-slate-100">
          <div className="px-3 py-2 mb-1">
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
          <button
            onClick={() => setShowChangePassword(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition"
          >
            <KeyRound className="w-4 h-4" />
            Change Password
          </button>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      <div className="flex-1 ml-60">
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
