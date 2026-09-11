'use client';

import { useState } from 'react';
import { useApp, fmt, DebtDirection } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import PersonAvatar from './PersonAvatar';

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  onClose: () => void;
}

export default function AddDebtSheet({ onClose }: Props) {
  const { debtPeople, addDebtPerson, addDebtEntry, settings } = useApp();

  const [personId,  setPersonId]  = useState<string>(debtPeople[0]?.id ?? '');
  const [newName,   setNewName]   = useState('');
  const [creating,  setCreating]  = useState(debtPeople.length === 0);
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [amount,    setAmount]    = useState('');
  const [note,      setNote]      = useState('');
  const [date,      setDate]      = useState(todayInputValue());
  const [walletId,  setWalletId]  = useState<string>('');
  const [saving,    setSaving]    = useState(false);

  const amountValue = parseFloat(amount);
  const validPerson = creating ? newName.trim().length > 0 : personId.length > 0;
  const canSave = validPerson && !isNaN(amountValue) && amountValue > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    // A new person must be inserted first — the entry references its real id.
    const targetId = creating
      ? await addDebtPerson({ name: newName.trim(), emoji: '' })
      : personId;

    if (!targetId) { setSaving(false); return; }

    await addDebtEntry({
      personId: targetId,
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
      {debtPeople.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {debtPeople.map(p => (
            <button
              key={p.id}
              onClick={() => { setCreating(false); setPersonId(p.id); }}
              className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                !creating && personId === p.id
                  ? 'border-primary bg-primary-tint text-ink'
                  : 'border-line bg-raised text-ink-2 hover:text-ink'
              }`}
            >
              <PersonAvatar name={p.name} size="xs" />
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <button
            onClick={() => setCreating(true)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              creating
                ? 'border-primary bg-primary-tint text-ink'
                : 'border-dashed border-line bg-raised text-primary-text hover:border-primary-edge'
            }`}
          >
            + New person
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-xl border border-line bg-raised p-3">
          <div className="flex items-center gap-2.5">
            <PersonAvatar name={newName} />
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
            className="min-w-0 flex-1 rounded-lg bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder-ink-5 outline-none focus:border-primary"
          />
          </div>
        </div>
      )}

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
