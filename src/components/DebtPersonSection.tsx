'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import DebtEntryRow from './DebtEntryRow';
import { TrashIcon } from './Icons';
import type { PersonGroup } from '@/app/debts/page';

interface Props {
  group: PersonGroup;
  currency: string;
  onDeletePerson: () => void;
}

export default function DebtPersonSection({ group, currency, onDeletePerson }: Props) {
  const { setDebtEntrySettled, deleteDebtEntry, settleUpPerson } = useApp();
  const { person, open, settled, net } = group;
  const [showSettled, setShowSettled] = useState(false);

  const label = net > 0 ? 'owes you' : net < 0 ? 'you owe' : 'settled up';
  const tone  = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{person.emoji}</span>
          <p className="text-sm font-semibold text-white truncate">{person.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-base font-bold tabular-nums ${tone}`}>
            {net === 0 ? fmt(0, currency) : fmt(Math.abs(net), currency)}
          </p>
          <p className="text-[11px] text-slate-500">{label}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-3">
        {open.length > 0 && (
          <button
            onClick={() => settleUpPerson(person.id)}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-white/10 transition-colors"
          >
            Settle up
          </button>
        )}
        <button
          onClick={onDeletePerson}
          title={`Delete ${person.name}`}
          aria-label={`Delete ${person.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors ml-auto"
        >
          <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
        </button>
      </div>

      {/* Open entries */}
      {open.length === 0 ? (
        <p className="text-xs text-slate-600">Nothing outstanding.</p>
      ) : (
        <div className="space-y-2">
          {open.map(e => (
            <DebtEntryRow
              key={e.id}
              entry={e}
              currency={currency}
              onToggleSettled={() => setDebtEntrySettled(e.id, true)}
              onDelete={() => deleteDebtEntry(e.id)}
            />
          ))}
        </div>
      )}

      {/* Settled history */}
      {settled.length > 0 && (
        <div className="mt-3 border-t border-[#1e2d40] pt-3">
          <button
            onClick={() => setShowSettled(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showSettled ? '▴ Hide' : '▾ Show'} {settled.length} settled
          </button>
          {showSettled && (
            <div className="mt-2 space-y-2">
              {settled.map(e => (
                <DebtEntryRow
                  key={e.id}
                  entry={e}
                  currency={currency}
                  onToggleSettled={() => setDebtEntrySettled(e.id, false)}
                  onDelete={() => deleteDebtEntry(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
