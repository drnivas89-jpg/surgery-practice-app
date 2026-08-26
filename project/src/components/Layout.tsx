import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LayoutDashboard, Users, Building2, DollarSign, LogOut, Stethoscope, FileBarChart, FileText, ClipboardList, Zap, Share2, KeyRound, X, CheckCircle2, AlertCircle, BookOpen, ChevronsLeft, ChevronsRight } from 'lucide-react';

export type View = 'dashboard' | 'patients' | 'hospitals' | 'revenue' | 'reports' | 'consent' | 'logbook' | 'col' | 'sharing' | 'publications';

interface LayoutProps {
  current: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

const SIDEBAR_COLLAPSED_KEY = 'sidebarCollapsed';

interface NavItem { id: View; label: string; icon: typeof LayoutDashboard }
interface NavSection { title: string; items: NavItem[] }

const navSections: NavSection[] = [
  {
    title: 'Overview',
    items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
  },
  {
    title: 'Clinical',
    items: [
      { id: 'patients', label: 'Patient Details', icon: Users },
      { id: 'hospitals', label: 'Hospitals', icon: Building2 },
      { id: 'logbook', label: 'Surgical Logbook', icon: ClipboardList },
      { id: 'consent', label: 'Consent Proformas', icon: FileText },
    ],
  },
  {
    title: 'Practice',
    items: [
      { id: 'revenue', label: 'Revenue', icon: DollarSign },
      { id: 'reports', label: 'Reports', icon: FileBarChart },
      { id: 'col', label: 'COL Dashboard', icon: Zap },
      { id: 'publications', label: 'Publications', icon: BookOpen },
    ],
  },
  {
    title: 'Collaboration',
    items: [{ id: 'sharing', label: 'Sharing', icon: Share2 }],
  },
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

// A tooltip that only appears (on hover/focus) when the sidebar is
// collapsed to icons-only — gives collapsed nav items a readable label
// without needing the full expanded width.
function CollapsedTooltip({ label }: { label: string }) {
  return (
    <span className="pointer-events-none absolute left-full ml-2 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 z-50">
    {label}
  </span>
  );
}

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
  }, [collapsed]);

  const sidebarWidth = collapsed ? 'w-[68px]' : 'w-60';

  return (
    <div className="min-h-screen bg-slate-50 flex">
      <aside className={`${sidebarWidth} bg-white border-r border-slate-200 flex flex-col fixed h-screen transition-[width] duration-300 ease-in-out z-40`}>
        <div className={`border-b border-slate-100 ${collapsed ? 'p-3' : 'p-5'}`}>
          <div className={`flex items-center ${collapsed ? 'justify-center' : 'gap-2.5'}`}>
            <div className="w-9 h-9 bg-sky-600 rounded-lg flex items-center justify-center flex-shrink-0">
              <Stethoscope className="w-5 h-5 text-white" />
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 leading-tight truncate">Surgery Practice</p>
                <p className="text-xs text-slate-400 truncate">Management Suite</p>
              </div>
            )}
          </div>
        </div>

        <nav className="flex-1 p-3 space-y-4 overflow-y-auto overflow-x-hidden">
          {navSections.map((section) => (
            <div key={section.title}>
              {!collapsed && (
                <p className="px-3 mb-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">{section.title}</p>
              )}
              <div className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const active = current === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => onNavigate(item.id)}
                      aria-label={item.label}
                      className={`group relative w-full flex items-center rounded-lg text-sm font-medium transition ${
                        collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                      } ${
                        active
                          ? 'bg-sky-50 text-sky-700'
                          : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                      }`}
                    >
                      {active && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-1 rounded-r-full bg-sky-600" />
                      )}
                      <Icon className="w-4 h-4 flex-shrink-0" />
                      {!collapsed && <span className="truncate">{item.label}</span>}
                      {collapsed && <CollapsedTooltip label={item.label} />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        <div className={`border-t border-slate-100 ${collapsed ? 'p-2' : 'p-3'}`}>
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`group relative w-full flex items-center rounded-lg text-sm font-medium text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition mb-1 ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            {collapsed ? <ChevronsRight className="w-4 h-4 flex-shrink-0" /> : <ChevronsLeft className="w-4 h-4 flex-shrink-0" />}
            {!collapsed && <span>Collapse</span>}
            {collapsed && <CollapsedTooltip label="Expand sidebar" />}
          </button>

          {!collapsed && (
            <div className="px-3 py-2 mb-1">
              <p className="text-xs text-slate-400 truncate">{user?.email}</p>
            </div>
          )}
          <button
            onClick={() => setShowChangePassword(true)}
            aria-label="Change Password"
            className={`group relative w-full flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <KeyRound className="w-4 h-4 flex-shrink-0" />
            {!collapsed && 'Change Password'}
            {collapsed && <CollapsedTooltip label="Change Password" />}
          </button>
          <button
            onClick={signOut}
            aria-label="Sign Out"
            className={`group relative w-full flex items-center rounded-lg text-sm font-medium text-slate-500 hover:bg-red-50 hover:text-red-600 transition ${
              collapsed ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
            }`}
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            {!collapsed && 'Sign Out'}
            {collapsed && <CollapsedTooltip label="Sign Out" />}
          </button>
        </div>
      </aside>

      <div className={`flex-1 transition-[margin] duration-300 ease-in-out ${collapsed ? 'ml-[68px]' : 'ml-60'}`}>
        <main className="p-6 max-w-7xl mx-auto">{children}</main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
