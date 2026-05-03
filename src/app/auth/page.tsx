'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/AuthContext';
import { MailIcon, EyeIcon, EyeOffIcon, CheckIcon } from '@/components/Icons';

type Mode = 'signin' | 'signup';

export default function AuthPage() {
  const { signIn, signUp } = useAuth();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const switchMode = (m: Mode) => {
    setMode(m);
    setError('');
    setConfirmed(false);
  };

  const handleSubmit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true);
    setError('');

    if (mode === 'signin') {
      const err = await signIn(email.trim(), password);
      if (err) {
        setError(err);
        setLoading(false);
      }
      // on success: onAuthStateChange fires → AuthGuard redirects to /
    } else {
      const { error: err, needsConfirmation } = await signUp(email.trim(), password);
      if (err) {
        setError(err);
        setLoading(false);
      } else if (needsConfirmation) {
        setConfirmed(true);
        setLoading(false);
      }
      // on auto-confirm success: onAuthStateChange fires → AuthGuard redirects to /
    }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  };

  if (confirmed) {
    return (
      <div className="min-h-screen bg-[#0b0f1a] flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 border border-emerald-500/30 mx-auto mb-5">
            <MailIcon className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Check your inbox</h2>
          <p className="text-sm text-slate-400 mb-6">
            We sent a confirmation link to <span className="text-white font-medium">{email}</span>.
            Click it to activate your account, then come back to sign in.
          </p>
          <button
            onClick={() => { setConfirmed(false); switchMode('signin'); }}
            className="text-sm text-blue-400 underline underline-offset-2"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0b0f1a] flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="h-11 w-11 rounded-2xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center shadow-lg shadow-blue-900/40">
          <span className="text-lg font-bold text-white">T</span>
        </div>
        <span className="text-2xl font-bold tracking-tight text-white">Tally</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl bg-[#111827] border border-[#1e2d40] p-8">

        {/* Mode tabs */}
        <div className="flex gap-1 mb-7 rounded-xl bg-white/5 p-1">
          {(['signin', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-blue-600 text-white shadow' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-white">
            {mode === 'signin' ? 'Welcome back' : 'Get started'}
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {mode === 'signin'
              ? 'Sign in to your Tally account.'
              : 'Create your free Tally account.'}
          </p>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="text-xs text-slate-500 mb-1.5 block">Email address</label>
          <div className="relative">
            <MailIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={onKey}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] pl-10 pr-4 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="text-xs text-slate-500 mb-1.5 block">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKey}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] pl-4 pr-11 py-3 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/60 transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
            >
              {showPassword
                ? <EyeOffIcon className="w-4 h-4" />
                : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-red-500/10 border border-red-500/20 px-4 py-3">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !password}
          className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white text-sm transition-colors active:bg-blue-700 hover:bg-blue-500 disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
            </>
          ) : (
            mode === 'signin' ? 'Sign in' : 'Create account'
          )}
        </button>

      </div>

      <p className="mt-6 text-xs text-slate-600">Your data stays private with row-level security.</p>
    </div>
  );
}
