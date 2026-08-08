import { ReactNode } from 'react';
import { useAuth } from '@/lib/auth';
import { LayoutDashboard, Users, Building2, DollarSign, LogOut, Stethoscope, FileBarChart, FileText, ClipboardList, Zap, Share2 } from 'lucide-react';

export type View = 'dashboard' | 'patients' | 'hospitals' | 'revenue' | 'reports' | 'consent' | 'logbook' | 'col' | 'sharing';

interface LayoutProps {
  current: View;
  onNavigate: (view: View) => void;
  children: ReactNode;
}

const navItems: { id: View; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'patients', label: 'Surgical Patients', icon: Users },
  { id: 'hospitals', label: 'Hospitals', icon: Building2 },
  { id: 'revenue', label: 'Revenue', icon: DollarSign },
  { id: 'reports', label: 'Reports', icon: FileBarChart },
  { id: 'logbook', label: 'Surgical Logbook', icon: ClipboardList },
  { id: 'consent', label: 'Consent Proformas', icon: FileText },
  { id: 'col', label: 'COL Dashboard', icon: Zap },
  { id: 'sharing', label: 'Sharing', icon: Share2 },
];

export default function Layout({ current, onNavigate, children }: LayoutProps) {
  const { user, signOut } = useAuth();

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
    </div>
  );
}
