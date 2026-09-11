'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import NumberField from './NumberField';
import BottomSheet from './BottomSheet';

interface Props {
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
  allocated, unallocated, allocatedPct, parts, receivedThisMonth,
}: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlyIncome, currency } = settings;
  const [detailOpen, setDetailOpen] = useState(false);
  const over = unallocated < 0;

  return (
    <div className="flex flex-col gap-3.5 rounded-2xl border border-primary-edge bg-primary-tint px-4 py-[18px] md:p-[22px]">
      <div>
        <p className="text-[11px] font-semibold uppercase leading-none tracking-widest text-primary-text">
          Monthly budget
        </p>
        <div className="mt-2 flex items-center gap-1">
          <span className="text-[34px] font-bold leading-[1.1] tracking-[-0.035em] text-ink-3">{currency}</span>
          <NumberField
            value={monthlyIncome}
            onChange={v => updateSettings({ monthlyIncome: v })}
            step={500}
            min={0}
            className="min-w-0 flex-1"
            inputClassName="min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-1 text-[34px] font-bold leading-[1.1] tracking-[-0.035em] tabular-nums text-ink outline-none hover:border-line focus:border-primary"
          />
        </div>
        <p className="mt-1.5 text-[13px] leading-none text-ink-3">income this cycle</p>
      </div>

      {monthlyIncome === 0 ? (
        <p className="text-sm text-ink-2">
          Enter your monthly income above to start budgeting.
        </p>
      ) : (
        <>
          {/* Allocated fills from the left; what is still free shows as dark
              green behind it, so the bar reads "spoken for" against "yours". */}
          <div className="flex h-2.5 overflow-hidden rounded-full bg-raised">
            <div
              className={`h-full transition-all duration-500 ${over ? 'bg-danger' : 'bg-primary'}`}
              style={{ width: `${Math.min(allocatedPct, 100)}%` }}
            />
            {!over && <div className="h-full flex-1 bg-growth-edge" />}
          </div>

          <div className="flex items-end gap-5">
            <div>
              <p className="text-xs leading-none text-ink-3">Allocated</p>
              <p className="mt-1.5 text-[17px] font-bold leading-none tabular-nums">{fmt(allocated, currency)}</p>
            </div>
            <div>
              <p className="text-xs leading-none text-ink-3">{over ? 'Over budget' : 'Unallocated'}</p>
              <p className={`mt-1.5 text-[17px] font-bold leading-none tabular-nums ${over ? 'text-danger-text' : 'text-growth-text'}`}>
                {fmt(Math.abs(unallocated), currency)}
              </p>
            </div>
            <div className="ml-auto text-right">
              <p className="text-xs leading-none tabular-nums text-ink-3">{allocatedPct.toFixed(0)}% of income</p>
              <button
                onClick={() => setDetailOpen(true)}
                className="mt-1.5 text-xs font-medium leading-none text-primary-text hover:text-primary-hover transition-colors"
              >
                Breakdown →
              </button>
            </div>
          </div>
        </>
      )}

      {detailOpen && (
        <BottomSheet onClose={() => setDetailOpen(false)}>
          <p className="mb-5 text-lg font-semibold">Where it goes</p>

          <div className="mb-5 space-y-2">
            {parts.length === 0 && (
              <p className="text-sm text-ink-3">Nothing allocated yet.</p>
            )}
            {parts.map(p => (
              <div key={p.label} className="flex items-center justify-between gap-3">
                <p className="text-sm text-ink-2">{p.label}</p>
                <p className="text-sm font-medium tabular-nums">{fmt(p.value, currency)}</p>
              </div>
            ))}
            <div className="mt-2 flex items-center justify-between gap-3 border-t border-line pt-2">
              <p className="text-sm font-medium">Total allocated</p>
              <p className="text-sm font-bold tabular-nums">{fmt(allocated, currency)}</p>
            </div>
          </div>

          <div className="rounded-xl border border-line bg-canvas px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-ink-3">Received this cycle</p>
                <p className="mt-0.5 text-[11px] text-ink-4">Actual top-ups logged to your wallets</p>
              </div>
              <p className="shrink-0 text-right">
                <span className={`text-lg font-bold tabular-nums ${receivedThisMonth > 0 ? 'text-growth-text' : 'text-ink-3'}`}>
                  {fmt(receivedThisMonth, currency)}
                </span>
                {monthlyIncome > 0 && (
                  <span className="block text-[11px] text-ink-4">
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
