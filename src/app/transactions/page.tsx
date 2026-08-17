'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useApp, fmt, Category, INCOME_SOURCES } from '@/components/AppContext';
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

// One row in the unified activity feed. Expenses and money moves are different
// tables, so they get normalised into this shape before display.
//   spent — expenses, and withdrawals from before they landed in cash
//   earned — wallet top-ups
//   moved — transfers and withdrawals. Net-zero, so excluded from both totals.
type Flow = 'spent' | 'earned' | 'moved';

interface FeedItem {
  id: string; date: string; flow: Flow;
  icon: string; label: string; sub: string; amount: number;
}

export default function TransactionsPage() {
  const { expenses, moneyMoves, wallets, settings, debtEntries, debtPeople } = useApp();
  const { currency } = settings;

  const today = new Date();
  const [viewMonth, setViewMonth] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const y = viewMonth.getFullYear();
  const m = viewMonth.getMonth();
  const monthLabel = viewMonth.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  const walletName = (id: string | null) => wallets.find(w => w.id === id)?.name ?? '';

  // A wallet-less expense was paid by someone else; name them where the wallet
  // name would otherwise go, so the subtitle is never blank.
  const fundedBy = (e: { id: string; walletId: string | null }) => {
    if (e.walletId) return walletName(e.walletId);
    const link = debtEntries.find(d => d.expenseId === e.id);
    const person = link && debtPeople.find(p => p.id === link.personId);
    return person ? `paid by ${person.name}` : '';
  };

  // Resolve a category key (built-in or user-defined) to its icon + label.
  const catMeta = (key: string): { icon: string; label: string } => {
    const custom = settings.customCategories.find(c => c.key === key);
    if (custom) return { icon: custom.icon, label: custom.label };
    return { icon: CATEGORY_ICONS[key] ?? '✦', label: key };
  };

  // Join a note and a wallet name into the one-line subtitle, skipping blanks.
  const subtitle = (note: string, wallet: string) => [note, wallet].filter(Boolean).join(' · ');

  // Everything in the displayed month, normalised and bucketed by day.
  const { monthItems, totals, monthSpent, monthEarned } = useMemo(() => {
    const inMonth = (iso: string) => {
      const d = new Date(iso);
      return d.getFullYear() === y && d.getMonth() === m;
    };

    const items: FeedItem[] = [
      ...expenses.filter(e => inMonth(e.date)).map((e): FeedItem => ({
        id: e.id, date: e.date, flow: 'spent',
        icon: catMeta(e.category).icon,
        label: catMeta(e.category).label,
        sub: subtitle(e.note, fundedBy(e)),
        amount: e.amount,
      })),
      ...moneyMoves.filter(mm => inMonth(mm.date)).map((mm): FeedItem => {
        if (mm.kind === 'earned') {
          const src = INCOME_SOURCES.find(s => s.key === mm.source);
          return {
            id: mm.id, date: mm.date, flow: 'earned',
            icon: src?.icon ?? '✦', label: src?.label ?? 'Income',
            sub: subtitle(mm.note, walletName(mm.walletId)),
            amount: mm.amount,
          };
        }
        if (mm.kind === 'withdrawn') {
          // A withdrawal now lands in the cash wallet, so it is net-zero like a
          // transfer and shows both ends. Rows written before that carry no
          // destination: for them the money really did leave, and they stay spent.
          if (mm.toWalletId) {
            return {
              id: mm.id, date: mm.date, flow: 'moved',
              icon: '🏧', label: 'Withdrawal',
              sub: subtitle(mm.note, `${walletName(mm.walletId)} → ${walletName(mm.toWalletId)}`),
              amount: mm.amount,
            };
          }
          return {
            id: mm.id, date: mm.date, flow: 'spent',
            icon: '🏧', label: 'Withdrawal',
            sub: subtitle(mm.note, walletName(mm.walletId)),
            amount: mm.amount,
          };
        }
        if (mm.kind === 'debt_out' || mm.kind === 'debt_in') {
          // flow 'moved' keeps these out of both month totals: lending is not
          // consumption and a repayment is not income. The note carries the
          // specifics ("Spotted Marco", "Marco settled up").
          return {
            id: mm.id, date: mm.date, flow: 'moved',
            icon: '🤝', label: 'Debt',
            sub: subtitle(mm.note, walletName(mm.walletId)),
            amount: mm.amount,
          };
        }
        return {
          id: mm.id, date: mm.date, flow: 'moved',
          icon: '🔄', label: 'Transfer',
          sub: subtitle(mm.note, `${walletName(mm.walletId)} → ${walletName(mm.toWalletId ?? '')}`),
          amount: mm.amount,
        };
      }),
    ];

    // Per-day spent/earned. Transfers move money between your own wallets, so
    // counting them either way would misreport the month.
    const totals: Record<string, { spent: number; earned: number }> = {};
    for (const it of items) {
      if (it.flow === 'moved') continue;
      const k = dayKey(new Date(it.date));
      (totals[k] ??= { spent: 0, earned: 0 })[it.flow] += it.amount;
    }

    return {
      monthItems: items,
      totals,
      monthSpent:  items.filter(i => i.flow === 'spent').reduce((s, i) => s + i.amount, 0),
      monthEarned: items.filter(i => i.flow === 'earned').reduce((s, i) => s + i.amount, 0),
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses, moneyMoves, wallets, settings.customCategories, debtEntries, debtPeople, y, m]);

  // Calendar cells: leading blanks then each day of the month.
  const cells = useMemo(() => {
    const firstWeekday = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const arr: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) arr.push(d);
    return arr;
  }, [y, m]);

  // Grouped by day (newest first), filtered to the selected date if any.
  const groups = useMemo(() => {
    const source = selectedKey
      ? monthItems.filter(i => dayKey(new Date(i.date)) === selectedKey)
      : monthItems;
    const byDay: Record<string, FeedItem[]> = {};
    for (const it of source) {
      (byDay[dayKey(new Date(it.date))] ??= []).push(it);
    }
    return Object.keys(byDay)
      .sort((a, b) => b.localeCompare(a))
      .map(k => ({
        key: k,
        spent:  byDay[k].filter(i => i.flow === 'spent').reduce((s, i) => s + i.amount, 0),
        earned: byDay[k].filter(i => i.flow === 'earned').reduce((s, i) => s + i.amount, 0),
        items: byDay[k].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
      }));
  }, [monthItems, selectedKey]);

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
                <p className="text-[11px] text-slate-500">
                  <span className="text-emerald-400">+{fmt(monthEarned, currency)}</span>
                  {' · '}
                  <span className="text-red-400">-{fmt(monthSpent, currency)}</span>
                </p>
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
                const t = totals[key];
                const active = Boolean(t && (t.spent > 0 || t.earned > 0));
                const isToday = key === todayKey;
                const isSelected = key === selectedKey;
                return (
                  <button
                    key={key}
                    onClick={() => active && toggleDay(key)}
                    className={`flex flex-col items-center justify-start rounded-lg py-1.5 min-h-[54px] transition-colors ${
                      isSelected ? 'bg-blue-600/25 border border-blue-500'
                      : active ? 'bg-white/5 border border-transparent hover:bg-white/10'
                      : 'border border-transparent'
                    }`}
                  >
                    <span className={`text-xs leading-none ${
                      isToday ? 'font-bold text-blue-400' : active ? 'text-white' : 'text-slate-600'
                    }`}>
                      {d}
                    </span>
                    {t && t.earned > 0 ? (
                      <span className="mt-1 text-[9px] font-medium leading-none text-emerald-400">
                        +{abbrev(t.earned)}
                      </span>
                    ) : null}
                    {t && t.spent > 0 ? (
                      <span className="mt-0.5 text-[9px] font-medium leading-none text-red-400">
                        -{abbrev(t.spent)}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Grouped activity list ── */}
          {selectedKey && (
            <button onClick={() => setSelectedKey(null)}
              className="mb-3 text-xs text-blue-400 hover:text-blue-300">
              ← Showing one day · view whole month
            </button>
          )}

          {groups.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-10 text-center">
              <ReceiptIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
              <p className="text-sm text-slate-500 mb-1">No activity this month.</p>
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
                      <p className="text-xs font-medium">
                        {g.earned > 0 && (
                          <span className="text-emerald-400">+{fmt(g.earned, currency)}</span>
                        )}
                        {g.earned > 0 && g.spent > 0 && <span className="text-slate-600"> · </span>}
                        {g.spent > 0 && (
                          <span className="text-red-400">-{fmt(g.spent, currency)}</span>
                        )}
                      </p>
                    </div>
                    <div className="space-y-2">
                      {g.items.map(it => (
                        <div key={it.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3">
                          <div className="text-base shrink-0">{it.icon}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-white capitalize">{it.label}</p>
                            <p className="text-xs text-slate-500 truncate">{it.sub}</p>
                          </div>
                          <p className={`text-sm font-medium shrink-0 ${
                            it.flow === 'earned' ? 'text-emerald-400'
                            : it.flow === 'moved' ? 'text-slate-400'
                            : 'text-red-400'
                          }`}>
                            {it.flow === 'earned' ? '+' : it.flow === 'moved' ? '' : '-'}
                            {fmt(it.amount, currency)}
                          </p>
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
