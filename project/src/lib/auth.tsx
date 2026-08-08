import { createContext, useContext, useEffect, useState, useRef, ReactNode } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabase';
import { Lock } from 'lucide-react';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  locked: boolean;
  passwordRecovery: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  unlock: (password: string) => Promise<{ error: string | null }>;
  resetPassword: (email: string) => Promise<{ error: string | null }>;
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>;
}

const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [locked, setLocked] = useState(false);
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((event, newSession) => {
      setSession(newSession);
      if (!newSession) setLocked(false);
      if (event === 'PASSWORD_RECOVERY') setPasswordRecovery(true);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // Inactivity tracking — only when signed in and not already locked
  useEffect(() => {
    if (!session || locked) return;

    const resetTimer = () => {
      lastActivityRef.current = Date.now();
    };

    const events: (keyof WindowEventMap)[] = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click'];
    events.forEach((e) => window.addEventListener(e, resetTimer, { passive: true }));

    const interval = window.setInterval(() => {
      if (Date.now() - lastActivityRef.current >= INACTIVITY_TIMEOUT_MS) {
        setLocked(true);
      }
    }, 10000);

    return () => {
      events.forEach((e) => window.removeEventListener(e, resetTimer));
      window.clearInterval(interval);
    };
  }, [session, locked]);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string) => {
    const { error } = await supabase.auth.signUp({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    setLocked(false);
  };

  const unlock = async (password: string) => {
    if (!session?.user?.email) return { error: 'No active session' };
    const { error } = await supabase.auth.signInWithPassword({
      email: session.user.email,
      password,
    });
    if (error) return { error: error.message };
    lastActivityRef.current = Date.now();
    setLocked(false);
    return { error: null };
  };

  const resetPassword = async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin,
    });
    return { error: error?.message ?? null };
  };

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) return { error: error.message };
    setPasswordRecovery(false);
    return { error: null };
  };

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        loading,
        locked,
        passwordRecovery,
        signIn,
        signUp,
        signOut,
        unlock,
        resetPassword,
        updatePassword,
      }}
    >
      {children}
      {locked && session && <LockScreen onUnlock={unlock} onSignOut={signOut} />}
    </AuthContext.Provider>
  );
}

function LockScreen({
  onUnlock,
  onSignOut,
}: {
  onUnlock: (password: string) => Promise<{ error: string | null }>;
  onSignOut: () => Promise<void>;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const { error } = await onUnlock(password);
    setSubmitting(false);
    if (error) setError(error);
    else setPassword('');
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
            <Lock className="w-7 h-7 text-slate-500" />
          </div>
          <h2 className="text-xl font-bold text-slate-800">Session Locked</h2>
          <p className="text-sm text-slate-500 mt-1">
            For your patients' privacy, the app locked after 15 minutes of inactivity.
            Enter your password to continue.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          {error && (
            <div className="p-2.5 rounded-lg bg-red-50 text-red-600 text-sm text-center">{error}</div>
          )}
          <input
            type="password"
            autoFocus
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            className="w-full px-4 py-2.5 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium text-sm hover:bg-sky-700 transition disabled:opacity-50"
          >
            {submitting ? 'Unlocking...' : 'Unlock'}
          </button>
          <button
            type="button"
            onClick={onSignOut}
            className="w-full py-2 text-sm text-slate-400 hover:text-slate-600 transition"
          >
            Sign out instead
          </button>
        </form>
      </div>
    </div>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
