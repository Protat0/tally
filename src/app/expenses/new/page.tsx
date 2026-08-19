'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp, fmt, round2, Category } from '@/components/AppContext';
import { XIcon } from '@/components/Icons';
import SplitPanel, { SplitResult } from '@/components/SplitPanel';
import { visibleCategories } from '@/lib/categories';

function ExpenseForm() {
  const { wallets, addExpense, settings } = useApp();
  // Built-in categories plus any user-defined custom ones, minus any the user
  // has removed on the Budget page — the single shared list, not a local copy.
  const categories = visibleCategories(settings.customCategories, settings.hiddenCategories);
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetWalletId = searchParams.get('walletId') ?? '';

  // Empty rather than '0': the field is typed into directly now, and a leading
  // zero the user has to clear first is friction the keypad used to absorb.
  const [input,    setInput]    = useState('');
  const [category, setCategory] = useState<Category | null>(null);
  // Cash is what most spending comes out of, so it is the default unless the
  // caller named a wallet. Falls back to the oldest wallet only if cash is gone.
  const cashId = settings.cashWalletId;
  const defaultWalletId = cashId && wallets.some(w => w.id === cashId) ? cashId : (wallets[0]?.id ?? '');
  const [walletId, setWalletId] = useState(presetWalletId || defaultWalletId);
  const [note,     setNote]     = useState('');
  const [split,     setSplit]     = useState<SplitResult | null>(null);

  const owedTotal = split?.mode === 'wallet'
    ? split.owedToMe.reduce((s, o) => s + o.amount, 0)
    : 0;
  const myShare = round2((parseFloat(input) || 0) - owedTotal);
  const needsWallet = !split || split.mode === 'wallet';

  const canSubmit = parseFloat(input) > 0 && category !== null
    && (!needsWallet || walletId !== '')
    // Person mode books a debt against the payer instead of moving a wallet
    // balance. With no payer there is no debt to book, and the expense would
    // land with neither a funding wallet nor a debt row.
    && (split?.mode !== 'person' || split.paidByPersonId !== null)
    // Re-checked against the CURRENT amount, not the amount when the split was made.
    // Lowering the amount after splitting must disable the button, not silently
    // discard the expense in addExpense's guard.
    && myShare >= 0;

  const handleSubmit = () => {
    if (!canSubmit || !category) return;
    addExpense({
      amount: parseFloat(input),
      category,
      note: note.trim(),
      walletId: split?.mode === 'person' ? null : walletId,
      paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
      // A `+ Name` row starts at 0 and stays there until the user types an
      // amount. Booking that as a debt writes a ₱0 entry and a ₱0 money_move.
      owedToMe: split?.mode === 'wallet' ? split.owedToMe.filter(o => o.amount > 0) : [],
    });
    router.back();
  };

  const selectedWallet = wallets.find(w => w.id === walletId);

  return (
    <div className="fixed inset-0 z-50 bg-[#0b0f1a] md:bg-black/75 md:backdrop-blur-sm flex md:items-center md:justify-center">
      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:w-[460px] md:rounded-3xl md:overflow-hidden bg-[#0b0f1a] md:bg-[#111827] md:border md:border-[#1e2d40] flex flex-col">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 pt-8 md:pt-6 pb-2 shrink-0">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10"
          >
            <XIcon className="w-5 h-5 text-slate-400" />
          </button>
          <p className="font-semibold text-white">Log Expense</p>
          <div className="w-9" />
        </div>

        {/* ── Amount ── */}
        <div className="flex flex-col items-center py-2 md:py-5 shrink-0">
          <p className="text-xs text-slate-500 mb-1.5 uppercase tracking-widest">Amount</p>
          {/* The field sizes to a fixed width rather than growing, so the
              currency and the number stay centred together as one unit. */}
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-3xl md:text-4xl font-bold text-slate-500 shrink-0">{settings.currency}</span>
            <input
              type="number"
              inputMode="decimal"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
              autoFocus
              className="w-40 md:w-48 bg-transparent text-left text-4xl md:text-5xl font-bold text-white placeholder-slate-700 tabular-nums outline-none border-0 p-0"
            />
          </div>
        </div>

        {/* ── Wallet strip — always visible ── */}
        <div className="px-5 pb-2 shrink-0">
          {wallets.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">
              No wallets yet — add one in Wallets.
            </p>
          ) : (
            <div className={split?.mode === 'person' ? 'opacity-40 pointer-events-none' : ''}>
              <p className="text-xs text-slate-500 mb-2">
                {split?.mode === 'person' ? 'No wallet involved' : 'Pay from'}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {wallets.map(w => {
                  const selected = walletId === w.id && split?.mode !== 'person';
                  return (
                    <button
                      key={w.id}
                      onClick={() => setWalletId(w.id)}
                      className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                        selected
                          ? 'border-blue-500 bg-blue-500/15'
                          : 'border-[#1e2d40] bg-white/5'
                      }`}
                    >
                      <span className="text-base leading-none">{w.icon}</span>
                      <div className="text-left">
                        <p className={`text-xs font-medium leading-tight ${selected ? 'text-blue-300' : 'text-white'}`}>
                          {w.name}
                        </p>
                        <p className="text-[10px] text-slate-400 leading-tight">
                          {fmt(w.balance, settings.currency)}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── Scrollable middle: category + note ── */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 min-h-0">

          {/* Split */}
          <SplitPanel
            total={parseFloat(input) || 0}
            currency={settings.currency}
            value={split}
            onChange={setSplit}
          />

          {/* Category */}
          <div>
            <p className="text-xs text-slate-500 mb-2">Category</p>
            <div className="grid grid-cols-3 gap-2">
              {categories.map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors ${
                    category === c.key ? c.color : 'bg-white/5 border-[#1e2d40]'
                  }`}
                >
                  <span className="text-xl">{c.icon}</span>
                  <span className="text-xs text-slate-300">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="pb-2">
            <p className="text-xs text-slate-500 mb-2">
              Note <span className="text-slate-600">(optional)</span>
            </p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What's this for?"
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3 text-white placeholder-slate-500 outline-none focus:border-blue-500/50 text-sm"
            />
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="px-4 pt-1 pb-5 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-blue-600 py-4 font-bold text-white text-base active:bg-blue-700 disabled:opacity-30 transition-colors"
          >
            {!canSubmit
              ? 'Log Expense'
              : split?.mode === 'person'
                ? 'Log · someone else paid'
                : split
                  ? `Log · ${fmt(myShare, settings.currency)} of ${fmt(parseFloat(input), settings.currency)}`
                  : `Log · ${selectedWallet ? selectedWallet.name : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function NewExpensePage() {
  return (
    <Suspense>
      <ExpenseForm />
    </Suspense>
  );
}
