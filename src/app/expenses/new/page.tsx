'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp, fmt, round2, Category } from '@/components/AppContext';
import { XIcon } from '@/components/Icons';
import SplitPanel, { SplitResult } from '@/components/SplitPanel';
import { visibleCategories } from '@/lib/categories';
import AppIcon from '@/components/AppIcon';

function ExpenseForm() {
  const { wallets, addExpense, settings, creditCards, cardSummaries } = useApp();
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
  // Paid from a wallet or a card, so choosing one clears the other.
  const [cardId,   setCardId]   = useState('');
  const [note,     setNote]     = useState('');
  const [split,     setSplit]     = useState<SplitResult | null>(null);

  // Archived cards take no new purchases.
  const activeCards = creditCards.filter(c => !c.archivedAt);
  const selectedCard = activeCards.find(c => c.id === cardId) ?? null;
  const typedAmount = parseFloat(input) || 0;
  // Banks do approve charges over the limit, so this warns rather than blocks.
  const overLimit = Boolean(selectedCard)
    && typedAmount > (cardSummaries[cardId]?.availableCredit ?? 0);

  const owedTotal = split?.mode === 'wallet'
    ? split.owedToMe.reduce((s, o) => s + o.amount, 0)
    : 0;
  const myShare = round2(typedAmount - owedTotal);
  const needsFunding = !split || split.mode === 'wallet';

  const canSubmit = typedAmount > 0 && category !== null
    && (!needsFunding || walletId !== '' || cardId !== '')
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
      amount: typedAmount,
      category,
      note: note.trim(),
      walletId: split?.mode === 'person' ? null : (walletId || null),
      cardId: split?.mode === 'person' ? null : (cardId || null),
      paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
      // A `+ Name` row starts at 0 and stays there until the user types an
      // amount. Booking that as a debt writes a ₱0 entry and a ₱0 money_move.
      owedToMe: split?.mode === 'wallet' ? split.owedToMe.filter(o => o.amount > 0) : [],
    });
    router.back();
  };

  const selectedWallet = wallets.find(w => w.id === walletId);

  return (
    <div className="fixed inset-0 z-50 bg-canvas md:bg-black/75 md:backdrop-blur-sm flex md:items-center md:justify-center">
      <div className="w-full h-full md:h-auto md:max-h-[92vh] md:w-[460px] md:rounded-3xl md:overflow-hidden bg-canvas md:bg-surface md:border md:border-line flex flex-col">

        {/* ── Top bar ── */}
        <div className="flex items-center justify-between px-5 pt-8 md:pt-6 pb-2 shrink-0">
          <button
            onClick={() => router.back()}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-raised active:bg-line"
          >
            <XIcon className="w-5 h-5 text-ink-2" />
          </button>
          <p className="font-semibold text-ink">Log Expense</p>
          <div className="w-9" />
        </div>

        {/* ── Amount ── */}
        <div className="flex flex-col items-center py-2 md:py-5 shrink-0">
          <p className="text-xs text-ink-3 mb-1.5 uppercase tracking-widest">Amount</p>
          {/* The field sizes to a fixed width rather than growing, so the
              currency and the number stay centred together as one unit. */}
          <div className="flex items-baseline justify-center gap-1.5">
            <span className="text-3xl md:text-4xl font-bold text-ink-3 shrink-0">{settings.currency}</span>
            <input
              type="number"
              inputMode="decimal"
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="0"
              min="0"
              step="0.01"
              autoFocus
              className="w-40 md:w-48 bg-transparent text-left text-4xl md:text-5xl font-bold text-ink placeholder-ink-5 tabular-nums outline-none border-0 p-0"
            />
          </div>
        </div>

        {/* ── Wallet strip — always visible ── */}
        <div className="px-5 pb-2 shrink-0">
          {wallets.length === 0 && activeCards.length === 0 ? (
            <p className="text-xs text-ink-3 text-center py-2">
              No wallets yet — add one in Wallets.
            </p>
          ) : (
            <div className={split?.mode === 'person' ? 'opacity-40 pointer-events-none' : ''}>
              <p className="text-xs text-ink-3 mb-2">
                {split?.mode === 'person' ? 'No wallet involved' : 'Pay from'}
              </p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {wallets.map(w => {
                  const selected = walletId === w.id && split?.mode !== 'person';
                  return (
                    <button
                      key={w.id}
                      onClick={() => { setWalletId(w.id); setCardId(''); }}
                      className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                        selected
                          ? 'border-primary bg-primary-tint'
                          : 'border-line bg-raised'
                      }`}
                    >
                      <AppIcon icon={w.icon} fallback="wallet" className="h-4 w-4 text-primary-text" />
                      <div className="text-left">
                        <p className={`text-xs font-medium leading-tight ${selected ? 'text-primary-hover' : 'text-ink'}`}>
                          {w.name}
                        </p>
                        <p className="text-[10px] text-ink-2 leading-tight">
                          {fmt(w.balance, settings.currency)}
                        </p>
                      </div>
                    </button>
                  );
                })}

                {/* Cards come after wallets in the same strip, showing what is
                    left to spend rather than a balance. */}
                {activeCards.map(c => {
                  const selected = cardId === c.id && split?.mode !== 'person';
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setCardId(c.id); setWalletId(''); }}
                      className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                        selected
                          ? 'border-primary bg-primary-tint'
                          : 'border-line bg-raised'
                      }`}
                    >
                      <AppIcon icon={c.icon} fallback="credit-card" className="h-4 w-4 text-primary-text" />
                      <div className="text-left">
                        <p className={`text-xs font-medium leading-tight ${selected ? 'text-primary-hover' : 'text-ink'}`}>
                          {c.name}
                        </p>
                        <p className="text-[10px] text-ink-2 leading-tight">
                          {fmt(cardSummaries[c.id]?.availableCredit ?? 0, settings.currency)} left
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {overLimit && (
                <p className="mt-2 text-[11px] text-warning-text">
                  That is more than {selectedCard?.name} has left. Banks often allow it
                  — the card would simply go over its limit.
                </p>
              )}
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
            <p className="text-xs text-ink-3 mb-2">Category</p>
            <div className="grid grid-cols-3 gap-2">
              {categories.map(c => (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border py-3 transition-colors ${
                    category === c.key ? c.color : 'bg-raised border-line'
                  }`}
                >
                  <AppIcon icon={c.icon} className={`h-5 w-5 ${category === c.key ? 'text-primary-text' : 'text-ink-3'}`} />
                  <span className="text-xs text-ink-2">{c.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Note */}
          <div className="pb-2">
            <p className="text-xs text-ink-3 mb-2">
              Note <span className="text-ink-4">(optional)</span>
            </p>
            <input
              type="text"
              value={note}
              onChange={e => setNote(e.target.value)}
              placeholder="What's this for?"
              className="w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm"
            />
          </div>
        </div>

        {/* ── Submit ── */}
        <div className="px-4 pt-1 pb-5 shrink-0">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-primary py-4 font-bold text-on-primary text-base active:bg-primary-hover disabled:opacity-30 transition-colors"
          >
            {!canSubmit
              ? 'Log Expense'
              : split?.mode === 'person'
                ? 'Log · someone else paid'
                : split
                  ? `Log · ${fmt(myShare, settings.currency)} of ${fmt(typedAmount, settings.currency)}`
                  : `Log · ${selectedWallet?.name ?? selectedCard?.name ?? ''}`}
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
