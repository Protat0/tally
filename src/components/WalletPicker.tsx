'use client';

import { useApp } from './AppContext';

interface Props {
  value: string;                     // '' means no wallet
  onChange: (walletId: string) => void;
}

// Wallet chooser. There is deliberately no default selection — an extra tap
// costs less than silently recording a movement against the wrong wallet.
export default function WalletPicker({ value, onChange }: Props) {
  const { wallets } = useApp();

  const chip = (selected: boolean) =>
    `flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
      selected
        ? 'border-blue-500 bg-blue-500/15 text-white'
        : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map(w => (
        <button key={w.id} onClick={() => onChange(w.id)} className={chip(value === w.id)}>
          <span>{w.icon}</span>{w.name}
        </button>
      ))}
    </div>
  );
}
