import { ReactNode, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { LayoutDashboard, Users, Building2, DollarSign, LogOut, Stethoscope, FileBarChart, FileText, ClipboardList, Zap, Share2, KeyRound, X, CheckCircle2, AlertCircle, BookOpen, ChevronsLeft, ChevronsRight, Menu } from 'lucide-react';

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
      { id: 'patients', label: 'Surgical Cases', icon: Users },
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
    <span className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 whitespace-nowrap rounded-md bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 z-50">
      {label}
    </span>
  );
}

const ALL_ITEMS = navSections.flatMap((s) => s.items);

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { user, signOut } = useAuth();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1'; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  }, [collapsed]);

  // The mobile drawer never shows the collapsed (icons-only) variant.
  const iconsOnly = collapsed && !mobileOpen;
  const navigate = (view: View) => { onNavigate(view); setMobileOpen(false); };
  const currentLabel = ALL_ITEMS.find((i) => i.id === current)?.label || '';
  const initial = (user?.email || '?').charAt(0).toUpperCase();

  const sidebar = (
    <div className="flex h-full flex-col bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 text-slate-300">
      <div className={`flex items-center border-b border-white/5 ${iconsOnly ? 'justify-center p-3' : 'gap-3 px-5 py-5'}`}>
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center flex-shrink-0 shadow-lg shadow-sky-900/40">
          <Stethoscope className="w-5 h-5 text-white" />
        </div>
        {!iconsOnly && (
          <div className="min-w-0 flex-1">
            <p className="text-sm font-bold text-white leading-tight truncate">Surgery Practice</p>
            <p className="text-[11px] text-slate-400 truncate">Management Suite</p>
          </div>
        )}
        {mobileOpen && (
          <button onClick={() => setMobileOpen(false)} className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:bg-white/10" aria-label="Close menu">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto overflow-x-hidden">
        {navSections.map((section) => (
          <div key={section.title}>
            {!iconsOnly && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">{section.title}</p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const Icon = item.icon;
                const active = current === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => navigate(item.id)}
                    aria-label={item.label}
                    aria-current={active ? 'page' : undefined}
                    className={`group relative w-full flex items-center rounded-xl text-sm font-medium transition ${
                      iconsOnly ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
                    } ${
                      active
                        ? 'bg-gradient-to-r from-sky-500/20 to-teal-500/10 text-white ring-1 ring-inset ring-sky-400/20'
                        : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-[18px] h-[18px] flex-shrink-0 ${active ? 'text-sky-300' : ''}`} />
                    {!iconsOnly && <span className="truncate">{item.label}</span>}
                    {iconsOnly && <CollapsedTooltip label={item.label} />}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className={`border-t border-white/5 ${iconsOnly ? 'p-2' : 'p-3'} space-y-0.5`}>
        {!iconsOnly && (
          <div className="flex items-center gap-2.5 px-2 py-2 mb-1 rounded-xl bg-white/5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-sky-400 to-violet-500 flex items-center justify-center text-sm font-bold text-white flex-shrink-0">{initial}</div>
            <p className="text-xs text-slate-300 truncate">{user?.email}</p>
          </div>
        )}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          className={`hidden lg:flex group relative w-full items-center rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition ${
            iconsOnly ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          {collapsed ? <ChevronsRight className="w-4 h-4 flex-shrink-0" /> : <ChevronsLeft className="w-4 h-4 flex-shrink-0" />}
          {!iconsOnly && <span>Collapse</span>}
          {iconsOnly && <CollapsedTooltip label="Expand sidebar" />}
        </button>
        <button
          onClick={() => setShowChangePassword(true)}
          aria-label="Change Password"
          className={`group relative w-full flex items-center rounded-xl text-sm font-medium text-slate-400 hover:bg-white/5 hover:text-white transition ${
            iconsOnly ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <KeyRound className="w-4 h-4 flex-shrink-0" />
          {!iconsOnly && 'Change Password'}
          {iconsOnly && <CollapsedTooltip label="Change Password" />}
        </button>
        <button
          onClick={signOut}
          aria-label="Sign Out"
          className={`group relative w-full flex items-center rounded-xl text-sm font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-300 transition ${
            iconsOnly ? 'justify-center px-0 py-2.5' : 'gap-3 px-3 py-2.5'
          }`}
        >
          <LogOut className="w-4 h-4 flex-shrink-0" />
          {!iconsOnly && 'Sign Out'}
          {iconsOnly && <CollapsedTooltip label="Sign Out" />}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen">
      {/* Desktop sidebar */}
      <aside className={`hidden lg:block fixed inset-y-0 left-0 z-40 transition-[width] duration-300 ease-in-out ${collapsed ? 'w-[76px]' : 'w-64'}`}>
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <div className="absolute inset-0 bg-slate-950/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] shadow-2xl" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            {sidebar}
          </aside>
        </div>
      )}

      {/* Mobile top bar */}
      <header
        className="lg:hidden sticky top-0 z-30 flex items-center gap-3 bg-slate-900 px-4 py-3 text-white shadow-md"
        style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
      >
        <button onClick={() => setMobileOpen(true)} className="p-1.5 -ml-1.5 rounded-lg hover:bg-white/10" aria-label="Open menu">
          <Menu className="w-5 h-5" />
        </button>
        <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-sky-400 to-teal-500 flex items-center justify-center">
          <Stethoscope className="w-4 h-4 text-white" />
        </div>
        <p className="font-semibold truncate">{currentLabel}</p>
      </header>

      <div className={`transition-[margin] duration-300 ease-in-out ${collapsed ? 'lg:ml-[76px]' : 'lg:ml-64'}`}>
        <main className="px-4 py-5 sm:px-6 sm:py-7 max-w-7xl mx-auto" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.5rem)' }}>
          {children}
        </main>
      </div>

      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}
    </div>
  );
}
