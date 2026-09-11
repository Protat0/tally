'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useApp, fmt, Expense } from './AppContext';
import BottomSheet from './BottomSheet';
import { cycleKeyOf, cycleLabel } from '@/lib/cycle';
import HalfCircleProgress from './HalfCircleProgress';
import type { Tone } from './ProgressBar';
import { IconTile } from './AppIcon';

function paceTone(pct: number): Tone {
  if (pct <= 80) return 'growth';
  if (pct <= 100) return 'warning';
  return 'danger';
}

interface Props {
  categoryKey: string;
  icon: string;
  label: string;
  budget: number;
  /** This cycle's spend — matches the card. */
  spent: number;
  currency: string;
  onClose: () => void;
}

interface CycleGroup {
  key: string;
  total: number;
  items: Expense[];
}

export default function CategoryDetailSheet({
  categoryKey, icon, label, budget, spent, currency, onClose,
}: Props) {
  const { expenses, wallets, debtEntries, debtPeople, settings, currentCycle } = useApp();
  const { cycleStartDay } = settings;

  const walletName = (id: string | null) => wallets.find(w => w.id === id)?.name ?? '';

  // A wallet-less expense was paid by someone else; name them where the wallet
  // name would otherwise go, so the subtitle is never blank.
  const fundedBy = (e: { id: string; walletId: string | null }) => {
    if (e.walletId) return walletName(e.walletId);
    const link = debtEntries.find(d => d.expenseId === e.id);
    const person = link && debtPeople.find(p => p.id === link.personId);
    return person ? `paid by ${person.name}` : '';
  };

  // Every expense ever logged against this category, newest first, grouped by
  // the CYCLE it fell in — the hero above totals a cycle, so grouping by
  // calendar month would print a different figure for the same period with
  // nothing on screen to explain the gap.
  const { groups, count, allTimeTotal } = useMemo(() => {
    const mine = expenses
      .filter(e => e.category === categoryKey)
      .sort((a, b) => b.date.localeCompare(a.date));

    const byCycle = new Map<string, CycleGroup>();
    mine.forEach(e => {
      const key = cycleKeyOf(new Date(e.date), cycleStartDay);
      const g = byCycle.get(key) ?? { key, total: 0, items: [] };
      g.total += e.amount;
      g.items.push(e);
      byCycle.set(key, g);
    });

    return {
      groups: [...byCycle.values()],
      count: mine.length,
      allTimeTotal: mine.reduce((s, e) => s + e.amount, 0),
    };
  }, [expenses, categoryKey, cycleStartDay]);

  const hasBudget = budget > 0;
  const remaining = budget - spent;
  const pct = hasBudget ? (spent / budget) * 100 : 0;
  const over = hasBudget && spent > budget;

  return (
    <BottomSheet onClose={onClose}>
      {/* ── Hero ── */}
      <div className="rounded-2xl bg-canvas border border-line p-4 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <IconTile icon={icon} />
          <div className="min-w-0">
            <p className="text-base font-semibold text-ink truncate">{label}</p>
            <p className="text-xs text-ink-3">{cycleLabel(currentCycle, cycleStartDay)}</p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-ink tabular-nums truncate">
              {fmt(spent, currency)}
            </p>
            {hasBudget ? (
              <p className="mt-1 text-xs text-ink-3 truncate">
                of {fmt(budget, currency)} ·{' '}
                <span className={over ? 'text-danger-text font-semibold' : 'text-ink-2'}>
                  {over
                    ? `${fmt(Math.abs(remaining), currency)} over`
                    : `${fmt(remaining, currency)} left`}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-ink-4">No budget set</p>
            )}
          </div>

          {hasBudget && (
            <HalfCircleProgress
              value={spent}
              max={budget}
              tone={paceTone(pct)}
              className="w-[104px]"
            />
          )}
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">
          Transactions
        </p>
        {count > 0 && (
          <p className="text-[11px] text-ink-4 tabular-nums shrink-0">
            {count} · {fmt(allTimeTotal, currency)} all time
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-line px-4 py-8 text-center">
          <p className="text-sm text-ink-3 mb-1">Nothing logged here yet.</p>
          <Link href="/expenses/new" className="text-xs text-primary-text underline underline-offset-2">
            Log an expense
          </Link>
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.key}>
              <div className="flex items-center justify-between gap-3 mb-2 px-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-ink-3">
                  {cycleLabel(g.key, cycleStartDay)}
                </p>
                <p className="text-xs font-medium text-danger-text tabular-nums shrink-0">
                  -{fmt(g.total, currency)}
                </p>
              </div>
              <div className="space-y-2">
                {g.items.map(e => {
                  const d = new Date(e.date);
                  const day = d.toLocaleDateString('en-PH', {
                    weekday: 'short', month: 'short', day: 'numeric',
                  });
                  const wallet = fundedBy(e);
                  return (
                    <div
                      key={e.id}
                      className="flex items-center gap-3 rounded-xl bg-raised border border-line px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-ink truncate">{e.note || label}</p>
                        <p className="text-xs text-ink-3 truncate">
                          {[day, wallet].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-danger-text tabular-nums shrink-0">
                        -{fmt(e.amount, currency)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </BottomSheet>
  );
}
