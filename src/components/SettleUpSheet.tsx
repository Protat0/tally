'use client';

import { useState } from 'react';
import { fmt } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';

interface Props {
  title: string;
  personName: string;
  /** Signed: positive means they pay you, negative means you pay them. */
  net: number;
  currency: string;
  onConfirm: (walletId: string | null) => Promise<void>;
  onClose: () => void;
}

// Used for both a person's whole settle-up and a single row. Either way the
// question is the same: this much changes hands — which wallet, if any?
export default function SettleUpSheet({
  title, personName, net, currency, onConfirm, onClose,
}: Props) {
  const [walletId, setWalletId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const incoming = net > 0;
  const amount = Math.abs(net);
  // A zero net moves nothing, so it has no wallet to ask about.
  const canConfirm = (net === 0 || walletId.length > 0) && !saving;

  const handleConfirm = async () => {
    setSaving(true);
    await onConfirm(walletId || null);
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">{title}</p>

      {net === 0 ? (
        <p className="text-sm text-slate-500 mb-5">
          These cancel out exactly — nothing changes hands. Everything will be
          marked settled.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-5">
          {incoming ? `${personName} pays you ` : `You pay ${personName} `}
          <span className={incoming ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            {fmt(amount, currency)}
          </span>
          .
        </p>
      )}

      {net !== 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {incoming ? 'Received into' : 'Paid from'}
          </p>
          <WalletPicker value={walletId} onChange={setWalletId} />
          <p className="mt-2 text-[11px] text-slate-600">
            {walletId === ''
              ? 'Pick the wallet the money moved through.'
              : `${fmt(amount, currency)} ${incoming ? 'enters' : 'leaves'} this wallet.`}
          </p>
        </>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Settling…' : 'Mark settled'}
      </button>
    </BottomSheet>
  );
}
