'use client';

import { useApp } from './AppContext';
import AppIcon from './AppIcon';

interface Props {
  /** '' when a card paid, or nothing has been chosen yet. */
  walletId: string;
  /** '' when a wallet paid, or nothing has been chosen yet. */
  cardId: string;
  onChange: (next: { walletId: string; cardId: string }) => void;
}

// Where an expense was paid from: a wallet or a credit card, never both, so
// choosing one clears the other. Wallets first, as on the expense form.
export default function FundingPicker({ walletId, cardId, onChange }: Props) {
  const { wallets, creditCards } = useApp();

  // An archived card takes no new purchases, but one it already paid for has
  // to stay pickable, or editing that expense would silently move it.
  const cards = creditCards.filter(c => !c.archivedAt || c.id === cardId);

  const chip = (selected: boolean) =>
    `flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
      selected
        ? 'border-primary bg-primary-tint text-ink'
        : 'border-line bg-raised text-ink-2 hover:text-ink'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map(w => (
        <button
          key={w.id}
          onClick={() => onChange({ walletId: w.id, cardId: '' })}
          className={chip(walletId === w.id)}
        >
          <AppIcon icon={w.icon} fallback="wallet" className="h-4 w-4 shrink-0 text-primary-text" />
          <span className="truncate">{w.name}</span>
        </button>
      ))}
      {cards.map(c => (
        <button
          key={c.id}
          onClick={() => onChange({ walletId: '', cardId: c.id })}
          className={chip(cardId === c.id)}
        >
          <AppIcon icon={c.icon} fallback="credit-card" className="h-4 w-4 shrink-0 text-primary-text" />
          <span className="truncate">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
