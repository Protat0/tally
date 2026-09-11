'use client';

import { fmt } from './AppContext';
import ProgressBar, { type Tone } from './ProgressBar';
import { PencilIcon } from './Icons';
import { IconTile } from './AppIcon';

function paceTone(pct: number): Tone {
  if (pct <= 80) return 'growth';
  if (pct <= 100) return 'warning';
  return 'danger';
}

const toneText: Record<Tone, string> = {
  growth:  'text-growth-text',
  warning: 'text-warning-text',
  danger:  'text-danger-text',
  primary: 'text-primary-text',
};

interface Props {
  icon: string;
  label: string;
  spent: number;
  budget: number;
  currency: string;
  onEdit: () => void;
  onOpen: () => void;
}

export default function CategoryCard({
  icon, label, spent, budget, currency, onEdit, onOpen,
}: Props) {
  const hasBudget = budget > 0;
  const remaining = budget - spent;
  const pct = hasBudget ? (spent / budget) * 100 : 0;
  const over = hasBudget && spent > budget;
  const tone = paceTone(pct);

  const border = over
    ? 'border-danger-edge'
    : hasBudget
      ? 'border-line hover:border-line-strong'
      : 'border-dashed border-line-strong';

  return (
    // The pencil is a sibling of the card button, not a child — buttons cannot
    // nest, and this way its click never has to be stopped from propagating.
    // Its touch target is a full 44px square; the visible circle stays small.
    // At 28px it was routinely missed on mobile.
    <div className="relative">
      <button
        onClick={onEdit}
        title={`Edit ${label} budget`}
        aria-label={`Edit ${label} budget`}
        className="absolute top-0.5 right-0.5 z-10 flex h-11 w-11 items-center justify-center rounded-full text-ink-4 hover:bg-raised hover:text-ink active:bg-raised transition-colors"
      >
        <PencilIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onOpen}
        aria-label={`${label} details`}
        className={`flex w-full flex-col gap-[9px] rounded-2xl border bg-surface p-3.5 text-left transition-colors hover:bg-raised ${border}`}
      >
        {/* Right padding keeps a long name out from under the pencil. */}
        <div className="flex w-full items-center gap-[9px] pr-8">
          <IconTile icon={icon} size="sm" />
          <span className="truncate text-sm font-semibold leading-none">{label}</span>
        </div>

        <p className={`w-full truncate text-xl font-bold leading-none tracking-tight tabular-nums ${over ? 'text-danger-text' : ''}`}>
          {fmt(spent, currency)}
        </p>

        {hasBudget ? (
          <ProgressBar value={spent} max={budget} tone={tone} size="sm" />
        ) : (
          // Striped, so "no budget" never reads as "nothing spent".
          <div className="h-[7px] w-full rounded-full bg-[repeating-linear-gradient(90deg,var(--color-raised)_0_6px,transparent_6px_10px)]" />
        )}

        {hasBudget ? (
          <p className="w-full truncate text-[11.5px] leading-snug tabular-nums text-ink-3">
            of {fmt(budget, currency)} ·{' '}
            <span className={`font-semibold ${toneText[tone]}`}>
              {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
            </span>
          </p>
        ) : (
          <p className="text-[11.5px] leading-snug text-ink-4">No budget set</p>
        )}
      </button>
    </div>
  );
}
