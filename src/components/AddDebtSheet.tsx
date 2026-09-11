'use client';

import { useState } from 'react';
import { useApp, fmt, DebtDirection } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import PersonPicker from './PersonPicker';
import { rankPeople } from '@/lib/people';

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  onClose: () => void;
}

export default function AddDebtSheet({ onClose }: Props) {
  const { debtPeople, debtEntries, addDebtEntry, settings } = useApp();

  // Starts on whoever you last had a debt with, the likeliest next one.
  const [personId,  setPersonId]  = useState<string | null>(
    () => rankPeople(debtPeople, debtEntries)[0]?.id ?? null,
  );
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [amount,    setAmount]    = useState('');
  const [note,      setNote]      = useState('');
  const [date,      setDate]      = useState(todayInputValue());
  const [walletId,  setWalletId]  = useState<string>('');
  const [saving,    setSaving]    = useState(false);

  const amountValue = parseFloat(amount);
  const canSave = personId !== null && !isNaN(amountValue) && amountValue > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    await addDebtEntry({
      personId,
      direction,
      amount: amountValue,
      note: note.trim(),
      // Midday avoids the entry sliding to the previous day in UTC.
      date: new Date(`${date}T12:00:00`).toISOString(),
      walletId: walletId || null,
    });

    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-ink text-lg mb-5">Add debt</p>

      {/* Person */}
      <p className="text-xs text-ink-3 mb-2">Person</p>
      <div className="mb-4">
        <PersonPicker title="Who is this debt with?" selected={personId} onChange={setPersonId} />
      </div>

      {/* Direction */}
      <p className="text-xs text-ink-3 mb-2">Direction</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setDirection('owed_to_me')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'owed_to_me'
              ? 'border-growth bg-growth-tint text-growth-text'
              : 'border-line bg-raised text-ink-2'
          }`}
        >
          They owe me
        </button>
        <button
          onClick={() => setDirection('i_owe')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'i_owe'
              ? 'border-danger bg-danger-tint text-danger-text'
              : 'border-line bg-raised text-ink-2'
          }`}
        >
          I owe them
        </button>
      </div>

      {/* Amount */}
      <p className="text-xs text-ink-3 mb-1">Amount</p>
      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl bg-canvas border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary mb-4"
      />

      {/* Note */}
      <p className="text-xs text-ink-3 mb-1">What for</p>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="e.g. Ramen lunch"
        className="w-full rounded-xl bg-canvas border border-line px-4 py-2.5 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary mb-4"
      />

      {/* Date */}
      <p className="text-xs text-ink-3 mb-1">Date</p>
      {/* block, not the default inline-block: an inline-block date input sizes
          to its native control on iOS. The appearance reset that makes `width`
          apply at all lives in globals.css. */}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="block w-full max-w-full rounded-xl bg-canvas border border-line px-4 py-2.5 text-sm text-ink outline-none focus:border-primary"
      />

      {/* Wallet — optional. The balance moves only if a wallet is selected. */}
      <p className="text-xs text-ink-3 mt-4 mb-2">
        {direction === 'owed_to_me' ? 'Paid from' : 'Received into'}
      </p>
      <WalletPicker value={walletId} onChange={setWalletId} />
      <button
        onClick={() => setWalletId('')}
        className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm transition-colors ${
          walletId === ''
            ? 'border-primary bg-primary-tint text-ink'
            : 'border-line bg-raised text-ink-2'
        }`}
      >
        No wallet — this already happened
      </button>
      <p className="mt-2 text-[11px] text-ink-4">
        {walletId === ''
          ? 'Records the debt only. No balance moves — use this for money that changed hands before you tracked it.'
          : direction === 'owed_to_me'
            ? `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} leaves this wallet now.`
            : `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} enters this wallet now.`}
      </p>

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Add debt'}
      </button>
    </BottomSheet>
  );
}
