'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import DebtEntryRow from './DebtEntryRow';
import SettleUpSheet from './SettleUpSheet';
import { TrashIcon } from './Icons';
import type { PersonGroup } from '@/app/debts/page';

interface Props {
  group: PersonGroup;
  currency: string;
  onDeletePerson: () => void;
}

export default function DebtPersonSection({ group, currency, onDeletePerson }: Props) {
  const { setDebtEntrySettled, deleteDebtEntry, reverseSettleBatch } = useApp();
  const { person, open, settled, net } = group;
  const [showSettled, setShowSettled] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [confirmBatch, setConfirmBatch] = useState<string | null>(null);

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
            onClick={() => setSettleOpen(true)}
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
                  onToggleSettled={() =>
                    e.settleMoveId
                      ? setConfirmBatch(e.settleMoveId)
                      : setDebtEntrySettled(e.id, false)
                  }
                  onDelete={() => deleteDebtEntry(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}

      {settleOpen && (
        <SettleUpSheet
          person={person}
          net={net}
          currency={currency}
          onClose={() => setSettleOpen(false)}
        />
      )}

      {confirmBatch && (() => {
        const batch = settled.filter(e => e.settleMoveId === confirmBatch);
        const batchNet = batch.reduce(
          (s, e) => s + (e.direction === 'owed_to_me' ? e.amount : -e.amount), 0,
        );
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            onClick={() => setConfirmBatch(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
              onClick={ev => ev.stopPropagation()}
            >
              <p className="font-semibold text-white mb-1">Reopen this settle-up?</p>
              <p className="text-sm text-slate-500 mb-5">
                {batch.length === 1
                  ? 'This item was settled as a single payment.'
                  : `This was settled together with ${batch.length - 1} other item${batch.length > 2 ? 's' : ''}. All ${batch.length} will reopen.`}
                {batchNet !== 0 && ` ${fmt(Math.abs(batchNet), currency)} will be returned to the wallet it moved through.`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmBatch(null)}
                  className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    reverseSettleBatch(confirmBatch);
                    setConfirmBatch(null);
                  }}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
