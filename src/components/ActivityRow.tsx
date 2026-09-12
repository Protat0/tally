'use client';

import { useState } from 'react';
import { fmt } from './AppContext';
import { useSwipeActions } from './useSwipeActions';
import { PencilIcon, TrashIcon } from './Icons';
import { IconTile } from './AppIcon';

//   spent — expenses, and withdrawals from before they landed in cash
//   earned — wallet top-ups
//   moved — transfers and withdrawals. Net-zero, so excluded from both totals.
export type Flow = 'spent' | 'earned' | 'moved';

// What the row is underneath, and therefore which path an edit or a delete has
// to take. A settle-up is deliberately not editable: its amount is a net that
// several debt rows share and none of them owns, so the only coherent thing to
// do with it is reverse the whole batch.
export type RowSource =
  | { kind: 'expense'; id: string }
  | { kind: 'move'; id: string }
  | { kind: 'debt'; entryId: string }
  | { kind: 'settle'; settleMoveId: string }
  // A movement into or out of the emergency fund, owned by its fund entry.
  | { kind: 'fund'; entryId: string }
  // Paying a credit card bill: deleted like any movement, but never edited on
  // its own, so it cannot drift from the card it paid.
  | { kind: 'cardPayment'; id: string }
  // A card's interest or fees. Calculated from its statements, so there is
  // nothing to edit and nothing to delete.
  | { kind: 'charge' };

export interface FeedItem {
  id: string; date: string; flow: Flow;
  icon: string; label: string; sub: string; amount: number;
  // A bank fee paid on top of `amount`. It counts as spent even when the move
  // itself is net-zero.
  fee?: number;
  updatedAt: string | null;
  source: RowSource;
}

interface Props {
  item: FeedItem;
  currency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

export default function ActivityRow({
  item, currency, open, onOpenChange, onEdit, onDelete,
}: Props) {
  const swipe = useSwipeActions(open, onOpenChange);
  // Deleting confirms in place with a second tap. A native confirm() would
  // block the page, and a whole modal for one button is more than this needs.
  const [confirming, setConfirming] = useState(false);

  // A fund movement is changed through its fund entry and a card payment
  // through its card; a calculated charge is not changed at all.
  const kind = item.source.kind;
  const editable = kind !== 'settle' && kind !== 'fund' && kind !== 'cardPayment' && kind !== 'charge';
  // With nothing to do to it, a charge gets no action rail and no swipe.
  const actionable = kind !== 'charge';
  const destructive = kind === 'settle' ? 'Reverse' : 'Delete';

  const close = () => { setConfirming(false); onOpenChange(false); };

  return (
    <div className="group relative overflow-hidden rounded-xl">

      {/* ── Action rail ──
          Below md it sits behind the row and the swipe uncovers it. At md and
          up there is no swipe, so it floats above the row's right edge and
          appears on hover or keyboard focus instead. */}
      {actionable && (
      <div
        className="absolute inset-y-0 right-0 z-0 flex md:z-20 md:opacity-0 md:transition-opacity
                   md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        style={{ width: swipe.railWidth }}
      >
        {editable && (
          <button
            onClick={() => { onEdit(); close(); }}
            aria-label="Edit entry"
            className="flex-1 flex items-center justify-center bg-raised text-ink active:bg-line-strong hover:bg-line-strong transition-colors"
          >
            <PencilIcon className="w-4 h-4" />
          </button>
        )}
        <button
          onClick={() => (confirming ? (onDelete(), close()) : setConfirming(true))}
          aria-label={confirming ? `Confirm ${destructive.toLowerCase()}` : destructive}
          className={`flex items-center justify-center gap-1.5 px-3 text-ink transition-colors ${
            confirming ? 'bg-danger hover:bg-danger' : 'bg-danger-strong hover:bg-danger'
          } ${editable ? 'flex-1' : 'w-full'}`}
        >
          {confirming
            ? <span className="text-xs font-semibold">Sure?</span>
            : <TrashIcon className="w-4 h-4" />}
        </button>
      </div>
      )}

      {/* ── The row itself ──
          Opaque, so at rest it hides the rail behind it. */}
      <div
        className="relative z-10 flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3"
        style={actionable ? swipe.style : undefined}
        {...(actionable ? swipe.handlers : {})}
      >
        <IconTile icon={item.icon} tone={item.flow === 'earned' ? 'growth' : 'primary'} />
        <div className="flex-1 min-w-0">
          <p className="text-sm text-ink capitalize">
            {item.label}
            {item.updatedAt && (
              <span className="ml-1.5 align-middle text-[10px] font-medium text-ink-3 normal-case">
                edited
              </span>
            )}
          </p>
          <p className="text-xs text-ink-3 truncate">{item.sub}</p>
        </div>
        <p className={`text-sm font-medium shrink-0 ${
          item.flow === 'earned' ? 'text-growth-text'
          : item.flow === 'moved' ? 'text-ink-2'
          : 'text-danger-text'
        }`}>
          {item.flow === 'earned' ? '+' : item.flow === 'moved' ? '' : '-'}
          {fmt(item.amount, currency)}
        </p>
      </div>
    </div>
  );
}
