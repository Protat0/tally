'use client';

import { fmt } from './AppContext';

interface Props {
  owedToMe: number;
  iOwe: number;
  currency: string;
}

// The three numbers the page exists to answer, before any detail.
export default function DebtSummary({ owedToMe, iOwe, currency }: Props) {
  const net = owedToMe - iOwe;

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">You&rsquo;re owed</p>
          <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums truncate">
            {fmt(owedToMe, currency)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">You owe</p>
          <p className="mt-1 text-lg font-bold text-red-400 tabular-nums truncate">
            {fmt(iOwe, currency)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Net</p>
          <p className={`mt-1 text-lg font-bold tabular-nums truncate ${
            net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-slate-400'
          }`}>
            {net > 0 ? '+' : net < 0 ? '-' : ''}{fmt(Math.abs(net), currency)}
          </p>
        </div>
      </div>
      {net !== 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {net > 0 ? 'Overall, people owe you.' : 'Overall, you owe people.'}
        </p>
      )}
    </div>
  );
}
