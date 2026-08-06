'use client';

import { useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useApp, fmt, Category } from '@/components/AppContext';
import { XIcon } from '@/components/Icons';

const CATEGORIES: { key: Category; label: string; icon: string; color: string }[] = [
  { key: 'food',      label: 'Food',      icon: '🍜', color: 'bg-orange-500/15 border-orange-500/40' },
  { key: 'transport', label: 'Transport', icon: '🚗', color: 'bg-blue-500/15   border-blue-500/40' },
  { key: 'bills',     label: 'Bills',     icon: '💡', color: 'bg-amber-500/15  border-amber-500/40' },
  { key: 'shopping',  label: 'Shopping',  icon: '🛍️', color: 'bg-pink-500/15   border-pink-500/40' },
  { key: 'health',    label: 'Health',    icon: '💊', color: 'bg-green-500/15  border-green-500/40' },
  { key: 'other',     label: 'Other',     icon: '✦',  color: 'bg-slate-500/15  border-slate-500/40' },
];

const KEYS = [['7','8','9'],['4','5','6'],['1','2','3'],['.','0','⌫']];

function ExpenseForm() {
  const { wallets, addExpense, settings } = useApp();
  // Built-in categories plus any user-defined custom ones (given a neutral color).
  const categories = [
    ...CATEGORIES,
    ...settings.customCategories.map(c => ({
      key: c.key, label: c.label, icon: c.icon,
      color: 'bg-slate-500/15 border-slate-500/40',
    })),
  ];
  const router = useRouter();
  const searchParams = useSearchParams();
  const presetWalletId = searchParams.get('walletId') ?? '';

  const [input,    setInput]    = useState('0');
  const [category, setCategory] = useState<Category | null>(null);
  const [walletId, setWalletId] = useState(presetWalletId || (wallets[0]?.id ?? ''));
  const [note,     setNote]     = useState('');

  const canSubmit = parseFloat(input) > 0 && category !== null && walletId !== '';

  const handleKey = (k: string) => {
    setInput(prev => {
      if (k === '⌫') return prev.length <= 1 ? '0' : prev.slice(0, -1);
      if (k === '.') return prev.includes('.') ? prev : prev + '.';
      if (prev === '0') return k;
      if (prev.includes('.') && prev.split('.')[1].length >= 2) return prev;
      return prev + k;
    });
  };

  const handleSubmit = () => {
    if (!canSubmit || !category) return;
    addExpense({ amount: parseFloat(input), category, walletId, note: note.trim() });
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
          <p className="text-4xl md:text-5xl font-bold text-white tabular-nums">
            {settings.currency}{input === '0' ? '0' : parseFloat(input).toLocaleString('en-PH', {
              minimumFractionDigits: input.includes('.') ? input.split('.')[1].length : 0,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        {/* ── Wallet strip — always visible ── */}
        <div className="px-5 pb-2 shrink-0">
          {wallets.length === 0 ? (
            <p className="text-xs text-slate-500 text-center py-2">
              No wallets yet — add one in Wallets.
            </p>
          ) : (
            <>
              <p className="text-xs text-slate-500 mb-2">Pay from</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                {wallets.map(w => (
                  <button
                    key={w.id}
                    onClick={() => setWalletId(w.id)}
                    className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                      walletId === w.id
                        ? 'border-blue-500 bg-blue-500/15'
                        : 'border-[#1e2d40] bg-white/5'
                    }`}
                  >
                    <span className="text-base leading-none">{w.icon}</span>
                    <div className="text-left">
                      <p className={`text-xs font-medium leading-tight ${walletId === w.id ? 'text-blue-300' : 'text-white'}`}>
                        {w.name}
                      </p>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        {fmt(w.balance, settings.currency)}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* ── Scrollable middle: category + note ── */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 min-h-0">

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

        {/* ── Keypad ── */}
        <div className="px-4 pt-1 pb-3 shrink-0">
          {KEYS.map((row, ri) => (
            <div key={ri} className="flex gap-2 mb-1.5">
              {row.map(k => (
                <button
                  key={k}
                  onClick={() => handleKey(k)}
                  className="flex-1 flex items-center justify-center rounded-2xl bg-[#111827] md:bg-white/5 border border-[#1e2d40] h-12 md:h-14 text-lg font-semibold text-white active:bg-[#1a2332] transition-colors"
                >
                  {k}
                </button>
              ))}
            </div>
          ))}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="w-full rounded-2xl bg-blue-600 py-4 font-bold text-white text-base active:bg-blue-700 disabled:opacity-30 transition-colors mt-1"
          >
            {canSubmit
              ? `Log · ${selectedWallet ? selectedWallet.name : ''}`
              : 'Log Expense'}
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
