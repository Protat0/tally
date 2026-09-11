'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useApp, fmt } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import BottomSheet from '@/components/BottomSheet';
import WalletPicker from '@/components/WalletPicker';
import { PlusIcon, ShieldIcon, CheckIcon, TrashIcon } from '@/components/Icons';
import { averageDeposit, canWithdraw, canDeleteEntry, type FundDirection } from '@/lib/emergencyFund';

function ArcProgress({ value, max }: { value: number; max: number }) {
  const r = 80;
  const cx = 100;
  const cy = 100;
  const pct = max > 0 ? Math.min(value / max, 1) : 0;
  const startAngle = -220;
  const sweep = 260;
  const endAngle = startAngle + sweep * pct;

  const toRad = (a: number) => (a * Math.PI) / 180;
  const arcPath = (angle: number) =>
    `${cx + r * Math.cos(toRad(angle))},${cy + r * Math.sin(toRad(angle))}`;

  const describeArc = (start: number, end: number) => {
    const s = arcPath(start);
    const e = arcPath(end);
    const large = end - start > 180 ? 1 : 0;
    return `M ${s} A ${r} ${r} 0 ${large} 1 ${e}`;
  };

  return (
    <svg viewBox="0 0 200 200" className="w-48 h-48">
      <path d={describeArc(startAngle, startAngle + sweep)} fill="none" stroke="#1e2d40" strokeWidth="14" strokeLinecap="round" />
      {pct > 0 && (
        <path d={describeArc(startAngle, endAngle)} fill="none" stroke="#10b981" strokeWidth="14" strokeLinecap="round" className="transition-all duration-700" />
      )}
      <text x="50%" y="48%" textAnchor="middle" fill="white" fontSize="20" fontWeight="bold" dominantBaseline="middle">
        {(pct * 100).toFixed(0)}%
      </text>
      <text x="50%" y="60%" textAnchor="middle" fill="#64748b" fontSize="8" dominantBaseline="middle">
        of goal
      </text>
    </svg>
  );
}

function milestones(target: number): number[] {
  if (target <= 0) return [];
  return [0.25, 0.5, 0.75, 1].map(f => target * f);
}

// One sheet for both directions. The wallet is optional, as when adding a
// debt: pick one and its balance moves; leave it on "No wallet" to record
// money that was set aside, or spent, without a wallet of yours moving.
function FundEntrySheet({ direction, balance, currency, onClose }: {
  direction: FundDirection;
  balance: number;
  currency: string;
  onClose: () => void;
}) {
  const { recordEmergencyFundEntry } = useApp();
  const [amount, setAmount]     = useState('');
  const [note, setNote]         = useState('');
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving]     = useState(false);

  const out = direction === 'withdrawal';
  const value = parseFloat(amount);
  const entered = !isNaN(value) && value > 0;
  const tooMuch = out && entered && !canWithdraw(balance, value);
  const canSave = entered && !tooMuch && !saving;

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    const ok = await recordEmergencyFundEntry({
      direction, amount: value, note: note.trim(), walletId: walletId || null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="mb-5 text-center font-semibold text-ink text-lg">
        {out ? 'Withdraw from fund' : 'Add to fund'}
      </p>

      <p className="mb-2 text-xs text-ink-3">Amount</p>
      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="0.00"
        autoFocus
        className="w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-center text-2xl font-bold"
      />
      {out && (
        <p className={`mt-1.5 text-xs ${tooMuch ? 'text-danger-text' : 'text-ink-4'}`}>
          {tooMuch
            ? `The fund only holds ${fmt(balance, currency)}.`
            : `${fmt(balance, currency)} available`}
        </p>
      )}

      <p className="mt-4 mb-2 text-xs text-ink-3">Note <span className="text-ink-4">(optional)</span></p>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder={out ? 'e.g. Hospital bill' : 'e.g. April savings'}
        className="mb-4 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm"
      />

      <p className="mb-2 text-xs text-ink-3">{out ? 'Into wallet' : 'From wallet'}</p>
      <WalletPicker value={walletId} onChange={setWalletId} />
      <button
        onClick={() => setWalletId('')}
        className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm transition-colors ${
          walletId === ''
            ? 'border-primary bg-primary-tint text-ink'
            : 'border-line bg-raised text-ink-2'
        }`}
      >
        {out ? 'No wallet — not putting it in one' : 'No wallet — already set aside'}
      </button>
      <p className="mt-2 text-[11px] text-ink-4">
        {walletId === ''
          ? out
            ? 'Records the withdrawal only. No wallet balance moves.'
            : 'Records the contribution only. No wallet balance moves — for money already saved somewhere.'
          : `${fmt(entered ? value : 0, currency)} ${out ? 'enters' : 'leaves'} this wallet now.`}
      </p>

      <button
        onClick={save}
        disabled={!canSave}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-40"
      >
        {saving ? 'Saving…' : out ? 'Withdraw' : 'Add to fund'}
      </button>
    </BottomSheet>
  );
}

export default function EmergencyFundPage() {
  const { emergencyFund, settings, wallets, deleteEmergencyFundEntry } = useApp();
  const { currentAmount, entries } = emergencyFund;
  const target = settings.emergencyFundTarget;
  const { currency } = settings;

  // Which way the sheet is open, or null when it is closed.
  const [sheet, setSheet] = useState<FundDirection | null>(null);
  // Deleting confirms with a second tap on the same row.
  const [confirmingId, setConfirmingId] = useState<string | null>(null);

  const walletName = (id: string | null) => wallets.find(w => w.id === id)?.name ?? '';

  const projected = (() => {
    if (target <= 0 || currentAmount >= target) return null;
    // Withdrawals say nothing about how fast the fund grows.
    const avg = averageDeposit(entries, 6);
    if (!avg) return null;
    const months = Math.ceil((target - currentAmount) / avg);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  })();

  const marks = milestones(target);

  const remove = async (id: string) => {
    setConfirmingId(null);
    await deleteEmergencyFundEntry(id);
  };

  return (
    <div className="min-h-screen bg-canvas">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-3xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Emergency Fund"
            right={
              // Both labelled at every width: an icon-only + was too easy to miss.
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSheet('withdrawal')}
                  disabled={currentAmount <= 0}
                  className="rounded-full border border-line bg-raised px-3.5 py-2 text-sm font-medium text-ink-2 hover:text-ink transition-colors disabled:opacity-40"
                >
                  Withdraw
                </button>
                <button
                  onClick={() => setSheet('deposit')}
                  className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-sm font-medium text-on-primary hover:bg-primary-hover transition-colors"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add
                </button>
              </div>
            }
          />

          <div className="md:grid md:grid-cols-2 md:gap-6">
            {/* Progress + stats. Without a target there is nothing to measure
                against, but the balance and history below still stand. */}
            <div>
              {target <= 0 ? (
                <div className="mb-6 flex flex-col items-center rounded-2xl border border-line bg-surface px-4 py-8 text-center">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-raised mb-4">
                    <ShieldIcon className="w-7 h-7 text-ink-4" />
                  </div>
                  <p className="text-3xl font-bold text-ink">{fmt(currentAmount, currency)}</p>
                  <p className="mt-1 text-sm text-ink-3">in the fund</p>
                  <p className="mt-4 text-xs text-ink-4">
                    <Link href="/settings" className="font-medium text-primary-text hover:text-primary-hover transition-colors">
                      Set a target
                    </Link>{' '}
                    to see your progress.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex flex-col items-center pt-2 md:pt-0 mb-6">
                    <ArcProgress value={currentAmount} max={target} />
                    <div className="mt-3 text-center">
                      <p className="text-3xl font-bold text-ink">{fmt(currentAmount, currency)}</p>
                      <p className="text-sm text-ink-3">of {fmt(target, currency)} goal</p>
                      {projected && (
                        <p className="mt-1 text-xs text-growth-text">Projected full by {projected}</p>
                      )}
                    </div>
                  </div>

                  {/* Milestones */}
                  <div className="rounded-2xl bg-surface border border-line p-4 mb-6 md:mb-0">
                    <p className="text-xs text-ink-3 mb-3">Milestones</p>
                    <div className="space-y-2.5">
                      {marks.map((m, i) => {
                        const labels = ['25%', '50%', '75%', '100%'];
                        const reached = currentAmount >= m;
                        return (
                          <div key={i} className="flex items-center gap-3">
                            <div className={`h-4 w-4 rounded-full border-2 shrink-0 ${reached ? 'bg-growth border-growth' : 'border-line-strong'}`} />
                            <p className={`flex-1 text-sm ${reached ? 'text-ink' : 'text-ink-3'}`}>
                              {labels[i]} — {fmt(m, currency)}
                            </p>
                            {reached && <CheckIcon className="h-3.5 w-3.5 text-growth-text" aria-label="Reached" />}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* History: every contribution and withdrawal, newest first */}
            <div>
              <p className="text-xs text-ink-3 mb-2 px-1">History</p>
              {entries.length === 0 ? (
                <div className="rounded-xl bg-surface border border-line px-4 py-8 text-center">
                  <p className="text-sm text-ink-3">Nothing in the fund yet.</p>
                  <button
                    onClick={() => setSheet('deposit')}
                    className="mt-3 text-sm text-growth-text underline underline-offset-2"
                  >
                    Add first contribution
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {entries.map(e => {
                    const out = e.direction === 'withdrawal';
                    const wallet = walletName(e.walletId);
                    const date = new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
                    // A deposit that later withdrawals already used can't go
                    // first; the fund would drop below zero.
                    const deletable = canDeleteEntry(entries, e.id);
                    const confirming = confirmingId === e.id;
                    return (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl bg-surface border border-line px-4 py-3.5">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-ink">{out ? 'Withdrawal' : 'Contribution'}</p>
                          <p className="truncate text-xs text-ink-3">
                            {[date, e.note, wallet && (out ? `to ${wallet}` : `from ${wallet}`)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {/* A withdrawal is your own money coming back, not a
                            loss, so it is plain rather than red. */}
                        <span className={`shrink-0 text-sm font-semibold tabular-nums ${out ? 'text-ink-2' : 'text-growth-text'}`}>
                          {out ? '−' : '+'}{fmt(e.amount, currency)}
                        </span>
                        {confirming ? (
                          <button
                            onClick={() => remove(e.id)}
                            onBlur={() => setConfirmingId(null)}
                            className="shrink-0 rounded-lg bg-danger-strong px-2.5 py-1.5 text-xs font-semibold text-white"
                          >
                            Sure?
                          </button>
                        ) : (
                          <button
                            onClick={() => setConfirmingId(e.id)}
                            disabled={!deletable}
                            aria-label={deletable ? `Delete this ${out ? 'withdrawal' : 'contribution'}` : 'Delete later withdrawals first'}
                            title={deletable ? undefined : 'Delete later withdrawals first'}
                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-raised hover:text-danger-text transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-4"
                          >
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

        </div>
      </div>

      {sheet && (
        <FundEntrySheet
          key={sheet}
          direction={sheet}
          balance={currentAmount}
          currency={currency}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
