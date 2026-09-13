'use client';

import { fmt, type CreditCard } from './AppContext';
import { ymdToDate, type CardStatus, type CardSummary } from '@/lib/creditCard';
import ProgressBar, { type Tone } from './ProgressBar';
import { IconTile } from './AppIcon';

/** A due date as "Sep 25". */
export const shortDay = (ymd: string): string =>
  ymdToDate(ymd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** The one line a card shows about its last statement. */
export function cardStatusText(status: CardStatus, currency: string): string {
  if (status.kind === 'none') return 'No statement due';
  if (status.kind === 'paid') return 'Statement paid';
  const when = status.overdue ? `was due ${shortDay(status.dueOn)}` : `due ${shortDay(status.dueOn)}`;
  return `${fmt(status.unpaid, currency)} ${when} · min ${fmt(status.minimumLeft, currency)}`;
}

// Amber once it is due, red once that date has passed; green only for a card
// that owes nothing, which is money doing well.
const statusClass = (status: CardStatus): string => {
  if (status.kind === 'paid') return 'text-growth-text';
  if (status.kind === 'due') return status.overdue ? 'text-danger-text' : 'text-warning-text';
  return 'text-ink-4';
};

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onOpen: () => void;
}

// A card on the Wallets page: what is owed, how much of the limit is gone, and
// when it is due. The bar turns amber near the limit and red over it.
export default function CreditCardTile({ card, summary, currency, onOpen }: Props) {
  // A card in credit owes nothing; it never shows a negative debt.
  const owed = Math.max(0, summary.owedNow);
  const used = card.creditLimit > 0 ? owed / card.creditLimit : 0;
  const tone: Tone = used > 1 ? 'danger' : used >= 0.8 ? 'warning' : 'primary';

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={card.icon} fallback="credit-card" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{card.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            <span className="tabular-nums">{fmt(summary.availableCredit, currency)}</span> available
            {' of '}
            <span className="tabular-nums">{fmt(card.creditLimit, currency)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold leading-tight tabular-nums text-ink">{fmt(owed, currency)}</p>
          <p className="text-[11px] leading-tight text-ink-4">owed</p>
        </div>
      </div>

      <ProgressBar value={owed} max={card.creditLimit} tone={tone} className="mt-3" />
      <p className={`mt-2 text-xs ${statusClass(summary.status)}`}>
        {cardStatusText(summary.status, currency)}
      </p>
    </button>
  );
}
