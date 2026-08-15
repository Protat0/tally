'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { useApp, fmt, Expense } from './AppContext';
import BottomSheet from './BottomSheet';
import HalfCircleProgress from './HalfCircleProgress';

function paceColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 80) return 'green';
  if (pct <= 100) return 'amber';
  return 'red';
}

// Local, not UTC — a late-evening expense in PH would otherwise land in the
// next month's group.
function monthKeyOf(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabelOf(key: string): string {
  const [y, m] = key.split('-');
  return new Date(parseInt(y), parseInt(m) - 1)
    .toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
}

interface Props {
  categoryKey: string;
  icon: string;
  label: string;
  budget: number;
  /** This month's spend — matches the card, and is metered for Electric. */
  spent: number;
  currency: string;
  /** Electric is metered from appliance usage, so it has no logged expenses. */
  metered?: boolean;
  onClose: () => void;
}

interface MonthGroup {
  key: string;
  total: number;
  items: Expense[];
}

export default function CategoryDetailSheet({
  categoryKey, icon, label, budget, spent, currency, metered = false, onClose,
}: Props) {
  const { expenses, wallets, debtEntries, debtPeople } = useApp();

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
  // the month it fell in.
  const { groups, count, allTimeTotal } = useMemo(() => {
    const mine = expenses
      .filter(e => e.category === categoryKey)
      .sort((a, b) => b.date.localeCompare(a.date));

    const byMonth = new Map<string, MonthGroup>();
    mine.forEach(e => {
      const key = monthKeyOf(e.date);
      const g = byMonth.get(key) ?? { key, total: 0, items: [] };
      g.total += e.amount;
      g.items.push(e);
      byMonth.set(key, g);
    });

    return {
      groups: [...byMonth.values()],
      count: mine.length,
      allTimeTotal: mine.reduce((s, e) => s + e.amount, 0),
    };
  }, [expenses, categoryKey]);

  const hasBudget = budget > 0;
  const remaining = budget - spent;
  const pct = hasBudget ? (spent / budget) * 100 : 0;
  const over = hasBudget && spent > budget;

  return (
    <BottomSheet onClose={onClose}>
      {/* ── Hero ── */}
      <div className="rounded-2xl bg-white/5 border border-[#1e2d40] p-4 mb-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-xl shrink-0">
            {icon}
          </div>
          <div className="min-w-0">
            <p className="text-base font-semibold text-white truncate">{label}</p>
            <p className="text-xs text-slate-500">This month</p>
          </div>
        </div>

        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-2xl font-bold text-white tabular-nums truncate">
              {fmt(spent, currency)}
            </p>
            {hasBudget ? (
              <p className="mt-1 text-xs text-slate-500 truncate">
                of {fmt(budget, currency)} ·{' '}
                <span className={over ? 'text-red-400' : 'text-slate-400'}>
                  {over
                    ? `${fmt(Math.abs(remaining), currency)} over`
                    : `${fmt(remaining, currency)} left`}
                </span>
              </p>
            ) : (
              <p className="mt-1 text-xs text-slate-600">No budget set</p>
            )}
          </div>

          {hasBudget && (
            <HalfCircleProgress
              value={spent}
              max={budget}
              color={paceColor(pct)}
              className="w-[104px]"
            />
          )}
        </div>
      </div>

      {/* ── Transactions ── */}
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
          Transactions
        </p>
        {count > 0 && (
          <p className="text-[11px] text-slate-600 tabular-nums shrink-0">
            {count} · {fmt(allTimeTotal, currency)} all time
          </p>
        )}
      </div>

      {groups.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-8 text-center">
          {metered ? (
            <p className="text-sm text-slate-500">
              Electric is metered from your appliances, so it has no logged expenses.
            </p>
          ) : (
            <>
              <p className="text-sm text-slate-500 mb-1">Nothing logged here yet.</p>
              <Link
                href="/expenses/new"
                className="text-xs text-blue-400 underline underline-offset-2"
              >
                Log an expense
              </Link>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-5">
          {groups.map(g => (
            <div key={g.key}>
              <div className="flex items-center justify-between gap-3 mb-2 px-1">
                <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                  {monthLabelOf(g.key)}
                </p>
                <p className="text-xs font-medium text-red-400 tabular-nums shrink-0">
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
                      className="flex items-center gap-3 rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{e.note || label}</p>
                        <p className="text-xs text-slate-500 truncate">
                          {[day, wallet].filter(Boolean).join(' · ')}
                        </p>
                      </div>
                      <p className="text-sm font-medium text-red-400 tabular-nums shrink-0">
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
