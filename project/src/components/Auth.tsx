import { useState } from 'react';
import { useAuth } from '@/lib/auth';
import { Stethoscope, Mail, Lock, Phone, AlertCircle, CheckCircle2, ArrowLeft } from 'lucide-react';

export default function Auth() {
  const { signIn, signUp, resetPassword } = useAuth();
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const { error } = mode === 'signin' ? await signIn(email, password) : await signUp(email, password, phone);

    if (error) {
      setError(error);
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(email);
    setLoading(false);
    if (error) { setError(error); return; }
    setResetSent(true);
  };

  const switchMode = (m: 'signin' | 'signup' | 'forgot') => {
    setMode(m);
    setError(null);
    setResetSent(false);
    setPassword('');
    setPhone('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-sky-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-sky-600 rounded-2xl mb-4 shadow-lg shadow-sky-200">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-slate-800">Surgery Practice</h1>
          <p className="text-slate-500 mt-1">Manage your surgical practice with ease</p>
        </div>

        <div className="bg-white rounded-2xl shadow-xl shadow-slate-200/60 p-8">
          {mode !== 'forgot' && (
            <div className="flex gap-2 mb-6 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => switchMode('signin')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                  mode === 'signin' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                Sign In
              </button>
              <button
                onClick={() => switchMode('signup')}
                className={`flex-1 py-2.5 rounded-lg text-sm font-medium transition ${
                  mode === 'signup' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'
                }`}
              >
                Create Account
              </button>
            </div>
          )}

          {mode === 'forgot' ? (
            <>
              <button
                onClick={() => switchMode('signin')}
                className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition mb-4"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back to Sign In
              </button>

              {resetSent ? (
                <div className="flex items-start gap-3 text-sm text-emerald-700 bg-emerald-50 p-4 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
                  <span>
                    If an account exists for <strong>{email}</strong>, a password reset link has
                    been sent. Check your email and follow the link to set a new password.
                  </span>
                </div>
              ) : (
                <form onSubmit={handleResetSubmit} className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Enter your account email and we'll send you a link to reset your password.
                  </p>
                  <div>
                    <label htmlFor="reset-email" className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="reset-email"
                        name="email"
                        autoComplete="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                        placeholder="surgeon@example.com"
                      />
                    </div>
                  </div>

                  {error && (
                    <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                      <AlertCircle className="w-4 h-4 flex-shrink-0" />
                      <span>{error}</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition shadow-md shadow-sky-200 disabled:opacity-60"
                  >
                    {loading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </form>
              )}
            </>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label htmlFor="auth-email" className="block text-sm font-medium text-slate-600 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="auth-email"
                      name="email"
                      autoComplete="email"
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                      placeholder="surgeon@example.com"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label htmlFor="auth-password" className="block text-sm font-medium text-slate-600">Password</label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-xs font-medium text-sky-600 hover:text-sky-700 transition"
                      >
                        Forgot password?
                      </button>
                    )}
                  </div>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <input
                      id="auth-password"
                      name="password"
                      autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                      placeholder="At least 6 characters"
                    />
                  </div>
                </div>

                {mode === 'signup' && (
                  <div>
                    <label htmlFor="auth-phone" className="block text-sm font-medium text-slate-600 mb-1.5">Phone Number</label>
                    <div className="relative">
                      <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <input
                        id="auth-phone"
                        name="phone"
                        autoComplete="tel"
                        type="tel"
                        required
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-slate-200 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none transition"
                        placeholder="e.g. 9876543210"
                      />
                    </div>
                  </div>
                )}

                {error && (
                  <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 bg-sky-600 text-white rounded-lg font-medium hover:bg-sky-700 transition shadow-md shadow-sky-200 disabled:opacity-60"
                >
                  {loading
                    ? 'Please wait...'
                    : mode === 'signin'
                    ? 'Sign In'
                    : 'Create Account'}
                </button>
              </form>

              {mode === 'signup' && (
                <p className="text-xs text-slate-400 mt-4 text-center">
                  Each surgeon gets their own private workspace. Your data is visible only to you.
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
