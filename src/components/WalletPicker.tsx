'use client';

import { useApp } from './AppContext';

interface Props {
  value: string;                     // '' means no wallet
  onChange: (walletId: string) => void;
}

// Optional wallet chooser. "No wallet" is always first and is a real choice,
// not an empty state — plenty of debts are cash that never touched a tracked
// wallet, and those must move no balance.
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
      <button onClick={() => onChange('')} className={chip(value === '')}>
        No wallet
      </button>
      {wallets.map(w => (
        <button key={w.id} onClick={() => onChange(w.id)} className={chip(value === w.id)}>
          <span>{w.icon}</span>{w.name}
        </button>
      ))}
    </div>
  );
}
