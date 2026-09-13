'use client';

import { fmt, type CreditCard } from './AppContext';
import { ymdToDate, type CardSummary } from '@/lib/creditCard';
import { shortDay } from './CreditCardTile';
import { ChevronRightIcon } from './Icons';

const DAY_MS = 86_400_000;

// Whole days from today, so a due date is described the same whatever the time
// of day: "due today", "due tomorrow", "due in 4 days".
function dueWhen(dueOn: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((ymdToDate(dueOn).getTime() - today.getTime()) / DAY_MS);
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onPay: () => void;
}

// One card's bill on the dashboard, while it is worth chasing: amber until the
// due date has passed, red after it. The same shape as the unconfirmed payday
// prompt, which is the pattern for "this needs you".
export default function CardDueStrip({ card, summary, currency, onPay }: Props) {
  const status = summary.status;
  if (status.kind !== 'due') return null;

  const tone = status.overdue
    ? 'border-danger-edge bg-danger-tint text-danger-text hover:border-danger/60'
    : 'border-warning-edge bg-warning-tint text-warning-text hover:border-warning/60';

  return (
    <button
      onClick={onPay}
      className={`flex w-full items-start gap-[9px] rounded-[11px] border px-3 py-2.5 text-left transition-colors md:col-span-2 ${tone}`}
    >
      <span className={`mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full ${status.overdue ? 'bg-danger' : 'bg-warning'}`} />
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">
        {card.name} · <span className="tabular-nums">{fmt(status.unpaid, currency)}</span>
        {' '}
        {status.overdue ? `overdue — was due ${shortDay(status.dueOn)}` : dueWhen(status.dueOn)}
        {' · min '}
        <span className="tabular-nums">{fmt(status.minimumLeft, currency)}</span>
      </span>
      <ChevronRightIcon className="mt-px h-4 w-4 shrink-0 opacity-70" />
    </button>
  );
}
