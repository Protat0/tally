'use client';

import { useState } from 'react';
import { useApp, fmt, DebtPerson } from './AppContext';
import BottomSheet from './BottomSheet';

interface Props {
  person: DebtPerson;
  net: number;
  currency: string;
  onClose: () => void;
}

// Squaring up is one exchange of one amount: the net. Picking a wallet is
// optional — leave it blank when the cash never touched a tracked wallet.
export default function SettleUpSheet({ person, net, currency, onClose }: Props) {
  const { wallets, settleUpPerson } = useApp();
  const [walletId, setWalletId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const incoming = net > 0;
  const amount = Math.abs(net);

  const handleSettle = async () => {
    setSaving(true);
    await settleUpPerson(person.id, walletId || null);
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">
        Settle up with {person.name}
      </p>

      {net === 0 ? (
        <p className="text-sm text-slate-500 mb-5">
          These cancel out exactly — nothing changes hands. Everything will be
          marked settled.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-5">
          {incoming ? `${person.name} pays you ` : `You pay ${person.name} `}
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
            <span className="text-slate-600"> · optional</span>
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setWalletId('')}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                walletId === ''
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              No wallet
            </button>
            {wallets.map(w => (
              <button
                key={w.id}
                onClick={() => setWalletId(w.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  walletId === w.id
                    ? 'border-blue-500 bg-blue-500/15 text-white'
                    : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span>{w.icon}</span>{w.name}
              </button>
            ))}
          </div>
          <p className="mb-1 text-[11px] text-slate-600">
            {walletId === ''
              ? 'No balance will change.'
              : `${fmt(amount, currency)} ${incoming ? 'enters' : 'leaves'} this wallet.`}
          </p>
        </>
      )}

      <button
        onClick={handleSettle}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Settling…' : 'Settle up'}
      </button>
    </BottomSheet>
  );
}
