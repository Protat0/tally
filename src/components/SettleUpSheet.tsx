'use client';

import { useState } from 'react';
import { fmt, round2 } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';

interface BaseProps {
  title: string;
  personName: string;
  /** Signed: positive means they pay you, negative means you pay them. */
  net: number;
  currency: string;
  onConfirm: (walletId: string | null) => Promise<void>;
  onClose: () => void;
}

// `allowPartial` and `onPartial` are inseparable: a sheet that lets the user
// edit the amount needs somewhere to send that amount. A plain optional pair
// let a caller set one without the other, which would silently settle the
// whole balance behind a button that reads "Record payment". The union makes
// that combination fail to typecheck instead.
type Props = BaseProps & (
  | { allowPartial?: false; onPartial?: never }
  | {
      /** Person-level settle-up only. A single row is all-or-nothing. */
      allowPartial: true;
      /** The user entered less or more than the full net; send what they typed. */
      onPartial: (amount: number, walletId: string) => Promise<void>;
    }
);

// Used for both a person's whole settle-up and a single row. Either way the
// question is the same: this much changes hands — which wallet, if any? With
// `allowPartial`, "this much" becomes editable and the sheet turns into a
// payoff tool: pay part of the balance, all of it, or more than it.
export default function SettleUpSheet(props: Props) {
  const { title, personName, net, currency, onConfirm, onClose } = props;
  const incoming = net > 0;
  // The sheet's one notion of the balance. Everything below asks `full` rather
  // than `net`, so a balance of -2.84e-14 — float dust left by earlier payments,
  // and ₱0.00 everywhere it is shown — behaves exactly like a true zero instead
  // of offering an amount field prefilled with 0 that can never be confirmed.
  const full = round2(Math.abs(net));
  // A zero balance moves nothing, so there is nothing to take an amount for.
  const partial = Boolean(props.allowPartial) && full !== 0;

  // Prefilled with the whole balance so settling in full stays a single tap.
  const [amount, setAmount] = useState(partial ? String(full) : '');
  const [walletId, setWalletId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const entered = round2(parseFloat(amount));
  const valid = !isNaN(entered) && entered > 0;
  const isFull = valid && entered === full;
  const over = valid && entered > full;

  // What actually changes hands, for the wallet hint.
  const moving = partial ? (valid ? entered : 0) : full;

  const canConfirm = !saving && (
    partial ? valid && walletId.length > 0
            : full === 0 || walletId.length > 0
  );

  const handleConfirm = async () => {
    setSaving(true);
    // `props.allowPartial` (not the derived `partial`) is what narrows
    // `props.onPartial` to defined — that's the type-level guarantee from
    // the Props union, not a runtime nullish check standing in for it.
    if (props.allowPartial && partial && !isFull) {
      await props.onPartial(entered, walletId);
    } else {
      await onConfirm(walletId || null);
    }
    setSaving(false);
    onClose();
  };

  const outcome = () => {
    if (!valid) return 'Enter how much changed hands.';
    if (isFull) return `Clears everything with ${personName}.`;
    if (over) {
      const flipped = round2(entered - full);
      return incoming
        ? `You’ll owe ${personName} ${fmt(flipped, currency)} after this.`
        : `${personName} will owe you ${fmt(flipped, currency)} after this.`;
    }
    return `${fmt(round2(full - entered), currency)} stays outstanding.`;
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">{title}</p>

      {full === 0 ? (
        <p className="text-sm text-slate-500 mb-5">
          These cancel out exactly — nothing changes hands. Everything will be
          marked settled.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-5">
          {/* A balance the user is about to edit, versus a transaction about to
              happen. The row sheet describes the payment it is confirming. */}
          {partial
            ? (incoming ? `${personName} owes you ` : `You owe ${personName} `)
            : (incoming ? `${personName} pays you ` : `You pay ${personName} `)}
          <span className={incoming ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            {fmt(full, currency)}
          </span>
          .
        </p>
      )}

      {partial && (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs text-slate-500">
              {incoming ? 'They pay' : 'You pay'}
            </p>
            <p className="text-[11px] text-slate-600 tabular-nums">
              of {fmt(full, currency)}
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
          />
          <div className="flex gap-2 mt-2 mb-4">
            <button
              onClick={() => setAmount(String(round2(full / 2)))}
              className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Half
            </button>
            <button
              onClick={() => setAmount(String(full))}
              className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Full
            </button>
          </div>
        </>
      )}

      {full !== 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {incoming ? 'Received into' : 'Paid from'}
          </p>
          <WalletPicker value={walletId} onChange={setWalletId} />
          <p className="mt-2 text-[11px] text-slate-600">
            {walletId === '' || (partial && !valid)
              ? 'Pick the wallet the money moved through.'
              : `${fmt(moving, currency)} ${incoming ? 'enters' : 'leaves'} this wallet.`}
          </p>
        </>
      )}

      {partial && (
        <p className="mt-4 text-[11px] text-slate-500">{outcome()}</p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving
          ? (partial && !isFull ? 'Recording…' : 'Settling…')
          : (partial && !isFull ? 'Record payment' : 'Mark settled')}
      </button>
    </BottomSheet>
  );
}
