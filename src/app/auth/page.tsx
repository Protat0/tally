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
      <div className="min-h-screen bg-canvas flex items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-growth-tint border border-growth-edge mx-auto mb-5">
            <MailIcon className="w-8 h-8 text-growth-text" />
          </div>
          <h2 className="text-xl font-bold text-ink mb-2">Check your inbox</h2>
          <p className="text-sm text-ink-2 mb-6">
            We sent a confirmation link to <span className="text-ink font-medium">{email}</span>.
            Click it to activate your account, then come back to sign in.
          </p>
          <button
            onClick={() => { setConfirmed(false); switchMode('signin'); }}
            className="text-sm text-primary-text underline underline-offset-2"
          >
            Back to sign in
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-canvas flex flex-col items-center justify-center px-4 py-12">

      {/* Logo */}
      <div className="flex items-center gap-3 mb-10">
        <div className="h-11 w-11 rounded-2xl bg-primary flex items-center justify-center shadow-lg">
          <span className="text-lg font-bold text-on-primary">T</span>
        </div>
        <span className="text-2xl font-bold tracking-tight text-ink">Tally</span>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm rounded-3xl bg-surface border border-line p-8">

        {/* Mode tabs */}
        <div className="flex gap-1 mb-7 rounded-xl bg-raised p-1">
          {(['signin', 'signup'] as Mode[]).map(m => (
            <button
              key={m}
              onClick={() => switchMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors ${
                mode === m ? 'bg-primary text-on-primary shadow' : 'text-ink-2 hover:text-ink'
              }`}
            >
              {m === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          ))}
        </div>

        {/* Heading */}
        <div className="mb-6">
          <h1 className="text-lg font-semibold text-ink">
            {mode === 'signin' ? 'Welcome back' : 'Get started'}
          </h1>
          <p className="text-sm text-ink-3 mt-0.5">
            {mode === 'signin'
              ? 'Sign in to your Tally account.'
              : 'Create your free Tally account.'}
          </p>
        </div>

        {/* Email */}
        <div className="mb-4">
          <label className="text-xs text-ink-3 mb-1.5 block">Email address</label>
          <div className="relative">
            <MailIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-3 pointer-events-none" />
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={onKey}
              placeholder="you@example.com"
              autoComplete="email"
              className="w-full rounded-xl bg-canvas border border-line pl-10 pr-4 py-3 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary transition-colors"
            />
          </div>
        </div>

        {/* Password */}
        <div className="mb-6">
          <label className="text-xs text-ink-3 mb-1.5 block">Password</label>
          <div className="relative">
            <input
              type={showPassword ? 'text' : 'password'}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={onKey}
              placeholder={mode === 'signup' ? 'At least 6 characters' : '••••••••'}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              className="w-full rounded-xl bg-canvas border border-line pl-4 pr-11 py-3 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary transition-colors"
            />
            <button
              type="button"
              onClick={() => setShowPassword(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-3 hover:text-ink-2 transition-colors"
            >
              {showPassword
                ? <EyeOffIcon className="w-4 h-4" />
                : <EyeIcon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-4 rounded-xl bg-danger-tint border border-danger-edge px-4 py-3">
            <p className="text-sm text-danger-text">{error}</p>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={loading || !email.trim() || !password}
          className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary text-sm transition-colors active:bg-primary-hover hover:bg-primary-hover disabled:opacity-40 flex items-center justify-center gap-2"
        >
          {loading ? (
            <>
              <div className="h-4 w-4 rounded-full border-2 border-on-primary/30 border-t-on-primary animate-spin" />
              {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
            </>
          ) : (
            mode === 'signin' ? 'Sign in' : 'Create account'
          )}
        </button>

      </div>

      <p className="mt-6 text-xs text-ink-4">Your data stays private with row-level security.</p>
    </div>
  );
}
