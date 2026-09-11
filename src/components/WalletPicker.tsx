'use client';

import { useApp } from './AppContext';
import AppIcon from './AppIcon';

interface Props {
  value: string;                     // '' means no wallet
  onChange: (walletId: string) => void;
}

// Wallet chooser. There is deliberately no default selection — an extra tap
// costs less than silently recording a movement against the wrong wallet.
export default function WalletPicker({ value, onChange }: Props) {
  const { wallets } = useApp();

  // max-w-full + truncate: a chip sizes to its content, so a long wallet name
  // would otherwise make the chip wider than the sheet. flex-wrap wraps items,
  // it does not shrink one that is already too wide.
  const chip = (selected: boolean) =>
    `flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
      selected
        ? 'border-primary bg-primary-tint text-ink'
        : 'border-line bg-raised text-ink-2 hover:text-ink'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map(w => (
        <button key={w.id} onClick={() => onChange(w.id)} className={chip(value === w.id)}>
          <AppIcon icon={w.icon} fallback="wallet" className="h-4 w-4 shrink-0 text-primary-text" />
          <span className="truncate">{w.name}</span>
        </button>
      ))}
    </div>
  );
}
