'use client';

import { useState } from 'react';
import { useApp, fmt, type CreditCard } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import type { CardSummary } from '@/lib/creditCard';

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onClose: () => void;
}

// Paying the bill moves your own money to the bank, so nothing here counts as
// spending — the purchases counted when they were made.
export default function PayCardSheet({ card, summary, currency, onClose }: Props) {
  const { payCreditCard } = useApp();
  const due = summary.status.kind === 'due' ? summary.status : null;

  // Only amounts there are to pay, and never the same amount twice — the
  // statement balance and everything owed are often the same figure.
  const shortcuts = [
    { label: 'Statement balance', amount: due ? due.unpaid : 0 },
    { label: 'Minimum', amount: due ? due.minimumLeft : 0 },
    { label: 'Everything owed', amount: Math.max(0, summary.owedNow) },
  ].filter((s, i, all) => s.amount > 0 && all.findIndex(o => o.amount === s.amount) === i);

  const [amount, setAmount] = useState(() => (shortcuts[0] ? String(shortcuts[0].amount) : ''));
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseFloat(amount);
  const canPay = value > 0 && walletId !== '' && !saving;

  const pay = async () => {
    if (!canPay) return;
    setSaving(true);
    const ok = await payCreditCard(card.id, value, walletId);
    setSaving(false);
    if (ok) onClose();
    else setError('Couldn’t record the payment. Check your connection and try again.');
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="mb-5 text-center font-semibold text-ink text-lg">Pay {card.name}</p>

      {shortcuts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={() => setAmount(String(s.amount))}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                value === s.amount
                  ? 'border-primary bg-primary-tint text-ink'
                  : 'border-line bg-raised text-ink-2 hover:text-ink'
              }`}
            >
              {s.label} · {fmt(s.amount, currency)}
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-ink-3">Amount</p>
      <input
        type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="0.00" autoFocus
        className="mb-4 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-center text-2xl font-bold text-ink placeholder-ink-4 outline-none focus:border-primary"
      />

      <p className="mb-2 text-xs text-ink-3">Pay from</p>
      <WalletPicker value={walletId} onChange={setWalletId} />
      <p className="mt-2 text-[11px] text-ink-4">
        {value > 0
          ? `${fmt(value, currency)} leaves this wallet now.`
          : 'Choose the wallet the money comes from.'}
      </p>

      {error && <p className="mt-3 text-xs text-danger-text">{error}</p>}

      <button
        onClick={pay}
        disabled={!canPay}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Record payment'}
      </button>
    </BottomSheet>
  );
}
