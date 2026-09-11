'use client';

import { useState } from 'react';
import { useApp, fmt, DebtEntry } from './AppContext';
import DebtEntryRow from './DebtEntryRow';
import SettleUpSheet from './SettleUpSheet';
import { ScrollLock } from './ModalLock';
import { TrashIcon } from './Icons';
import type { PersonGroup } from '@/app/debts/page';
import PersonAvatar from './PersonAvatar';

interface Props {
  group: PersonGroup;
  currency: string;
  onDeletePerson: () => void;
}

export default function DebtPersonSection({ group, currency, onDeletePerson }: Props) {
  const { setDebtEntrySettled, deleteDebtEntry, settleUpPerson, reverseSettleBatch,
          recordDebtPayment } = useApp();
  const { person, open, settled, net } = group;
  const [showSettled, setShowSettled] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [settleEntry, setSettleEntry] = useState<DebtEntry | null>(null);
  const [confirmBatch, setConfirmBatch] = useState<string | null>(null);

  const avatarTone = net > 0 ? 'growth' : net < 0 ? 'danger' : 'neutral';
  const amountTone = net > 0 ? 'text-growth-text' : net < 0 ? 'text-danger-text' : 'text-ink-4';
  // The sentence carries the direction, so the amount never needs a sign.
  const title = net > 0 ? `${person.name} owes you` : net < 0 ? `You owe ${person.name}` : person.name;

  return (
    <div className="rounded-2xl bg-surface border border-line p-4">
      {/* Header — who, which way, how much, and the one thing to do about it */}
      <div className="flex items-center gap-[13px]">
        <PersonAvatar name={person.name} tone={avatarTone} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight">{title}</p>
          <p className={`mt-1 text-[17px] font-bold leading-tight tabular-nums ${amountTone}`}>
            {net === 0 ? 'Settled up' : fmt(Math.abs(net), currency)}
          </p>
        </div>
        {open.length > 0 && (
          <button
            onClick={() => setSettleOpen(true)}
            className="shrink-0 rounded-full border border-primary px-3.5 py-[9px] text-[13px] font-semibold leading-none text-primary-text hover:bg-primary hover:text-on-primary transition-colors"
          >
            Settle up
          </button>
        )}
        <button
          onClick={onDeletePerson}
          title={`Delete ${person.name}`}
          aria-label={`Delete ${person.name}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink-4 hover:bg-raised hover:text-danger-text transition-colors"
        >
          <TrashIcon className="w-4 h-4" />
        </button>
      </div>

      {/* Open entries */}
      {open.length === 0 ? (
        <p className="mt-3 text-xs text-ink-4">Nothing outstanding.</p>
      ) : (
        <div className="mt-3 space-y-2">
          {open.map(e => (
            <DebtEntryRow
              key={e.id}
              entry={e}
              currency={currency}
              onToggleSettled={() => setSettleEntry(e)}
              onDelete={() => deleteDebtEntry(e.id)}
            />
          ))}
        </div>
      )}

      {/* Settled history */}
      {settled.length > 0 && (
        <div className="mt-3 border-t border-line pt-3">
          <button
            onClick={() => setShowSettled(v => !v)}
            className="text-xs text-ink-3 hover:text-ink-2 transition-colors"
          >
            {showSettled ? '▴ Hide' : '▾ Show'} {settled.length} settled
          </button>
          {showSettled && (
            <div className="mt-2 space-y-2">
              {/* A row settled through a wallet was netted with the rest of its
                  batch into one movement that belongs to no single row, so it
                  can be neither un-settled nor deleted on its own without the
                  ledger losing the difference. Both buttons therefore lead to
                  the same place: reopen the settle-up, which restores the money
                  and every row, and then the row deletes cleanly from the open
                  list. */}
              {settled.map(e => (
                <DebtEntryRow
                  key={e.id}
                  entry={e}
                  currency={currency}
                  deleteLabel={e.settleMoveId ? 'Reopen the settle-up to delete this' : undefined}
                  onToggleSettled={() =>
                    e.settleMoveId
                      ? setConfirmBatch(e.settleMoveId)
                      : setDebtEntrySettled(e.id, false)
                  }
                  onDelete={() =>
                    e.settleMoveId
                      ? setConfirmBatch(e.settleMoveId)
                      : deleteDebtEntry(e.id)
                  }
                />
              ))}
            </div>
          )}
        </div>
      )}

      {settleOpen && (
        <SettleUpSheet
          title={`Settle up with ${person.name}`}
          personName={person.name}
          net={net}
          currency={currency}
          allowPartial
          onConfirm={wid => settleUpPerson(person.id, wid)}
          onPartial={(amt, wid) => recordDebtPayment(person.id, amt, wid)}
          onClose={() => setSettleOpen(false)}
        />
      )}

      {settleEntry && (
        <SettleUpSheet
          title={settleEntry.note || 'Mark settled'}
          personName={person.name}
          // One row on its own: the sign is its direction, not a person's net.
          net={settleEntry.direction === 'owed_to_me' ? settleEntry.amount : -settleEntry.amount}
          currency={currency}
          onConfirm={wid => setDebtEntrySettled(settleEntry.id, true, wid)}
          onClose={() => setSettleEntry(null)}
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
            <ScrollLock />
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl bg-surface border border-line p-6 text-center"
              onClick={ev => ev.stopPropagation()}
            >
              <p className="font-semibold text-ink mb-1">Reopen this settle-up?</p>
              <p className="text-sm text-ink-3 mb-5">
                {batch.length === 1
                  ? 'This item was settled as a single payment.'
                  : `This was settled together with ${batch.length - 1} other item${batch.length > 2 ? 's' : ''}. All ${batch.length} will reopen.`}
                {batchNet !== 0 && ` ${fmt(Math.abs(batchNet), currency)} will be returned to the wallet it moved through.`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmBatch(null)}
                  className="flex-1 rounded-xl bg-raised py-3 text-sm font-medium text-ink-2 hover:bg-line transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    reverseSettleBatch(confirmBatch);
                    setConfirmBatch(null);
                  }}
                  className="flex-1 rounded-xl bg-primary py-3 text-sm font-semibold text-on-primary hover:bg-primary-hover transition-colors"
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
