'use client';

import { useState } from 'react';
import { useApp, fmt, DebtDirection } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';

const PERSON_EMOJI = ['🧑','👩','👨','🧔','👧','👦','🙂','😎','🐱','🐶','⭐','🎯'];

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
  const [newEmoji,  setNewEmoji]  = useState('🧑');
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
      ? await addDebtPerson({ name: newName.trim(), emoji: newEmoji })
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
      <p className="font-semibold text-white text-lg mb-5">Add debt</p>

      {/* Person */}
      <p className="text-xs text-slate-500 mb-2">Person</p>
      {debtPeople.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {debtPeople.map(p => (
            <button
              key={p.id}
              onClick={() => { setCreating(false); setPersonId(p.id); }}
              className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                !creating && personId === p.id
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <span className="shrink-0">{p.emoji}</span>
              <span className="truncate">{p.name}</span>
            </button>
          ))}
          <button
            onClick={() => setCreating(true)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              creating
                ? 'border-blue-500 bg-blue-500/15 text-white'
                : 'border-dashed border-[#1e2d40] bg-white/5 text-blue-400 hover:border-blue-500/40'
            }`}
          >
            + New person
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-xl border border-[#1e2d40] bg-white/5 p-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PERSON_EMOJI.map(em => (
              <button
                key={em}
                onClick={() => setNewEmoji(em)}
                className={`h-8 w-8 rounded-lg text-base border transition-colors ${
                  newEmoji === em ? 'border-blue-500 bg-blue-500/15' : 'border-[#1e2d40] bg-white/5'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
            className="w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
          />
        </div>
      )}

      {/* Direction */}
      <p className="text-xs text-slate-500 mb-2">Direction</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setDirection('owed_to_me')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'owed_to_me'
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          They owe me
        </button>
        <button
          onClick={() => setDirection('i_owe')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'i_owe'
              ? 'border-red-500 bg-red-500/15 text-red-400'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          I owe them
        </button>
      </div>

      {/* Amount */}
      <p className="text-xs text-slate-500 mb-1">Amount</p>
      <input
        type="number"
        inputMode="decimal"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
      />

      {/* Note */}
      <p className="text-xs text-slate-500 mb-1">What for</p>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="e.g. Ramen lunch"
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
      />

      {/* Date */}
      <p className="text-xs text-slate-500 mb-1">Date</p>
      {/* block, not the default inline-block: an inline-block date input sizes
          to its native control on iOS. The appearance reset that makes `width`
          apply at all lives in globals.css. */}
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="block w-full max-w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
      />

      {/* Wallet — optional. The balance moves only if a wallet is selected. */}
      <p className="text-xs text-slate-500 mt-4 mb-2">
        {direction === 'owed_to_me' ? 'Paid from' : 'Received into'}
      </p>
      <WalletPicker value={walletId} onChange={setWalletId} />
      <button
        onClick={() => setWalletId('')}
        className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm transition-colors ${
          walletId === ''
            ? 'border-blue-500 bg-blue-500/15 text-white'
            : 'border-[#1e2d40] bg-white/5 text-slate-400'
        }`}
      >
        No wallet — this already happened
      </button>
      <p className="mt-2 text-[11px] text-slate-600">
        {walletId === ''
          ? 'Records the debt only. No balance moves — use this for money that changed hands before you tracked it.'
          : direction === 'owed_to_me'
            ? `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} leaves this wallet now.`
            : `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} enters this wallet now.`}
      </p>

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Add debt'}
      </button>
    </BottomSheet>
  );
}
