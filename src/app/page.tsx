'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp, fmt, getApplianceMinutes } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import ProgressBar from '@/components/ProgressBar';
import PaydaySheet from '@/components/PaydaySheet';
import { CogIcon, CalendarIcon, ShieldIcon, BoltIcon, TrendingUpIcon, AlertIcon, ChevronRightIcon } from '@/components/Icons';

function paceColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 80) return 'green';
  if (pct <= 110) return 'amber';
  return 'red';
}

// One line of the projection breakdown. The card claims a number; this is where
// it shows its working.
function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1">{label}</span>
        <span className="shrink-0 tabular-nums text-slate-300">{value}</span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-slate-600">{hint}</p>}
    </div>
  );
}

function paceLabel(pct: number): string {
  if (pct <= 80) return 'Under budget — great pace!';
  if (pct <= 110) return 'On track — keep it up.';
  return 'Overspending — slow down.';
}

export default function Dashboard() {
  const {
    wallets, settings, totalBalance, projectedSavings,
    optimisticSavings, unconfirmedIncome, pendingPaydays,
    untrackedDays, blindSpend, assumedSpending,
    spendingPacePercent, daysUntilPayday, nextPaydayDate,
    electricBillEstimate, emergencyFund,
    totalSpentThisMonth, toggleAppliance, setAppliancePinned,
  } = useApp();

  // Live ticker — keeps appliance costs fresh every 10 s
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);

  // Oldest unanswered payday first — asking about the 15th while the 1st is
  // still open would leave the older gap sitting there unresolved.
  const [paydayOpen, setPaydayOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const nextPending = pendingPaydays[0];

  const { currency } = settings;
  const ef = emergencyFund;

  const today = new Date();
  const daysElapsed = today.getDate();
  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const totalBills = settings.bills.reduce((s, b) => s + b.amount, 0);
  const discretionary = settings.monthlyIncome - totalBills;
  const expectedSoFar = discretionary > 0 ? discretionary * (daysElapsed / daysInMonth) : 0;
  const monthLabel = today.toLocaleDateString('en-PH', { month: 'short' });

  const nextPaydayStr = nextPaydayDate
    ? nextPaydayDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : '—';

  const projectedCompletion = (() => {
    if (settings.emergencyFundTarget <= 0 || ef.currentAmount >= settings.emergencyFundTarget) return null;
    const recent = ef.entries.slice(0, 3);
    if (recent.length === 0) return null;
    const avg = recent.reduce((s, e) => s + e.amount, 0) / recent.length;
    if (avg <= 0) return null;
    const months = Math.ceil((settings.emergencyFundTarget - ef.currentAmount) / avg);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  })();

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          {/* ── Header ── */}
          <header className="flex items-center justify-between pt-14 pb-5 md:pt-10 md:pb-6">
            {/* Mobile: logo wordmark */}
            <div className="flex items-center gap-2 md:hidden">
              <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
                <span className="text-xs font-bold text-white">T</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-white">Tally</span>
            </div>
            {/* Desktop: page title */}
            <h1 className="hidden md:block text-2xl font-bold text-white">Overview</h1>

            <div className="flex items-center gap-2">
              <Link
                href="/settings"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 md:hidden"
              >
                <CogIcon className="w-5 h-5 text-slate-400" />
              </Link>
            </div>
          </header>

          {/* ── Card grid ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* Balance — full width on desktop */}
            <div className="md:col-span-2 relative overflow-hidden rounded-2xl border border-blue-800/30 bg-gradient-to-br from-[#0d1f3c] to-[#0b1628] p-6 md:p-8">
              <div className="absolute -top-12 -right-12 h-48 w-48 rounded-full bg-blue-600/10 blur-3xl" />
              <div className="absolute -bottom-8 -left-8 h-36 w-36 rounded-full bg-blue-500/5 blur-2xl" />
              <div className="md:flex md:items-end md:justify-between">
                <div>
                  <p className="text-xs font-medium uppercase tracking-widest text-blue-400/70 mb-1">Total Balance</p>
                  <p className="text-4xl md:text-5xl font-bold text-white tabular-nums">
                    {fmt(totalBalance, currency)}
                  </p>
                  <p className="mt-1.5 text-xs text-slate-500">
                    across {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                  </p>
                </div>
                <Link href="/wallets" className="hidden md:inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 transition-colors mt-2 md:mt-0">
                  Manage wallets →
                </Link>
              </div>
            </div>

            {/* Projected Savings — the conservative end, on purpose. Every way
                this number can be wrong (an unlogged expense, an untracked day,
                income that never arrived) pushes it up, so the headline is the
                floor and the ceiling is shown underneath as the stretch. */}
            <div className="relative overflow-hidden rounded-2xl border border-emerald-800/30 bg-gradient-to-br from-[#0d2a20] to-[#0b1f18] p-6">
              <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-emerald-600/10 blur-3xl" />
              <p className="text-xs font-medium uppercase tracking-widest text-emerald-400/70 mb-1">Projected Savings</p>
              <p className={`text-4xl font-bold tabular-nums ${projectedSavings >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(projectedSavings, currency)}
              </p>
              <p className="mt-1.5 text-xs text-slate-500">realistic — if your pace holds</p>

              {optimisticSavings > projectedSavings && (
                <p className="mt-3 text-xs text-slate-500">
                  up to <span className="text-emerald-400/80 font-medium tabular-nums">{fmt(optimisticSavings, currency)}</span>
                  {' '}if you spend nothing more
                </p>
              )}

              {unconfirmedIncome > 0 && (
                <button
                  onClick={() => setPaydayOpen(true)}
                  className="mt-3 flex w-full items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/25 px-3 py-2.5 text-left active:bg-amber-500/20 transition-colors"
                >
                  <AlertIcon className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="flex-1 min-w-0 text-xs text-amber-300">
                    Excludes {fmt(unconfirmedIncome, currency)} — payday not confirmed
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-amber-400/70 shrink-0" />
                </button>
              )}

              <button
                onClick={() => setShowBreakdown(v => !v)}
                className="mt-3 text-xs text-emerald-400/70 hover:text-emerald-300 transition-colors"
              >
                {showBreakdown ? 'Hide maths' : 'How is this worked out?'}
              </button>

              {showBreakdown && (
                <div className="mt-3 space-y-1.5 rounded-xl bg-black/20 px-3 py-3 text-xs text-slate-400">
                  <Row label="Income counted" value={fmt(projectedSavings + totalBills + assumedSpending, currency)} />
                  <Row label="Bills" value={`− ${fmt(totalBills, currency)}`} />
                  <Row label="Logged so far" value={`− ${fmt(totalSpentThisMonth, currency)}`} />
                  {untrackedDays > 0 && (
                    <Row
                      label={`${monthLabel} 1–${untrackedDays} untracked`}
                      value={`− ${fmt(blindSpend, currency)}`}
                      hint="charged at your budget rate, not counted as zero"
                    />
                  )}
                  <Row label="Rest of month, at your pace" value={`− ${fmt(assumedSpending - totalSpentThisMonth - blindSpend, currency)}`} />
                </div>
              )}
            </div>

            {/* Payday chip */}
            <div className="flex items-center gap-4 rounded-2xl bg-[#111827] border border-[#1e2d40] px-6 py-5">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15 shrink-0">
                <CalendarIcon className="w-6 h-6 text-amber-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs text-slate-500">Next payday</p>
                <p className="text-sm font-semibold text-white mt-0.5">{nextPaydayStr}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-3xl font-bold text-amber-400">{daysUntilPayday}</p>
                <p className="text-[10px] text-slate-500">days left</p>
              </div>
            </div>

            {/* Spending Pace — full width */}
            <div className="md:col-span-2 rounded-2xl bg-[#111827] border border-[#1e2d40] p-5 md:p-6">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <TrendingUpIcon className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-medium text-white">Spending Pace</p>
                </div>
                <span className={`text-sm font-bold ${
                  paceColor(spendingPacePercent) === 'green' ? 'text-emerald-400'
                  : paceColor(spendingPacePercent) === 'amber' ? 'text-amber-400'
                  : 'text-red-400'
                }`}>
                  {spendingPacePercent.toFixed(0)}%
                </span>
              </div>
              <ProgressBar value={spendingPacePercent} max={100} color={paceColor(spendingPacePercent)} />
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-slate-500">{paceLabel(spendingPacePercent)}</p>
                <p className="text-xs text-slate-500">
                  {fmt(totalSpentThisMonth, currency)} / {fmt(expectedSoFar, currency)}
                </p>
              </div>
            </div>

            {/* Emergency Fund */}
            <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <ShieldIcon className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-medium text-white">Emergency Fund</p>
                </div>
                <Link href="/expenses" className="text-xs text-blue-400">Budget →</Link>
              </div>
              {settings.emergencyFundTarget > 0 ? (
                <>
                  <div className="flex items-end justify-between mb-2">
                    <p className="text-2xl font-bold text-white">{fmt(ef.currentAmount, currency)}</p>
                    <p className="text-xs text-slate-500">of {fmt(settings.emergencyFundTarget, currency)}</p>
                  </div>
                  <ProgressBar value={ef.currentAmount} max={settings.emergencyFundTarget} color="green" />
                  {projectedCompletion && (
                    <p className="mt-2 text-xs text-slate-500">Projected full by {projectedCompletion}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-slate-500">Set a target in Settings to start tracking.</p>
              )}
            </div>

            {/* Electric Bill */}
            <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <BoltIcon className="w-4 h-4 text-slate-400" />
                  <p className="text-sm font-medium text-white">Electric Bill</p>
                </div>
                <p className="text-2xl font-bold text-white">{fmt(electricBillEstimate, currency)}</p>
              </div>

              {/* Pinned appliance toggles */}
              {settings.appliances.filter(a => a.pinnedToHome).length > 0 && (
                <div className="space-y-2 mb-3">
                  {settings.appliances.filter(a => a.pinnedToHome).map(a => (
                    <div key={a.id} className="flex items-center gap-3">
                      <button
                        onClick={() => toggleAppliance(a.id)}
                        className={`relative h-6 w-10 rounded-full shrink-0 transition-colors duration-200 ${a.enabled ? 'bg-amber-500' : 'bg-white/10'}`}
                      >
                        <div className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all duration-200 ${a.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                      </button>
                      <p className="flex-1 text-sm text-white truncate">{a.name}</p>
                      <p className="text-xs text-slate-500">{a.wattage}W</p>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  {settings.appliances.filter(a => a.enabled).length > 0
                    ? `${settings.appliances.filter(a => a.enabled).length} of ${settings.appliances.length} running`
                    : 'No appliances running'}
                </p>
                <Link href="/expenses#electric" className="text-xs text-blue-400 hover:text-blue-300 transition-colors">
                  Manage →
                </Link>
              </div>
            </div>

          </div>
        </div>
      </div>

      {paydayOpen && nextPending && (
        <PaydaySheet payday={nextPending} onClose={() => setPaydayOpen(false)} />
      )}
    </div>
  );
}
