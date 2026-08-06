'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp, fmt, Category } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon, ReceiptIcon } from '@/components/Icons';

const CATEGORY_ICONS: Record<Category, string> = {
  food: '🍜', transport: '🚗', bills: '💡', shopping: '🛍️', health: '💊', other: '✦',
};

const WEEKDAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

// Local Y-M-D key so grouping matches how the rest of the app buckets by calendar day.
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Compact amount for the tight calendar cells (e.g. 1234 → "1.2k").
function abbrev(n: number): string {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(Math.round(n));
}

export default function TransactionsPage() {
  const { expenses, wallets, settings } = useApp();
  const { currency } = settings;

  const today = new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const walletName = (id: string) => wallets.find(w => w.id === id)?.name ?? '';

  // Resolve a category key (built-in or user-defined) to its icon + label.
  const catMeta = (key: string): { icon: string; label: string } => {
    const custom = settings.customCategories.find(c => c.key === key);
    if (custom) return { icon: custom.icon, label: custom.label };
    return { icon: CATEGORY_ICONS[key] ?? '✦', label: key };
  };

  // Expenses within the displayed month, plus per-day totals.
  const { monthExpenses, totals, monthTotal } = useMemo(() => {
    const inMonth = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getFullYear() === y && d.getMonth() === m;
    });
    const totals: Record<string, number> = {};
    for (const e of inMonth) {
      const k = dayKey(new Date(e.date));
      totals[k] = (totals[k] ?? 0) + e.amount;
    }
    const monthTotal = inMonth.reduce((s, e) => s + e.amount, 0);
    return { monthExpenses: inMonth, totals, monthTotal };
  }, [expenses, y, m]);

  // Calendar cells: leading blanks then each day of the month.
  const cells = useMemo(() => {
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const arr: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [y, m]);

  // Transactions grouped by day (newest first), filtered to the selected date if any.
  const groups = useMemo(() => {
    const source = selectedKey
      ? monthExpenses.filter(e => dayKey(new Date(e.date)) === selectedKey)
      : monthExpenses;
    const byDay: Record<string, typeof source> = {};
    for (const e of source) {
      const k = dayKey(new Date(e.date));
      (byDay[k] ??= []).push(e);
    }
    return Object.keys(byDay)
      .sort((a, b) => b.localeCompare(a))
      .map(k => ({
        key: k,
        total: byDay[k].reduce((s, e) => s + e.amount, 0),
        items: byDay[k].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      }));
  }, [monthExpenses, selectedKey]);

  const todayKey = dayKey(today);

  const changeMonth = (delta: number) => {
    setSelectedKey(null);
    setViewMonth(new Date(y, m + delta, 1));
  };

  const toggleDay = (key: string) => setSelectedKey(prev => (prev === key ? null : key));

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-2xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Transactions"
            right={
              <Link href="/expenses/new" className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors">
                <PlusIcon className="w-4 h-4 text-white" />
              </Link>
            }
          />

          {/* ── Calendar ── */}
          <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <button onClick={() => changeMonth(-1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">
                <ChevronLeftIcon className="w-4 h-4" />
              </button>
              <div className="text-center">
                <p className="text-sm font-semibold text-white">{monthLabel}</p>
                <p className="text-[11px] text-slate-500">Spent {fmt(monthTotal, currency)}</p>
              </div>
              <button onClick={() => changeMonth(1)}
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/5 text-slate-300 hover:bg-white/10 transition-colors">
                <ChevronRightIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {WEEKDAYS.map((w, i) => (
                <div key={i} className="text-center text-[10px] font-medium text-slate-600 py-1">{w}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {cells.map((d, i) => {
                if (d === null) return <div key={`b${i}`} />;
                const key = dayKey(new Date(y, m, d));
                const spent = totals[key];
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    onClick={() => spent && toggleDay(key)}
                    className={`flex flex-col items-center justify-start rounded-lg py-1.5 min-h-[46px] transition-colors ${
                      isSelected ? 'bg-blue-600/25 border border-blue-500'
                      : spent ? 'bg-white/5 border border-transparent hover:bg-white/10'
                      : 'border border-transparent'
                    }`}
                  >
                    <span className={`text-xs leading-none ${
                      isToday ? 'font-bold text-blue-400' : spent ? 'text-white' : 'text-slate-600'
                    }`}>
                      {d}
                    </span>
                    {spent ? (
                      <span className="mt-1 text-[9px] font-medium leading-none text-red-400">
                        {abbrev(spent)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Grouped transaction list ── */}
          {selectedKey && (
            <button onClick={() => setSelectedKey(null)}
              className="mb-3 text-xs text-blue-400 hover:text-blue-300">
              ← Showing one day · view whole month
            </button>
          )}

          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-10 text-center">
              <ReceiptIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-1">No transactions this month.</p>
              <Link href="/expenses/new" className="text-xs text-blue-400 underline underline-offset-2">
                Log an expense
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              {groups.map(g => {
                const d = new Date(`${g.key}T00:00:00`);
                const label = d.toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
                return (
                  <div key={g.key}>
                    <div className="flex items-center justify-between mb-2 px-1">
                      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">
                        {g.key === todayKey ? 'Today' : label}
                      </p>
                      <p className="text-xs font-medium text-red-400">-{fmt(g.total, currency)}</p>
                    </div>
                    <div className="space-y-2">
                      {g.items.map(e => (
                        <div key={e.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3">
                          <div className="text-base shrink-0">{catMeta(e.category).icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white capitalize">{catMeta(e.category).label}</p>
                            <p className="text-xs text-slate-500 truncate">
                              {e.note ? e.note : walletName(e.walletId)}
                              {e.note && walletName(e.walletId) ? ` · ${walletName(e.walletId)}` : ''}
                            </p>
                          </div>
                          <p className="text-sm font-medium text-red-400 shrink-0">-{fmt(e.amount, currency)}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
