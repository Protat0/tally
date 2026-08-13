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
      settled ? 'bg-white/[0.02] border-[#1e2d40]' : 'bg-white/5 border-[#1e2d40]'
    }`}>
      <span className={`text-xs shrink-0 ${owedToMe ? 'text-emerald-400' : 'text-red-400'}`}>
        {owedToMe ? '→' : '←'}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${settled ? 'text-slate-500 line-through' : 'text-white'}`}>
          {entry.note || (owedToMe ? 'They owe you' : 'You owe them')}
        </p>
        <p className="text-[11px] text-slate-600">{day}</p>
      </div>

      <p className={`text-sm font-medium tabular-nums shrink-0 ${
        settled ? 'text-slate-600' : owedToMe ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {owedToMe ? '+' : '-'}{fmt(entry.amount, currency)}
      </p>

      <button
        onClick={onToggleSettled}
        title={settled ? 'Mark unsettled' : 'Mark settled'}
        aria-label={settled ? 'Mark unsettled' : 'Mark settled'}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          settled
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10'
        }`}
      >
        <CheckIcon className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onDelete}
        title={deleteLabel}
        aria-label={deleteLabel}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
      </button>
    </div>
  );
}
