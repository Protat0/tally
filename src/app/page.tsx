'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useApp, fmt } from '@/components/AppContext';
import { cycleLabel, cycleRange, daysElapsedInCycle, daysInCycle } from '@/lib/cycle';
import { homeOrder } from '@/lib/electric';
import BottomNav from '@/components/BottomNav';
import ProgressBar, { type Tone } from '@/components/ProgressBar';
import PaydaySheet from '@/components/PaydaySheet';
import { CogIcon, ChevronRightIcon } from '@/components/Icons';

function paceTone(pct: number): Tone {
  if (pct <= 80) return 'growth';
  if (pct <= 110) return 'warning';
  return 'danger';
}

function paceLabel(pct: number): string {
  if (pct <= 80) return 'Under budget — great pace!';
  if (pct <= 110) return 'On track — keep it up.';
  return 'Overspending — slow down.';
}

// A tone as text. The fills are too dim to read as small type on a dark card,
// and the teal hero needs lighter shades again.
const toneText: Record<Tone, string> = {
  growth:  'text-growth-text',
  warning: 'text-warning-text',
  danger:  'text-danger-text',
  primary: 'text-primary-text',
};

const toneOnHero: Record<Tone, string> = {
  growth:  'text-green-200',
  warning: 'text-amber-200',
  danger:  'text-red-200',
  primary: 'text-teal-50',
};

const cardClass = 'rounded-2xl border border-line bg-surface';
const labelClass = 'text-[11px] font-semibold uppercase leading-none tracking-widest text-ink-3';

// One line of the projection breakdown. The card claims a number; this is where
// it shows its working.
function Row({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="min-w-0 flex-1">{label}</span>
        <span className="shrink-0 tabular-nums text-ink-2">{value}</span>
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-ink-4">{hint}</p>}
    </div>
  );
}

// One of the hero's desktop figures. On a phone each of these is its own card.
function HeroStat({ label, value, toneClass }: { label: string; value: string; toneClass: string }) {
  return (
    <div className="border-l border-white/20 px-[26px] last:pr-0">
      <p className="text-xs leading-tight text-teal-100">{label}</p>
      <p className={`mt-2 text-[22px] font-bold leading-none tabular-nums ${toneClass}`}>{value}</p>
    </div>
  );
}

// A running appliance's dot pings, so "on" reads at a glance; off is a still
// grey dot in the same spot, so toggling never shifts the name beside it.
function LiveDot({ on }: { on: boolean }) {
  return (
    <span aria-hidden className="relative flex h-2 w-2 shrink-0">
      {on && (
        <span className="absolute inline-flex h-full w-full rounded-full bg-primary opacity-60 motion-safe:animate-ping" />
      )}
      <span className={`relative inline-flex h-2 w-2 rounded-full ${on ? 'bg-primary' : 'bg-line-strong'}`} />
    </span>
  );
}

export default function Dashboard() {
  const {
    wallets, settings, totalBalance, projectedSavings,
    optimisticSavings, unconfirmedIncome, pendingPaydays,
    untrackedDays, blindSpend, assumedSpending,
    spendingPacePercent, daysUntilPayday, nextPaydayDate,
    electricBillEstimate, emergencyFund, currentCycle,
    totalSpentThisMonth, toggleAppliance,
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
  // The same cycle arithmetic spendingPacePercent uses. Measuring elapsed days
  // off the calendar instead would print a fraction that disagrees with the
  // percentage beside it the moment the cycle stops starting on the 1st.
  const daysElapsed = daysElapsedInCycle(currentCycle, settings.cycleStartDay, today);
  const cycleDays = daysInCycle(currentCycle, settings.cycleStartDay);
  const totalBills = settings.bills.reduce((s, b) => s + b.amount, 0);
  const discretionary = settings.monthlyIncome - totalBills;
  const expectedSoFar = discretionary > 0 ? discretionary * (daysElapsed / cycleDays) : 0;

  // The blind days run from the cycle's opening day, which need not be the 1st
  // of any month, so the range names its real dates instead of counting from one.
  const untrackedLabel = (() => {
    const { start } = cycleRange(currentCycle, settings.cycleStartDay);
    const last = new Date(start.getFullYear(), start.getMonth(), start.getDate() + untrackedDays - 1);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    const from = start.toLocaleDateString('en-PH', opts);
    if (untrackedDays <= 1) return `${from} untracked`;
    const to = last.getMonth() === start.getMonth()
      ? String(last.getDate())
      : last.toLocaleDateString('en-PH', opts);
    return `${from}–${to} untracked`;
  })();

  const nextPaydayStr = nextPaydayDate
    ? nextPaydayDate.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })
    : '—';
  const daysLeftStr = daysUntilPayday === 0
    ? 'Today'
    : `${daysUntilPayday} day${daysUntilPayday === 1 ? '' : 's'} left`;
  const paydayPhrase = daysUntilPayday === 0
    ? 'payday today'
    : `next payday in ${daysUntilPayday} day${daysUntilPayday === 1 ? '' : 's'}`;

  // The range is half-open, so its end is the day the next cycle opens.
  const resetsStr = cycleRange(currentCycle, settings.cycleStartDay).end
    .toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
  const cycleName = cycleLabel(currentCycle, settings.cycleStartDay);

  const pace = paceTone(spendingPacePercent);
  const savingsTone: Tone = projectedSavings >= 0 ? 'growth' : 'danger';

  const efPct = settings.emergencyFundTarget > 0
    ? Math.min(100, (ef.currentAmount / settings.emergencyFundTarget) * 100)
    : 0;

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

  // Every appliance can be switched from here; pinning only puts one first.
  const appliances = homeOrder(settings.appliances);
  const runningCount = settings.appliances.filter(a => a.enabled).length;

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        {/* ── Desktop header ── */}
        <header className="hidden md:flex items-center justify-between gap-6 border-b border-divider px-8 pt-6 pb-[18px]">
          <div>
            <h1 className="text-[22px] font-bold leading-tight tracking-tight">Dashboard</h1>
            <p className="mt-1.5 text-[13px] text-ink-3">
              {cycleName} cycle{nextPaydayDate && ` · ${paydayPhrase}`}
            </p>
          </div>
          <div className="flex gap-2.5">
            <Link
              href="/expenses/new"
              className="rounded-[10px] border border-line bg-surface px-[15px] py-[11px] text-[13.5px] font-semibold leading-none hover:border-primary-text hover:text-primary-text transition-colors"
            >
              Add expense
            </Link>
            <Link
              href="/wallets"
              className="rounded-[10px] bg-primary px-4 py-[11px] text-[13.5px] font-semibold leading-none text-on-primary hover:bg-primary-hover transition-colors"
            >
              Add funds
            </Link>
          </div>
        </header>

        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          {/* ── Mobile header ── */}
          <header className="flex items-center justify-between pt-14 pb-3 md:hidden">
            <div className="flex items-center gap-[9px]">
              <div className="flex h-[26px] w-[26px] items-center justify-center rounded-lg bg-primary">
                <span className="text-sm font-bold text-on-primary">T</span>
              </div>
              <span className="text-xl font-bold leading-none tracking-tight text-primary-text">Tally</span>
            </div>
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-line bg-surface text-ink-3 hover:border-primary-text hover:text-primary-text transition-colors"
            >
              <CogIcon className="w-[18px] h-[18px]" />
            </Link>
          </header>

          {/* ── Card grid ── */}
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 md:gap-4 md:pt-5">

            {/* Balance — the teal hero. On desktop it also carries the three
                figures that each get their own card on a phone. */}
            <div className="rounded-2xl bg-primary-deep px-4 pt-5 pb-[18px] elev-hero md:col-span-2 md:flex md:items-end md:justify-between md:px-7 md:py-[26px]">
              <div>
                <p className="text-[11px] font-semibold uppercase leading-none tracking-widest text-teal-100">Total balance</p>
                <p className="mt-2.5 text-[38px] font-bold leading-[1.1] tracking-[-0.035em] tabular-nums text-teal-50 md:mt-3 md:text-[46px]">
                  {fmt(totalBalance, currency)}
                </p>
                <p className="mt-[9px] flex items-center gap-[7px] text-[13px] leading-none text-teal-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-100" />
                  across {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                </p>
              </div>

              <div className="hidden pb-1.5 md:flex">
                <HeroStat label="Projected savings" value={fmt(projectedSavings, currency)} toneClass={toneOnHero[savingsTone]} />
                <HeroStat label="Next payday" value={nextPaydayStr} toneClass="text-teal-50" />
                <HeroStat label="Spending pace" value={`${spendingPacePercent.toFixed(0)}%`} toneClass={toneOnHero[pace]} />
              </div>
            </div>

            {/* Projected Savings — the conservative end, on purpose. Every way
                this number can be wrong (an unlogged expense, an untracked day,
                income that never arrived) pushes it up, so the headline is the
                floor and the ceiling is shown underneath as the stretch. */}
            <div className={`${cardClass} flex flex-col gap-2.5 px-4 py-[18px] md:p-[22px]`}>
              <div className="flex items-center justify-between">
                <p className={labelClass}>Projected savings</p>
                <span className={`h-2 w-2 rounded-full ${savingsTone === 'growth' ? 'bg-growth' : 'bg-danger'}`} />
              </div>

              <div>
                <p className={`text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-[32px] ${toneText[savingsTone]}`}>
                  {fmt(projectedSavings, currency)}
                </p>
                <p className="mt-1.5 text-[13px] leading-snug text-ink-2">realistic — if your pace holds</p>
                {optimisticSavings > projectedSavings && (
                  <p className="text-[13px] leading-snug text-ink-4">
                    up to <span className="tabular-nums text-ink-2">{fmt(optimisticSavings, currency)}</span>
                    {' '}if you spend nothing more
                  </p>
                )}
              </div>

              {unconfirmedIncome > 0 && (
                <button
                  onClick={() => setPaydayOpen(true)}
                  className="flex w-full items-start gap-[9px] rounded-[11px] border border-warning-edge bg-warning-tint px-3 py-2.5 text-left transition-colors hover:border-warning/60"
                >
                  <span className="mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full bg-warning" />
                  <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug text-warning-text">
                    Excludes <span className="tabular-nums">{fmt(unconfirmedIncome, currency)}</span> — payday not confirmed
                  </span>
                  <ChevronRightIcon className="mt-px h-4 w-4 shrink-0 text-warning-text/70" />
                </button>
              )}

              <button
                onClick={() => setShowBreakdown(v => !v)}
                className="self-start text-xs font-medium text-primary-text hover:text-primary-hover transition-colors"
              >
                {showBreakdown ? 'Hide maths' : 'How is this worked out?'}
              </button>

              {showBreakdown && (
                <div className="space-y-1.5 rounded-xl bg-canvas px-3 py-3 text-xs text-ink-3">
                  <Row label="Income counted" value={fmt(projectedSavings + totalBills + assumedSpending, currency)} />
                  <Row label="Bills" value={`− ${fmt(totalBills, currency)}`} />
                  <Row label="Logged so far" value={`− ${fmt(totalSpentThisMonth, currency)}`} />
                  {untrackedDays > 0 && (
                    <Row
                      label={untrackedLabel}
                      value={`− ${fmt(blindSpend, currency)}`}
                      hint="charged at your budget rate, not counted as zero"
                    />
                  )}
                  <Row label="Rest of cycle, at your pace" value={`− ${fmt(assumedSpending - totalSpentThisMonth - blindSpend, currency)}`} />
                </div>
              )}
            </div>

            {/* Payday — on desktop it rides in the hero instead */}
            <div className={`${cardClass} flex items-center justify-between p-4 md:hidden`}>
              <div>
                <p className={labelClass}>Next payday</p>
                <p className="mt-2 text-[19px] font-bold leading-none tracking-tight">{nextPaydayStr}</p>
              </div>
              {nextPaydayDate && (
                <span className="rounded-full border border-line bg-raised px-[11px] py-[7px] text-xs font-medium leading-none text-ink-2">
                  {daysLeftStr}
                </span>
              )}
            </div>

            {/* Spending Pace */}
            <div className={`${cardClass} flex flex-col gap-[11px] px-4 py-[18px] md:gap-[13px] md:p-[22px]`}>
              <div className="flex items-baseline justify-between">
                <p className={labelClass}>Spending pace</p>
                <p className={`text-sm font-bold leading-none tabular-nums ${toneText[pace]}`}>
                  {spendingPacePercent.toFixed(0)}%
                </p>
              </div>
              <ProgressBar value={spendingPacePercent} max={100} tone={pace} />
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-[13px] font-medium md:text-sm">{paceLabel(spendingPacePercent)}</p>
                <p className="text-[13px] tabular-nums text-ink-3">
                  {fmt(totalSpentThisMonth, currency)} / {fmt(expectedSoFar, currency)}
                </p>
              </div>
              <p className="mt-auto hidden text-[12.5px] text-ink-4 md:block">Resets {resetsStr}</p>
            </div>

            {/* Emergency Fund */}
            <div className={`${cardClass} flex flex-col gap-[11px] px-4 py-[18px] md:gap-[13px] md:p-[22px]`}>
              <div className="flex items-baseline justify-between">
                <p className={labelClass}>Emergency fund</p>
                {settings.emergencyFundTarget > 0 && (
                  <p className="text-sm font-bold leading-none tabular-nums text-growth-text">{efPct.toFixed(0)}%</p>
                )}
              </div>
              {settings.emergencyFundTarget > 0 ? (
                <>
                  <div className="flex flex-wrap items-baseline gap-x-[7px]">
                    <p className="text-[26px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums md:text-3xl">
                      {fmt(ef.currentAmount, currency)}
                    </p>
                    <p className="text-sm tabular-nums text-ink-3 md:text-[15px]">
                      of {fmt(settings.emergencyFundTarget, currency)}
                    </p>
                  </div>
                  <ProgressBar value={ef.currentAmount} max={settings.emergencyFundTarget} tone="growth" />
                  {projectedCompletion && (
                    <p className="text-[13px] text-ink-2 md:text-[13.5px]">Projected full by {projectedCompletion}</p>
                  )}
                </>
              ) : (
                <p className="text-sm text-ink-3">
                  <Link href="/settings" className="font-medium text-primary-text hover:text-primary-hover transition-colors">
                    Set a target
                  </Link>{' '}
                  to start tracking.
                </p>
              )}
            </div>

            {/* Electric Estimate */}
            <div className={`${cardClass} flex flex-col gap-3.5 px-4 py-[18px] md:p-[22px]`}>
              <div className="flex items-baseline justify-between">
                <p className={labelClass}>Electric estimate</p>
                <p className="text-xs text-ink-4">this cycle</p>
              </div>
              <p className="text-[30px] font-bold leading-[1.1] tracking-[-0.03em] tabular-nums">
                {fmt(electricBillEstimate, currency)}
              </p>

              {appliances.length > 0 && (
                <>
                  {/* Phone: a list of switches. A running row lights up whole —
                      tint, teal name, a live dot and a glowing switch — so what
                      is on reads from across the room, not just from the knob. */}
                  <div className="flex flex-col md:hidden">
                    {appliances.map(a => (
                      <div
                        key={a.id}
                        className={`-mx-2 flex items-center justify-between gap-3 border-t border-divider px-2 py-[11px] transition-colors duration-200 ${
                          a.enabled ? 'rounded-lg bg-primary-tint' : ''
                        }`}
                      >
                        <div className="flex min-w-0 items-center gap-2.5">
                          <LiveDot on={a.enabled} />
                          <div className="min-w-0">
                            <p className={`truncate text-sm font-medium leading-tight ${a.enabled ? 'text-primary-text' : ''}`}>
                              {a.name}
                            </p>
                            <p className={`mt-[3px] text-xs leading-tight tabular-nums ${a.enabled ? 'text-primary-text' : 'text-ink-4'}`}>
                              {a.enabled ? `On · ${a.wattage} W` : `${a.wattage} W`}
                            </p>
                          </div>
                        </div>
                        <button
                          role="switch"
                          aria-checked={a.enabled}
                          aria-label={a.name}
                          onClick={() => toggleAppliance(a.id)}
                          className={`flex h-7 w-12 shrink-0 rounded-full p-[3px] transition-colors duration-200 ${
                            a.enabled ? 'justify-end bg-primary elev-fab' : 'justify-start bg-line-strong'
                          }`}
                        >
                          <span className="h-[22px] w-[22px] rounded-full bg-white elev-knob" />
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* Desktop: tiles, each one the whole tap target */}
                  <div className="hidden grid-cols-2 gap-2.5 md:grid">
                    {appliances.map(a => (
                      <button
                        key={a.id}
                        role="switch"
                        aria-checked={a.enabled}
                        onClick={() => toggleAppliance(a.id)}
                        className={`min-w-0 rounded-xl border px-3.5 py-[13px] text-left transition-colors duration-200 ${
                          a.enabled ? 'border-primary bg-primary-tint elev-fab' : 'border-line bg-canvas hover:border-line-strong'
                        }`}
                      >
                        <span className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-2">
                            <LiveDot on={a.enabled} />
                            <span className={`truncate text-sm font-semibold leading-none ${a.enabled ? 'text-primary-text' : ''}`}>
                              {a.name}
                            </span>
                          </span>
                          <span
                            // Same padding either way, so the tile keeps its height when toggled.
                            className={`shrink-0 rounded-full px-2 py-[3px] text-[11px] font-semibold leading-none ${
                              a.enabled ? 'bg-primary text-on-primary' : 'text-ink-4'
                            }`}
                          >
                            {a.enabled ? 'ON' : 'OFF'}
                          </span>
                        </span>
                        <span className={`mt-[7px] block text-xs leading-none tabular-nums ${a.enabled ? 'text-primary-text' : 'text-ink-4'}`}>
                          {a.wattage} W
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}

              <div className="mt-auto flex items-center justify-between">
                <p className="text-xs text-ink-4">
                  {runningCount > 0
                    ? `${runningCount} of ${settings.appliances.length} running`
                    : 'No appliances running'}
                </p>
                <Link href="/expenses#electric" className="text-xs font-medium text-primary-text hover:text-primary-hover transition-colors">
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
