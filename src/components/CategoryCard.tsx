'use client';

import { fmt } from './AppContext';
import ProgressBar from './ProgressBar';

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
  onClick: () => void;
}

export default function CategoryCard({ icon, label, spent, budget, currency, onClick }: Props) {
  const hasBudget = budget > 0;
  const remaining = budget - spent;
  const pct = hasBudget ? (spent / budget) * 100 : 0;
  const over = hasBudget && spent > budget;

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 text-left hover:border-slate-600 hover:bg-[#141d2e] transition-colors"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg mb-2.5 shrink-0">
        {icon}
      </div>
      <p className="w-full text-sm font-medium text-white truncate">{label}</p>
      <p className="mt-1 text-lg font-bold text-white tabular-nums">{fmt(spent, currency)}</p>

      {hasBudget ? (
        <>
          <p className="mt-0.5 mb-2.5 w-full text-[11px] text-slate-500 truncate">
            of {fmt(budget, currency)} ·{' '}
            <span className={over ? 'text-red-400' : 'text-slate-400'}>
              {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
            </span>
          </p>
          <ProgressBar value={spent} max={budget} color={paceColor(pct)} className="mt-auto" />
        </>
      ) : (
        <p className="mt-0.5 text-[11px] text-slate-600">No budget set</p>
      )}
    </button>
  );
}
