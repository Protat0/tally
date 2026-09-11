'use client';

import { fmt, DebtEntry } from './AppContext';
import { CheckIcon, TrashIcon } from './Icons';

interface Props {
  entry: DebtEntry;
  currency: string;
  onToggleSettled: () => void;
  onDelete: () => void;
  // The parent decides where the trash button leads — straight to a delete, or
  // to the reopen prompt for a row that was settled as part of a batch — so it
  // names the button too.
  deleteLabel?: string;
}

export default function DebtEntryRow({
  entry, currency, onToggleSettled, onDelete, deleteLabel = 'Delete entry',
}: Props) {
  const settled = Boolean(entry.settledAt);
  const owedToMe = entry.direction === 'owed_to_me';
  const day = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
  });

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
      settled ? 'bg-canvas border-line' : 'bg-raised border-line'
    }`}>
      <span className={`text-xs shrink-0 ${owedToMe ? 'text-growth-text' : 'text-danger-text'}`}>
        {owedToMe ? '→' : '←'}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${settled ? 'text-ink-3 line-through' : 'text-ink'}`}>
          {entry.note || (owedToMe ? 'They owe you' : 'You owe them')}
        </p>
        <p className="text-[11px] text-ink-4">{day}</p>
      </div>

      <p className={`text-sm font-medium tabular-nums shrink-0 ${
        settled ? 'text-ink-4' : owedToMe ? 'text-growth-text' : 'text-danger-text'
      }`}>
        {owedToMe ? '+' : '-'}{fmt(entry.amount, currency)}
      </p>

      <button
        onClick={onToggleSettled}
        title={settled ? 'Mark unsettled' : 'Mark settled'}
        aria-label={settled ? 'Mark unsettled' : 'Mark settled'}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          settled
            ? 'bg-growth-tint text-growth-text'
            : 'bg-raised text-ink-3 hover:text-ink hover:bg-line'
        }`}
      >
        <CheckIcon className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-line transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5 text-ink-4 hover:text-danger-text" />
      </button>
    </div>
  );
}
