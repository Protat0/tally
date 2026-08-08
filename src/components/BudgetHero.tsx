'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import ProgressBar from './ProgressBar';
import NumberField from './NumberField';
import BottomSheet from './BottomSheet';

interface Props {
  monthLabel: string;
  allocated: number;
  unallocated: number;
  allocatedPct: number;
  parts: { label: string; value: number }[];
  receivedThisMonth: number;
}

// The one band that is never collapsed — it is why the page gets opened. The
// breakdown chips and actual-received figure sit behind a tap, since neither
// changes the headline number.
export default function BudgetHero({
  monthLabel, allocated, unallocated, allocatedPct, parts, receivedThisMonth,
}: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlyIncome, currency } = settings;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Monthly Budget</p>
          <p className="text-2xl font-bold text-white mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-lg text-slate-500">{currency}</span>
          <NumberField
            value={monthlyIncome}
            onChange={v => updateSettings({ monthlyIncome: v })}
            step={500}
            min={0}
            inputClassName="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-1.5 text-right text-lg font-bold text-white outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {monthlyIncome === 0 ? (
        <p className="text-sm text-slate-400 text-center py-1">
          Enter your monthly income above to start budgeting.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Allocated</p>
              <p className="text-2xl font-bold text-white">{fmt(allocated, currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-0.5">
                {unallocated >= 0 ? 'Unallocated' : 'Over budget'}
              </p>
              <p className={`text-lg font-bold ${unallocated >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(Math.abs(unallocated), currency)}
              </p>
            </div>
          </div>

          <ProgressBar
            value={allocated}
            max={monthlyIncome}
            color={allocatedPct <= 80 ? 'green' : allocatedPct <= 100 ? 'amber' : 'red'}
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {allocatedPct.toFixed(0)}% of {fmt(monthlyIncome, currency)} income
            </p>
            <button onClick={() => setDetailOpen(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0">
              Breakdown →
            </button>
          </div>
        </>
      )}

      {detailOpen && (
        <BottomSheet onClose={() => setDetailOpen(false)}>
          <p className="font-semibold text-white text-lg mb-5">Where it goes</p>

          <div className="space-y-2 mb-5">
            {parts.length === 0 && (
              <p className="text-sm text-slate-500">Nothing allocated yet.</p>
            )}
            {parts.map(p => (
              <div key={p.label} className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-400">{p.label}</p>
                <p className="text-sm font-medium text-white tabular-nums">{fmt(p.value, currency)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-[#1e2d40] pt-2 mt-2">
              <p className="text-sm font-medium text-white">Total allocated</p>
              <p className="text-sm font-bold text-white tabular-nums">{fmt(allocated, currency)}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Received this month</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Actual top-ups logged to your wallets</p>
              </div>
              <p className="text-right shrink-0">
                <span className={`text-lg font-bold ${receivedThisMonth > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {fmt(receivedThisMonth, currency)}
                </span>
                {monthlyIncome > 0 && (
                  <span className="block text-[11px] text-slate-600">
                    of {fmt(monthlyIncome, currency)} expected
                  </span>
                )}
              </p>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
