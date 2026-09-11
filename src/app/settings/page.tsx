'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useApp, PaydayCycle, fmt } from '@/components/AppContext';
import { useAuth } from '@/components/AuthContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import NumberField from '@/components/NumberField';
import WalletPicker from '@/components/WalletPicker';
import BottomSheet from '@/components/BottomSheet';
import { ScrollLock } from '@/components/ModalLock';
import ThemeSwitch from '@/components/ThemeSwitch';
import { cycleRange, currentCycleKey } from '@/lib/cycle';
import { PlusIcon, LogOutIcon, BoltIcon, ChevronLeftIcon, ChevronRightIcon, AlertIcon, XIcon } from '@/components/Icons';
import { IconTile } from '@/components/AppIcon';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-7">
      <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-3 px-1">{title}</p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function SettingRow({ label, sub, children }: { label: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl bg-surface border border-line px-4 py-3.5">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-ink">{label}</p>
        {sub && <p className="text-xs text-ink-3 mt-0.5">{sub}</p>}
      </div>
      {children}
    </div>
  );
}

function NumInput({ value, onChange, step = 1, placeholder = '0' }: { value: number; onChange: (v: number) => void; step?: number; placeholder?: string }) {
  return (
    <NumberField
      value={value}
      onChange={onChange}
      step={step}
      min={0}
      placeholder={placeholder}
      inputClassName="w-24 rounded-lg bg-canvas border border-line px-3 py-1.5 text-right text-sm text-ink outline-none focus:border-primary"
    />
  );
}

// The span the current period would have at a given start day. cycleLabel
// prints a bare month name at day 1, which reads as a date rather than as the
// period a day-of-month setting produces, so this always spells the span out.
function periodSpan(startDay: number): string {
  const { start, end } = cycleRange(currentCycleKey(startDay), startDay);
  // Half-open, so the last day the user lives through is the day before it ends.
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-PH', opts)} – ${last.toLocaleDateString('en-PH', opts)}`;
}

// Deletes everything. Gated behind typing the word rather than a second tap —
// a mis-tap must not be able to wipe an account.
const CONFIRM_WORD = 'RESET';

function ResetAccountModal({ onClose }: { onClose: () => void }) {
  const { resetAccount } = useApp();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);

  const handleReset = async () => {
    setBusy(true);
    await resetAccount();
    setBusy(false);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={onClose}>
      <ScrollLock />
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm rounded-2xl bg-surface border border-line p-6"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-tint shrink-0">
            <AlertIcon className="w-5 h-5 text-danger-text" />
          </div>
          <h2 className="text-base font-semibold text-ink">Reset account</h2>
        </div>

        <p className="text-xs text-ink-2 leading-relaxed mb-3">
          Deletes <span className="text-danger-text">every wallet, expense, income,
          transfer, debt, bill, appliance and custom category</span>, and clears
          all budget amounts. Only your currency, payday cycle and electricity
          rate are kept.
        </p>
        <p className="text-xs text-ink-3 mb-4">
          This cannot be undone. There is no export and no backup.
        </p>

        <label className="block text-xs text-ink-3 mb-2">
          Type <span className="font-semibold text-ink-2">{CONFIRM_WORD}</span> to confirm
        </label>
        <input
          type="text"
          value={typed}
          onChange={e => setTyped(e.target.value)}
          autoFocus
          className="w-full rounded-xl bg-canvas border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary mb-5"
        />

        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-raised py-3 text-sm font-medium text-ink-2 hover:bg-line transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleReset}
            disabled={typed !== CONFIRM_WORD || busy}
            className="flex-1 rounded-xl bg-danger-strong py-3 text-sm font-semibold text-white hover:bg-danger disabled:opacity-40 transition-colors"
          >
            {busy ? 'Resetting…' : 'Reset everything'}
          </button>
        </div>
      </div>
    </div>
  );
}

function ResetModal({ onClose }: { onClose: () => void }) {
  const { wallets, settings, resetBalances } = useApp();
  // Prefill each input with the wallet's current balance so untouched wallets keep their value.
  const [balances, setBalances] = useState<Record<string, string>>(
    () => Object.fromEntries(wallets.map(w => [w.id, String(w.balance)]))
  );
  const [index, setIndex] = useState(0);
  const [busy, setBusy] = useState(false);
  const touchX = useRef(0);

  const count = wallets.length;
  const isLast = index >= count - 1;
  const clamp = (i: number) => Math.max(0, Math.min(count - 1, i));
  const go = (i: number) => setIndex(clamp(i));

  const onTouchStart = (e: React.TouchEvent) => { touchX.current = e.touches[0].clientX; };
  const onTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchX.current;
    if (dx > 40) go(index - 1);
    else if (dx < -40) go(index + 1);
  };

  const confirm = async () => {
    setBusy(true);
    const parsed = Object.fromEntries(
      wallets.map(w => [w.id, parseFloat(balances[w.id]) || 0])
    );
    await resetBalances(parsed);
    onClose();
  };

  const current = wallets[index];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/60 p-0 md:p-4" onClick={onClose}>
      <ScrollLock />
      <div
        className="w-full md:max-w-md rounded-t-2xl md:rounded-2xl bg-surface border border-line max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-tint shrink-0">
              <AlertIcon className="w-5 h-5 text-danger-text" />
            </div>
            <h2 className="text-base font-semibold text-ink">Reset balances</h2>
          </div>
          <button onClick={onClose} className="text-ink-3 hover:text-ink p-1">
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        <div className="px-5 pb-4">
          <p className="text-xs text-ink-2 leading-relaxed">
            Enter each wallet&apos;s current real balance. This will also{' '}
            <span className="text-danger-text">delete this cycle&apos;s expenses</span> and{' '}
            <span className="text-danger-text">reset electric usage</span> to zero. This can&apos;t be undone.
          </p>
        </div>

        {count === 0 ? (
          <p className="text-sm text-ink-3 py-8 text-center">No wallets to reset.</p>
        ) : (
          <>
            {/* Carousel — one wallet card at a time */}
            <div className="px-5">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => go(index - 1)}
                  disabled={index === 0}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink-2 disabled:opacity-25 active:bg-line transition-colors"
                  aria-label="Previous wallet"
                >
                  <ChevronLeftIcon className="w-5 h-5" />
                </button>

                <div
                  className="flex-1 rounded-2xl bg-canvas border border-line px-5 py-6"
                  onTouchStart={onTouchStart}
                  onTouchEnd={onTouchEnd}
                >
                  <div className="flex flex-col items-center text-center">
                    <IconTile icon={current.icon} fallback="wallet" size="lg" className="mb-3" />
                    <p className="text-base font-semibold text-ink">{current.name}</p>
                    <p className="text-xs text-ink-3 mt-0.5">
                      Current: {fmt(current.balance, settings.currency)}
                    </p>

                    <p className="text-[11px] font-semibold uppercase tracking-widest text-ink-3 mt-5 mb-2">
                      New balance
                    </p>
                    <div className="flex items-center gap-1.5">
                      <span className="text-lg text-ink-3">{settings.currency}</span>
                      <input
                        type="number"
                        inputMode="decimal"
                        value={balances[current.id] ?? ''}
                        onChange={e => setBalances(prev => ({ ...prev, [current.id]: e.target.value }))}
                        className="w-40 rounded-xl bg-canvas border border-line px-3 py-2 text-center text-2xl font-bold text-ink outline-none focus:border-primary"
                        autoFocus
                      />
                    </div>
                  </div>
                </div>

                <button
                  onClick={() => go(index + 1)}
                  disabled={isLast}
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-raised text-ink-2 disabled:opacity-25 active:bg-line transition-colors"
                  aria-label="Next wallet"
                >
                  <ChevronRightIcon className="w-5 h-5" />
                </button>
              </div>

              {/* Dots + position */}
              <div className="flex items-center justify-center gap-1.5 mt-4">
                {wallets.map((w, i) => (
                  <button
                    key={w.id}
                    onClick={() => go(i)}
                    aria-label={`Go to ${w.name}`}
                    className={`h-1.5 rounded-full transition-all ${i === index ? 'w-5 bg-primary' : 'w-1.5 bg-line-strong'}`}
                  />
                ))}
              </div>
              <p className="text-center text-[11px] text-ink-3 mt-2">
                Wallet {index + 1} of {count}
              </p>
            </div>

            <div className="flex gap-3 p-5">
              <button
                onClick={onClose}
                className="flex-1 rounded-xl bg-raised border border-line py-3 text-sm font-medium text-ink-2 active:bg-line transition-colors"
              >
                Cancel
              </button>
              {isLast ? (
                <button
                  onClick={confirm}
                  disabled={busy}
                  className="flex-1 rounded-xl bg-danger-strong py-3 text-sm font-semibold text-white active:bg-danger disabled:opacity-50 transition-colors"
                >
                  {busy ? 'Resetting…' : 'Reset'}
                </button>
              ) : (
                <button
                  onClick={() => go(index + 1)}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-on-primary active:bg-primary-hover transition-colors"
                >
                  Next
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { settings, updateSettings, setCycleStartDay, totalBalance, wallets } = useApp();
  const { signOut, user } = useAuth();

  const [customPayday, setCustomPayday] = useState('');
  const [resetOpen, setResetOpen] = useState(false);
  const [resetAccountOpen, setResetAccountOpen] = useState(false);
  // What the field currently shows. Editing it changes nothing on its own: the
  // sheet is modal, so opening it per keystroke made every value whose first
  // digit was not already the answer unreachable, and offered "Change cycle" on
  // an intermediate number the user never meant. Applying is a separate tap.
  const [pendingCycleDay, setPendingCycleDay] = useState<number | null>(null);
  const [confirmCycleDay, setConfirmCycleDay] = useState<number | null>(null);
  const [cycleBusy, setCycleBusy] = useState(false);
  const cycleDayShown = pendingCycleDay ?? settings.cycleStartDay;
  const cycleDayChanged = cycleDayShown !== settings.cycleStartDay;

  const addCustomPayday = () => {
    const d = parseInt(customPayday);
    if (isNaN(d) || d < 1 || d > 31 || settings.customPaydays.includes(d)) return;
    updateSettings({ customPaydays: [...settings.customPaydays, d].sort((a, b) => a - b) });
    setCustomPayday('');
  };

  const removeCustomPayday = (d: number) =>
    updateSettings({ customPaydays: settings.customPaydays.filter(x => x !== d) });

  const CYCLES: { key: PaydayCycle; label: string }[] = [
    { key: '1st-15th', label: '1st & 15th' },
    { key: 'monthly', label: 'Monthly (1st)' },
    { key: 'custom', label: 'Custom days' },
  ];

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-2xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader title="Settings" />

          {/* General */}
          <Section title="General">
            <SettingRow label="Light mode" sub="Saved on this device">
              <ThemeSwitch />
            </SettingRow>
            <SettingRow label="Currency symbol">
              <input
                type="text"
                value={settings.currency}
                onChange={e => updateSettings({ currency: e.target.value })}
                className="w-16 rounded-lg bg-canvas border border-line px-3 py-1.5 text-center text-sm text-ink outline-none focus:border-primary"
                maxLength={3}
              />
            </SettingRow>
          </Section>

          {/* Payday */}
          <Section title="Payday Cycle">
            <div className="rounded-xl bg-surface border border-line p-4">
              <div className="flex gap-2 mb-4">
                {CYCLES.map(c => (
                  <button
                    key={c.key}
                    onClick={() => updateSettings({ paydayCycle: c.key })}
                    className={`flex-1 rounded-lg py-2 text-xs font-medium transition-colors ${settings.paydayCycle === c.key ? 'bg-primary text-on-primary' : 'bg-raised text-ink-2'}`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
              {/* Where the salary lands. Knowing this turns the payday
                  confirmation prompt into a single tap. */}
              <div className="mb-4">
                <p className="text-xs text-ink-3 mb-2">Salary lands in</p>
                {wallets.length === 0 ? (
                  <p className="text-xs text-ink-4">Add a wallet first.</p>
                ) : (
                  <WalletPicker
                    value={settings.cashflowWalletId ?? ''}
                    onChange={id => updateSettings({ cashflowWalletId: id })}
                  />
                )}
              </div>

              {settings.paydayCycle === 'custom' && (
                <div>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {settings.customPaydays.map(d => (
                      <div key={d} className="flex items-center gap-1 rounded-full bg-primary-tint border border-primary-edge pl-3 pr-1.5 py-1">
                        <span className="text-xs text-primary-hover">Day {d}</span>
                        <button onClick={() => removeCustomPayday(d)} className="ml-0.5 text-primary-text hover:text-primary-hover">×</button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      inputMode="numeric"
                      value={customPayday}
                      onChange={e => setCustomPayday(e.target.value)}
                      placeholder="Day (1–31)"
                      min={1} max={31}
                      className="flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink outline-none focus:border-primary placeholder-ink-4"
                    />
                    <button onClick={addCustomPayday} className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
                      <PlusIcon className="w-4 h-4 text-on-primary" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </Section>

          {/* Budget cycle */}
          <Section title="Budget Cycle">
            <SettingRow
              label="Cycle starts on day"
              sub={`This period: ${periodSpan(settings.cycleStartDay)}`}
            >
              <NumInput
                value={cycleDayShown}
                onChange={v => setPendingCycleDay(Math.min(Math.max(Math.round(v), 1), 31))}
              />
            </SettingRow>
            {cycleDayChanged && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary-edge bg-primary-tint px-4 py-3">
                <p className="min-w-0 flex-1 text-xs text-primary-hover">
                  Day {cycleDayShown} would make this period {periodSpan(cycleDayShown)}.
                </p>
                <button
                  onClick={() => setConfirmCycleDay(cycleDayShown)}
                  className="shrink-0 rounded-lg bg-primary px-4 py-2 text-xs font-semibold text-on-primary active:bg-primary-hover transition-colors"
                >
                  Apply
                </button>
              </div>
            )}
            <p className="mt-2 px-1 text-xs text-ink-3">
              Set this to the day your bills land. Day 1 is the plain calendar month.
            </p>
          </Section>

          {/* Emergency fund */}
          <Section title="Emergency Fund">
            <SettingRow label="Target amount" sub="Your total savings goal">
              <NumInput value={settings.emergencyFundTarget} onChange={v => updateSettings({ emergencyFundTarget: v })} step={500} />
            </SettingRow>
          </Section>

          {/* Tools */}
          <Section title="Tools">
            <Link
              href="/expenses#electric"
              className="flex items-center gap-4 rounded-xl bg-surface border border-line px-4 py-3.5 hover:bg-raised transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-warning-tint shrink-0">
                <BoltIcon className="w-5 h-5 text-warning-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Electric Bill Estimator</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  {settings.appliances.length > 0
                    ? `${settings.appliances.length} appliance${settings.appliances.length !== 1 ? 's' : ''} configured`
                    : 'Add appliances to estimate your bill'}
                </p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-ink-4 shrink-0" />
            </Link>
          </Section>

          {/* Danger zone */}
          <Section title="Reset">
            <button
              onClick={() => setResetOpen(true)}
              className="flex w-full items-center gap-4 rounded-xl bg-surface border border-danger-edge px-4 py-3.5 text-left hover:bg-raised transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-tint shrink-0">
                <AlertIcon className="w-5 h-5 text-danger-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-ink">Reset balances</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  Re-enter wallet balances · clears this cycle&apos;s expenses &amp; electric usage
                </p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-ink-4 shrink-0" />
            </button>
            <button
              onClick={() => setResetAccountOpen(true)}
              className="flex w-full items-center gap-4 rounded-xl bg-surface border border-danger-edge px-4 py-3.5 text-left hover:bg-raised transition-colors"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-danger-tint shrink-0">
                <AlertIcon className="w-5 h-5 text-danger-text" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-danger-text">Reset account</p>
                <p className="text-xs text-ink-3 mt-0.5">
                  Deletes wallets, all history, debts, bills &amp; budgets
                </p>
              </div>
              <ChevronRightIcon className="w-4 h-4 text-ink-4 shrink-0" />
            </button>
            <p className="text-xs text-ink-4 px-1">
              Current total across wallets: {fmt(totalBalance, settings.currency)}
            </p>
          </Section>

          {/* Account — mobile sign-out */}
          <div className="mt-2 md:hidden">
            <p className="text-xs font-semibold uppercase tracking-widest text-ink-3 mb-3 px-1">Account</p>
            {user && <p className="text-xs text-ink-3 mb-3 px-1">{user.email}</p>}
            <button
              onClick={signOut}
              className="flex w-full items-center gap-3 rounded-xl bg-danger-tint border border-danger-edge px-4 py-3.5 text-danger-text active:bg-danger-tint transition-colors"
            >
              <LogOutIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium">Sign out</span>
            </button>
          </div>

        </div>
      </div>

      {resetOpen && <ResetModal onClose={() => setResetOpen(false)} />}
      {resetAccountOpen && <ResetAccountModal onClose={() => setResetAccountOpen(false)} />}

      {confirmCycleDay !== null && (
        <BottomSheet onClose={() => { if (!cycleBusy) setConfirmCycleDay(null); }}>
          <p className="font-semibold text-ink mb-2">Change your budget cycle?</p>
          <p className="text-sm text-ink-2 mb-3">
            Your current period becomes{' '}
            <span className="text-ink">
              {periodSpan(confirmCycleDay)}
            </span>.
          </p>
          <p className="text-sm text-ink-2 mb-5">
            Nothing is deleted, but spending and income already logged move into whichever
            period now contains them — so this month&apos;s totals will change. Bills you have
            ticked paid follow the date you actually paid them.
          </p>
          <div className="flex gap-2">
            {/* The migration rewrites every bill's ticks, so it takes a moment.
                Left enabled, a second tap would start a second re-key mid-flight. */}
            <button
              onClick={async () => {
                setCycleBusy(true);
                await setCycleStartDay(confirmCycleDay);
                setCycleBusy(false);
                setConfirmCycleDay(null);
                setPendingCycleDay(null);
              }}
              disabled={cycleBusy}
              className="flex-1 rounded-lg bg-primary py-2.5 text-sm font-medium text-on-primary disabled:opacity-50"
            >
              {cycleBusy ? 'Changing…' : 'Change cycle'}
            </button>
            <button
              onClick={() => setConfirmCycleDay(null)}
              disabled={cycleBusy}
              className="flex-1 rounded-lg bg-raised py-2.5 text-sm text-ink-2 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
