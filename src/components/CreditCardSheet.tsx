'use client';

import { useState } from 'react';
import { useApp, fmt, round2, type CreditCard } from './AppContext';
import BottomSheet from './BottomSheet';
import { IconTile } from './AppIcon';
import { PencilIcon, TrashIcon } from './Icons';
import { categoryMeta } from '@/lib/categories';
import type { CardSummary } from '@/lib/creditCard';
import { shortDay } from './CreditCardTile';

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
}

const row = 'flex items-baseline justify-between gap-3 text-sm';

// What the card is doing: owed now, the last statement in full, and the rows
// behind both. Interest is calculated rather than read off a statement, so it
// says so wherever it appears.
export default function CreditCardSheet({ card, summary, currency, onClose, onPay, onEdit }: Props) {
  const { expenses, debtEntries, moneyMoves, settings, archiveCreditCard } = useApp();
  const [confirming, setConfirming] = useState(false);
  const { last } = summary;
  const { charges } = last;

  // A purchase charged the card the whole amount paid at the till: your share
  // plus whatever others owe you back on it.
  const chargedFor = (expenseId: string, amount: number) => round2(amount + debtEntries
    .filter(d => d.expenseId === expenseId && d.direction === 'owed_to_me')
    .reduce((s, d) => s + d.amount, 0));

  const recent = [
    ...expenses.filter(e => e.cardId === card.id).map(e => ({
      id: e.id, date: e.date, payment: false,
      label: categoryMeta(e.category, settings.customCategories).label,
      note: e.note, amount: chargedFor(e.id, e.amount),
    })),
    ...moneyMoves.filter(m => m.kind === 'card_payment' && m.cardId === card.id).map(m => ({
      id: m.id, date: m.date, payment: true,
      label: 'Payment', note: m.note, amount: m.amount,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  const archive = async () => { await archiveCreditCard(card.id); onClose(); };

  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <IconTile icon={card.icon} fallback="credit-card" size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight text-ink">{card.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Closes day {card.statementDay} · due day {card.dueDay}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-xl border border-line bg-raised px-4 py-3">
        <div className={row}>
          <span className="text-ink-2">Owed now</span>
          <span className="font-semibold tabular-nums text-ink">
            {fmt(Math.max(0, summary.owedNow), currency)}
          </span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Available credit</span>
          <span className="tabular-nums text-ink">{fmt(summary.availableCredit, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Not yet on a statement</span>
          <span className="tabular-nums text-ink">{fmt(summary.unbilled, currency)}</span>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
        Statement of {shortDay(last.closesOn)}
      </p>
      <div className="mb-4 space-y-2 rounded-xl border border-line bg-raised px-4 py-3">
        <div className={row}>
          <span className="text-ink-2">Balance</span>
          <span className="font-semibold tabular-nums text-ink">{fmt(last.balance, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Due {shortDay(last.dueOn)}</span>
          <span className="tabular-nums text-ink">min {fmt(last.minimumDue, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Paid since it closed</span>
          <span className="tabular-nums text-ink">{fmt(summary.paidSinceClose, currency)}</span>
        </div>
        {charges.interest > 0 && (
          <div className={row}>
            <span className="text-ink-2">Interest <span className="text-ink-4">(estimate)</span></span>
            <span className="tabular-nums text-ink">{fmt(charges.interest, currency)}</span>
          </div>
        )}
        {charges.lateFee > 0 && (
          <div className={row}>
            <span className="text-ink-2">Late fee</span>
            <span className="tabular-nums text-ink">{fmt(charges.lateFee, currency)}</span>
          </div>
        )}
        {charges.annualFee > 0 && (
          <div className={row}>
            <span className="text-ink-2">Annual fee</span>
            <span className="tabular-nums text-ink">{fmt(charges.annualFee, currency)}</span>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Recent</p>
          <div className="mb-4 space-y-1.5">
            {recent.map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {r.label}
                  {r.note ? <span className="text-ink-3"> · {r.note}</span> : null}
                </span>
                {/* A payment brings the balance down, a purchase pushes it up. */}
                <span className={`shrink-0 tabular-nums ${r.payment ? 'text-growth-text' : 'text-ink-2'}`}>
                  {r.payment ? '−' : '+'}{fmt(r.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onPay}
        className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover transition-colors"
      >
        Pay this card
      </button>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 transition-colors"
        >
          <PencilIcon className="h-3.5 w-3.5" /> Edit card
        </button>
        {confirming ? (
          <button
            onClick={archive}
            onBlur={() => setConfirming(false)}
            className="rounded-lg bg-danger-strong px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            {summary.owedNow > 0 ? `Delete — ${fmt(summary.owedNow, currency)} still owed` : 'Sure?'}
          </button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 text-xs text-ink-4 hover:text-danger-text transition-colors"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Delete card
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-4">
        Deleting keeps this card’s purchases and payments as history. The card
        itself leaves your lists.
      </p>
    </BottomSheet>
  );
}
