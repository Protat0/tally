'use client';

import { fmt } from './AppContext';
import HalfCircleProgress from './HalfCircleProgress';
import { PencilIcon } from './Icons';

function paceColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 80) return 'green';
  if (pct <= 100) return 'amber';
  return 'red';
}

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
        className="absolute top-0.5 right-0.5 z-10 flex h-11 w-11 items-center justify-center rounded-full text-slate-500 active:bg-white/10 hover:bg-white/10 hover:text-slate-200 transition-colors"
      >
        <PencilIcon className="w-4 h-4" />
      </button>

      <button
        onClick={onOpen}
        aria-label={`${label} details`}
        className="flex w-full flex-col rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 text-left hover:border-slate-600 hover:bg-[#141d2e] transition-colors"
      >
        {/* The gauge sits alongside the icon/label/spent stack rather than under
            it, so the card stays short and the dead space to the right is used.
            Bottom-aligned, which keeps the top-right corner clear for the pencil. */}
        <div className="flex w-full items-end gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg mb-2.5 shrink-0">
              {icon}
            </div>
            <p className="w-full text-sm font-medium text-white truncate">{label}</p>
            <p className="mt-1 text-lg font-bold text-white tabular-nums truncate">
              {fmt(spent, currency)}
            </p>
          </div>

          {hasBudget && (
            <HalfCircleProgress
              value={spent}
              max={budget}
              color={paceColor(pct)}
              className="w-[88px] sm:w-[104px] lg:w-[120px]"
            />
          )}
        </div>

        {hasBudget ? (
          <p className="mt-2 w-full text-[11px] text-slate-500 truncate">
            of {fmt(budget, currency)} ·{' '}
            <span className={over ? 'text-red-400' : 'text-slate-400'}>
              {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
            </span>
          </p>
        ) : (
          <p className="mt-2 text-[11px] text-slate-600">No budget set</p>
        )}
      </button>
    </div>
  );
}
