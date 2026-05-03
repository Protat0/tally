'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import {
  useApp, fmt, Category, BudgetLine, BudgetType, Bill, ShopeePayment, currentYYYYMM,
} from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import ProgressBar from '@/components/ProgressBar';
import {
  PlusIcon, TrashIcon, PencilIcon, CheckIcon, XIcon,
  AlertIcon, ReceiptIcon, BagIcon, ShieldIcon,
} from '@/components/Icons';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function paceColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 80) return 'green';
  if (pct <= 100) return 'amber';
  return 'red';
}

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1)
    .toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

const STATUS_STYLE: Record<ShopeePayment['status'], string> = {
  paid:     'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  pending:  'bg-amber-500/15   text-amber-400   border-amber-500/20',
  upcoming: 'bg-slate-500/15   text-slate-400   border-slate-700',
};

const TYPE_LABELS: Record<BudgetType, string> = {
  needs: 'Needs', wants: 'Wants', savings: 'Savings',
};
const TYPE_COLOR: Record<BudgetType, string> = {
  needs:   'bg-blue-500/15   text-blue-400   border-blue-500/30',
  wants:   'bg-purple-500/15 text-purple-400 border-purple-500/30',
  savings: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

const CATEGORY_ICONS: Record<Category, string> = {
  food: '🍜', transport: '🚗', bills: '💡', shopping: '🛍️', health: '💊', other: '✦',
};

const ICON_OPTIONS = ['🍜','💧','🚗','💡','🛍️','💊','✨','🎮','📚','☕','🏠','📱','💰','🎯','🌱'];

// ─── small components ─────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">{title}</p>
      {action}
    </div>
  );
}

function InlineAmountInput({
  label, value, onChange, placeholder = '0.00',
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <input
        type="number"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
      />
    </div>
  );
}

// ─── main page ────────────────────────────────────────────────────────────────

export default function BudgetPage() {
  const {
    settings, expenses, updateSettings,
    addBudgetLine, updateBudgetLine, deleteBudgetLine,
    shopeeSchedule, shopeeRemainingBalance, shopeeDebtFreeDate,
    shopeeNewPurchaseLock, setShopeeNewPurchaseLock,
    addShopeePayment, updateShopeePayment, deleteShopeePayment,
    emergencyFund, addEmergencyFundEntry,
    toggleBillPaid,
  } = useApp();

  const { currency, bills, budgetLines, monthlyIncome, monthlySavingsTarget } = settings;
  const now = new Date();
  const monthLabel = now.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });

  // ── this-month spend per expense category ──
  const spentByCategory = useMemo(() => {
    const acc: Partial<Record<Category, number>> = {};
    expenses.forEach(e => {
      const d = new Date(e.date);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()) {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      }
    });
    return acc;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expenses]);

  // ── budget totals ──
  const totalBills    = bills.reduce((s, b) => s + b.amount, 0);
  const nextShopee    = [...shopeeSchedule]
    .filter(p => p.status !== 'paid')
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  const shopeeMonthly = nextShopee?.amount ?? 0;
  const totalBudgetLines = budgetLines.reduce((s, b) => s + b.monthlyLimit, 0);
  const totalAllocated   = totalBills + shopeeMonthly + totalBudgetLines + monthlySavingsTarget;
  const unallocated      = monthlyIncome - totalAllocated;
  const allocatedPct     = monthlyIncome > 0 ? (totalAllocated / monthlyIncome) * 100 : 0;

  // ── needs / wants / savings breakdown ──
  const needsAmt    = totalBills + shopeeMonthly + budgetLines.filter(b => b.type === 'needs').reduce((s, b) => s + b.monthlyLimit, 0);
  const wantsAmt    = budgetLines.filter(b => b.type === 'wants').reduce((s, b) => s + b.monthlyLimit, 0);
  const savingsAmt  = budgetLines.filter(b => b.type === 'savings').reduce((s, b) => s + b.monthlyLimit, 0) + monthlySavingsTarget;
  const breakdownTotal = needsAmt + wantsAmt + savingsAmt;

  // ── budget-line edit sheet ──
  const [editLine, setEditLine]   = useState<BudgetLine | null>(null);
  const [editLimit, setEditLimit] = useState('');
  const [editType, setEditType]   = useState<BudgetType>('needs');

  // ── add budget-line sheet ──
  const [addLineOpen, setAddLineOpen]   = useState(false);
  const [newLineName, setNewLineName]   = useState('');
  const [newLineIcon, setNewLineIcon]   = useState('🎯');
  const [newLineLimit, setNewLineLimit] = useState('');
  const [newLineType, setNewLineType]   = useState<BudgetType>('wants');

  // ── bill inline form ──
  const [addBillOpen, setAddBillOpen] = useState(false);
  const [newBillName, setNewBillName] = useState('');
  const [newBillAmt,  setNewBillAmt]  = useState('');

  // ── shopee inline form ──
  const [addShopeeOpen,  setAddShopeeOpen]  = useState(false);
  const [newShopeeMo,    setNewShopeeMo]    = useState('');          // '1'–'12'
  const [newShopeeYr,    setNewShopeeYr]    = useState('');          // e.g. '2025'
  const [newShopeeAmt,   setNewShopeeAmt]   = useState('');
  const [shopeeExpanded, setShopeeExpanded] = useState(false);

  const newShopeeMonth = newShopeeYr && newShopeeMo
    ? `${newShopeeYr}-${newShopeeMo.padStart(2, '0')}`
    : '';

  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const thisYear = new Date().getFullYear();
  const YEARS = [thisYear, thisYear + 1, thisYear + 2];

  // ── emergency fund ──
  const [addEFOpen,  setAddEFOpen]  = useState(false);
  const [efAmount,   setEFAmount]   = useState('');
  const [efNote,     setEFNote]     = useState('');
  const [showAllEF,  setShowAllEF]  = useState(false);

  const efTarget  = settings.emergencyFundTarget;
  const efCurrent = emergencyFund.currentAmount;
  const efPct     = efTarget > 0 ? Math.min((efCurrent / efTarget) * 100, 100) : 0;
  const efEntries = emergencyFund.entries;

  const efProjected = (() => {
    if (efTarget <= 0 || efCurrent >= efTarget) return null;
    const recent = efEntries.slice(0, 6);
    if (recent.length === 0) return null;
    const avg = recent.reduce((s, e) => s + e.amount, 0) / recent.length;
    if (avg <= 0) return null;
    const months = Math.ceil((efTarget - efCurrent) / avg);
    const d = new Date();
    d.setMonth(d.getMonth() + months);
    return d.toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
  })();

  const efMilestones = efTarget > 0
    ? [0.25, 0.5, 0.75, 1].map(f => ({ pct: f, amt: efTarget * f, reached: efCurrent >= efTarget * f }))
    : [];

  // ── recent expenses toggle ──
  const [showAllExpenses, setShowAllExpenses] = useState(false);

  // ── handlers ──
  const openEdit = (line: BudgetLine) => {
    setEditLine(line);
    setEditLimit(line.monthlyLimit > 0 ? String(line.monthlyLimit) : '');
    setEditType(line.type);
  };

  const saveEdit = () => {
    if (!editLine) return;
    updateBudgetLine(editLine.id, {
      monthlyLimit: parseFloat(editLimit) || 0,
      type: editType,
    });
    setEditLine(null);
  };

  const handleAddLine = () => {
    if (!newLineName.trim()) return;
    addBudgetLine({
      name: newLineName.trim(), icon: newLineIcon,
      monthlyLimit: parseFloat(newLineLimit) || 0,
      type: newLineType,
    });
    setAddLineOpen(false);
    setNewLineName(''); setNewLineLimit(''); setNewLineIcon('🎯'); setNewLineType('wants');
  };

  const handleAddBill = () => {
    if (!newBillName.trim() || !newBillAmt) return;
    const bill: Bill = { id: uid(), name: newBillName.trim(), amount: parseFloat(newBillAmt), paidMonths: [] };
    updateSettings({ bills: [...bills, bill] });
    setAddBillOpen(false);
    setNewBillName(''); setNewBillAmt('');
  };

  const removeBill = (id: string) =>
    updateSettings({ bills: bills.filter(b => b.id !== id) });

  const handleAddEF = () => {
    const amt = parseFloat(efAmount);
    if (isNaN(amt) || amt <= 0) return;
    addEmergencyFundEntry({ amount: amt, note: efNote.trim() });
    setAddEFOpen(false); setEFAmount(''); setEFNote('');
  };

  const handleAddShopee = () => {
    if (!newShopeeMonth || !newShopeeAmt) return;
    addShopeePayment({ month: newShopeeMonth, amount: parseFloat(newShopeeAmt), status: 'upcoming' });
    setAddShopeeOpen(false);
    setNewShopeeMo(''); setNewShopeeYr(''); setNewShopeeAmt('');
  };

  const sortedShopee = [...shopeeSchedule].sort((a, b) => a.month.localeCompare(b.month));
  const visibleShopee = shopeeExpanded ? sortedShopee : sortedShopee.filter(p => p.status !== 'paid').slice(0, 3);

  const recentExpenses = [...expenses]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, showAllExpenses ? 50 : 8);

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          {/* ── Header ── */}
          <header className="flex items-center justify-between pt-14 pb-5 md:pt-10 md:pb-6">
            <div>
              <p className="text-xs text-slate-500 uppercase tracking-widest">Monthly Budget</p>
              <p className="text-2xl font-bold text-white mt-0.5">{monthLabel}</p>
            </div>
            <Link
              href="/expenses/new"
              className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Log Expense</span>
            </Link>
          </header>

          <div className="md:grid md:grid-cols-2 md:gap-6">

            {/* ══ LEFT COLUMN ══════════════════════════════════════════════ */}
            <div className="space-y-6">

              {/* ── Budget Health ── */}
              <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
                {monthlyIncome === 0 ? (
                  <div className="text-center py-2">
                    <p className="text-sm text-slate-400 mb-2">Set your monthly income to start budgeting.</p>
                    <Link href="/settings" className="text-sm text-blue-400 underline underline-offset-2">Go to Settings →</Link>
                  </div>
                ) : (
                  <>
                    <div className="flex items-end justify-between mb-3">
                      <div>
                        <p className="text-xs text-slate-500 mb-0.5">Allocated</p>
                        <p className="text-2xl font-bold text-white">{fmt(totalAllocated, currency)}</p>
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
                      value={totalAllocated}
                      max={monthlyIncome}
                      color={allocatedPct <= 80 ? 'green' : allocatedPct <= 100 ? 'amber' : 'red'}
                    />
                    <p className="mt-2 text-xs text-slate-500">
                      {allocatedPct.toFixed(0)}% of {fmt(monthlyIncome, currency)} income
                    </p>
                  </>
                )}
              </div>

              {/* ── Recurring Bills ── */}
              <div>
                <SectionHeader
                  title={`Recurring Bills · ${fmt(totalBills, currency)}/mo`}
                  action={
                    <button onClick={() => setAddBillOpen(v => !v)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <PlusIcon className="w-3.5 h-3.5" /> Add
                    </button>
                  }
                />
                <div className="space-y-2">
                  {bills.length === 0 && !addBillOpen && (
                    <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-5 text-center">
                      <p className="text-sm text-slate-500">No recurring bills yet.</p>
                    </div>
                  )}
                  {bills.map(b => {
                    const isPaid = b.paidMonths.includes(currentYYYYMM());
                    return (
                      <div key={b.id} className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors ${isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-[#111827] border-[#1e2d40]'}`}>
                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/15 text-sm shrink-0">💡</div>
                        <p className={`flex-1 text-sm min-w-0 truncate ${isPaid ? 'text-slate-500' : 'text-white'}`}>{b.name}</p>
                        <p className="text-sm font-medium text-slate-300 shrink-0">{fmt(b.amount, currency)}</p>
                        {isPaid && (
                          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/15 rounded-full px-2 py-0.5 shrink-0">
                            Paid
                          </span>
                        )}
                        <button
                          onClick={() => toggleBillPaid(b.id)}
                          title={isPaid ? 'Mark unpaid' : 'Mark as paid'}
                          className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0 ${isPaid ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10'}`}
                        >
                          <CheckIcon className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => removeBill(b.id)}
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                          <TrashIcon className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
                        </button>
                      </div>
                    );
                  })}
                  {addBillOpen && (
                    <div className="rounded-xl bg-[#1a2332] border border-blue-500/30 p-4 space-y-3">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newBillName}
                          onChange={e => setNewBillName(e.target.value)}
                          placeholder="Bill name"
                          autoFocus
                          className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        />
                        <input
                          type="number"
                          value={newBillAmt}
                          onChange={e => setNewBillAmt(e.target.value)}
                          placeholder="Amount"
                          className="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddBill} disabled={!newBillName.trim() || !newBillAmt}
                          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                          Save
                        </button>
                        <button onClick={() => { setAddBillOpen(false); setNewBillName(''); setNewBillAmt(''); }}
                          className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Shopee Pay Later ── */}
              <div>
                <SectionHeader
                  title={shopeeRemainingBalance > 0
                    ? `Shopee Pay Later · ${fmt(shopeeRemainingBalance, currency)} left`
                    : 'Shopee Pay Later'}
                  action={
                    <button onClick={() => setAddShopeeOpen(v => !v)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <PlusIcon className="w-3.5 h-3.5" /> Add
                    </button>
                  }
                />

                {/* New purchase lock warning */}
                {shopeeNewPurchaseLock && (
                  <div className="mb-2 flex items-start gap-2 rounded-xl bg-red-500/10 border border-red-500/20 px-3 py-2.5">
                    <AlertIcon className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <p className="flex-1 text-xs text-red-400">New purchase lock active — clear balance first.</p>
                    <button onClick={() => setShopeeNewPurchaseLock(false)}
                      className="text-xs text-red-400/60 hover:text-red-400 shrink-0">
                      Dismiss
                    </button>
                  </div>
                )}

                {/* Summary strip — only if there's data */}
                {shopeeSchedule.length > 0 && (
                  <div className="mb-2 flex items-center justify-between rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/15 text-base shrink-0">🛍️</div>
                      <div>
                        <p className="text-sm font-medium text-white">
                          {nextShopee ? `${fmt(nextShopee.amount, currency)} due ${formatMonth(nextShopee.month)}` : 'All paid'}
                        </p>
                        {shopeeDebtFreeDate && (
                          <p className="text-xs text-slate-500">Debt-free by {formatMonth(shopeeDebtFreeDate)}</p>
                        )}
                      </div>
                    </div>
                    {/* lock toggle */}
                    <button
                      onClick={() => setShopeeNewPurchaseLock(!shopeeNewPurchaseLock)}
                      title={shopeeNewPurchaseLock ? 'Lock active' : 'Enable lock'}
                      className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs transition-colors ${
                        shopeeNewPurchaseLock
                          ? 'border-red-500/40 bg-red-500/15 text-red-400'
                          : 'border-[#1e2d40] bg-white/5 text-slate-500 hover:border-slate-500'
                      }`}
                    >
                      🔒
                    </button>
                  </div>
                )}

                {/* Instalment rows */}
                <div className="space-y-2">
                  {shopeeSchedule.length === 0 && !addShopeeOpen && (
                    <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-5 text-center">
                      <BagIcon className="w-6 h-6 text-slate-700 mx-auto mb-1" />
                      <p className="text-sm text-slate-500">No instalments added yet.</p>
                    </div>
                  )}

                  {visibleShopee.map(p => (
                    <div key={p.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-white">{formatMonth(p.month)}</p>
                        <p className="text-xs text-slate-500">{fmt(p.amount, currency)}</p>
                      </div>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium capitalize shrink-0 ${STATUS_STYLE[p.status]}`}>
                        {p.status}
                      </span>
                      {p.status !== 'paid' && (
                        <button
                          onClick={() => updateShopeePayment(p.id, { status: 'paid' })}
                          className="flex h-7 w-7 items-center justify-center rounded-full bg-emerald-500/10 hover:bg-emerald-500/20 transition-colors shrink-0">
                          <CheckIcon className="w-3.5 h-3.5 text-emerald-400" />
                        </button>
                      )}
                      <button onClick={() => deleteShopeePayment(p.id)}
                        className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                        <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
                      </button>
                    </div>
                  ))}

                  {/* Show more/less */}
                  {sortedShopee.length > 3 && (
                    <button onClick={() => setShopeeExpanded(v => !v)}
                      className="w-full py-1.5 text-xs text-slate-500 hover:text-slate-300 transition-colors">
                      {shopeeExpanded
                        ? 'Show less'
                        : `Show all ${sortedShopee.length} instalments`}
                    </button>
                  )}

                  {/* Add instalment inline */}
                  {addShopeeOpen && (
                    <div className="rounded-xl bg-[#1a2332] border border-blue-500/30 p-4 space-y-3">
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">Month &amp; Year</p>
                          <div className="flex gap-1.5">
                            <select
                              value={newShopeeMo}
                              onChange={e => setNewShopeeMo(e.target.value)}
                              autoFocus
                              className="flex-1 rounded-lg bg-[#0b0f1a] border border-[#1e2d40] px-2 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                            >
                              <option value="">Month</option>
                              {MONTHS.map((m, i) => (
                                <option key={i} value={String(i + 1)}>{m}</option>
                              ))}
                            </select>
                            <select
                              value={newShopeeYr}
                              onChange={e => setNewShopeeYr(e.target.value)}
                              className="w-20 rounded-lg bg-[#0b0f1a] border border-[#1e2d40] px-2 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                            >
                              <option value="">Year</option>
                              {YEARS.map(y => (
                                <option key={y} value={String(y)}>{y}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex-1">
                          <p className="text-xs text-slate-500 mb-1">Amount</p>
                          <input
                            type="number"
                            value={newShopeeAmt}
                            onChange={e => setNewShopeeAmt(e.target.value)}
                            placeholder="0.00"
                            className="w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={handleAddShopee} disabled={!newShopeeMonth || !newShopeeAmt}
                          className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                          Save
                        </button>
                        <button onClick={() => { setAddShopeeOpen(false); setNewShopeeMo(''); setNewShopeeYr(''); setNewShopeeAmt(''); }}
                          className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Savings Target ── */}
              <div>
                <SectionHeader title="Savings Target" />
                <div className="rounded-xl bg-[#111827] border border-[#1e2d40] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/15 text-lg shrink-0">🌱</div>
                      <div>
                        <p className="text-sm font-medium text-white">Monthly Savings</p>
                        <p className="text-xs text-slate-500">Amount to set aside each month</p>
                      </div>
                    </div>
                    <input
                      type="number"
                      value={monthlySavingsTarget || ''}
                      onChange={e => updateSettings({ monthlySavingsTarget: parseFloat(e.target.value) || 0 })}
                      placeholder="0.00"
                      className="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-right text-sm text-white outline-none focus:border-emerald-500/50"
                    />
                  </div>
                </div>
              </div>

              {/* ── Emergency Fund ── */}
              <div>
                <SectionHeader
                  title={efTarget > 0 ? `Emergency Fund · ${efPct.toFixed(0)}%` : 'Emergency Fund'}
                  action={
                    efTarget > 0 ? (
                      <button
                        onClick={() => setAddEFOpen(v => !v)}
                        className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300"
                      >
                        <PlusIcon className="w-3.5 h-3.5" /> Add
                      </button>
                    ) : null
                  }
                />

                {efTarget === 0 ? (
                  <div className="rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-5 text-center">
                    <ShieldIcon className="w-6 h-6 text-slate-600 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 mb-2">No target set yet.</p>
                    <Link href="/settings" className="text-xs text-blue-400 underline underline-offset-2">
                      Set a goal in Settings →
                    </Link>
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#111827] border border-[#1e2d40] p-4 space-y-3">
                    {/* Amount + bar */}
                    <div>
                      <div className="flex items-end justify-between mb-2">
                        <p className="text-xl font-bold text-white">{fmt(efCurrent, currency)}</p>
                        <p className="text-xs text-slate-500">of {fmt(efTarget, currency)}</p>
                      </div>
                      <ProgressBar value={efCurrent} max={efTarget} color="green" />
                      {efProjected && (
                        <p className="mt-1.5 text-xs text-emerald-400">Projected full by {efProjected}</p>
                      )}
                    </div>

                    {/* Milestones */}
                    <div className="flex items-center gap-1.5">
                      {efMilestones.map((m, i) => (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <div className={`h-2 w-2 rounded-full ${m.reached ? 'bg-emerald-500' : 'bg-[#1e2d40]'}`} />
                          <p className={`text-[10px] ${m.reached ? 'text-emerald-400' : 'text-slate-600'}`}>
                            {Math.round(m.pct * 100)}%
                          </p>
                        </div>
                      ))}
                    </div>

                    {/* Inline add form */}
                    {addEFOpen && (
                      <div className="space-y-2 pt-1 border-t border-[#1e2d40]">
                        <div className="flex gap-2">
                          <input
                            type="number"
                            value={efAmount}
                            onChange={e => setEFAmount(e.target.value)}
                            placeholder="Amount"
                            autoFocus
                            className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                          />
                          <input
                            type="text"
                            value={efNote}
                            onChange={e => setEFNote(e.target.value)}
                            placeholder="Note (optional)"
                            className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-emerald-500/50"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={handleAddEF}
                            disabled={!efAmount || parseFloat(efAmount) <= 0}
                            className="flex-1 rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white disabled:opacity-40"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setAddEFOpen(false); setEFAmount(''); setEFNote(''); }}
                            className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Contribution log */}
                    {efEntries.length > 0 && (
                      <div className="space-y-1.5 pt-1 border-t border-[#1e2d40]">
                        {(showAllEF ? efEntries : efEntries.slice(0, 3)).map(e => (
                          <div key={e.id} className="flex items-center justify-between">
                            <div>
                              <p className="text-xs text-slate-400">
                                {new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                                {e.note ? ` · ${e.note}` : ''}
                              </p>
                            </div>
                            <p className="text-xs font-medium text-emerald-400">+{fmt(e.amount, currency)}</p>
                          </div>
                        ))}
                        {efEntries.length > 3 && (
                          <button
                            onClick={() => setShowAllEF(v => !v)}
                            className="w-full pt-0.5 text-xs text-slate-600 hover:text-slate-400 transition-colors"
                          >
                            {showAllEF ? 'Show less' : `Show all ${efEntries.length} contributions`}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

            </div>{/* end left col */}

            {/* ══ RIGHT COLUMN ═════════════════════════════════════════════ */}
            <div className="space-y-6 mt-6 md:mt-0">

              {/* ── Variable Budget Lines ── */}
              <div>
                <SectionHeader
                  title="Budget Categories"
                  action={
                    <button onClick={() => setAddLineOpen(true)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <PlusIcon className="w-3.5 h-3.5" /> Add
                    </button>
                  }
                />
                <div className="space-y-2">
                  {budgetLines.map(line => {
                    const spent = line.expenseCategory ? (spentByCategory[line.expenseCategory] ?? 0) : 0;
                    const hasLimit = line.monthlyLimit > 0;
                    const pct = hasLimit ? (spent / line.monthlyLimit) * 100 : 0;
                    const remaining = line.monthlyLimit - spent;
                    const over = hasLimit && spent > line.monthlyLimit;

                    return (
                      <div key={line.id} className="rounded-xl bg-[#111827] border border-[#1e2d40] p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg shrink-0">
                            {line.icon}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2 mb-0.5">
                              <p className="text-sm font-medium text-white truncate">{line.name}</p>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_COLOR[line.type]}`}>
                                  {TYPE_LABELS[line.type]}
                                </span>
                                <button onClick={() => openEdit(line)}
                                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10">
                                  <PencilIcon className="w-3.5 h-3.5 text-slate-500" />
                                </button>
                                <button onClick={() => deleteBudgetLine(line.id)}
                                  className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10">
                                  <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
                                </button>
                              </div>
                            </div>
                            {hasLimit ? (
                              <>
                                <div className="flex items-center justify-between mb-1.5">
                                  <p className="text-xs text-slate-500">
                                    {fmt(spent, currency)} <span className="text-slate-600">/ {fmt(line.monthlyLimit, currency)}</span>
                                  </p>
                                  <p className={`text-xs font-medium ${over ? 'text-red-400' : 'text-slate-400'}`}>
                                    {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
                                  </p>
                                </div>
                                <ProgressBar value={spent} max={line.monthlyLimit} color={paceColor(pct)} />
                              </>
                            ) : (
                              <button onClick={() => openEdit(line)}
                                className="mt-1 text-xs text-blue-400/70 hover:text-blue-400 underline underline-offset-2">
                                Set monthly limit
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── Needs / Wants / Savings Breakdown ── */}
              <div>
                <SectionHeader title="Allocation Breakdown" />
                <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] overflow-hidden">
                  <div className="grid grid-cols-3 divide-x divide-[#1e2d40]">
                    {[
                      { label: 'Needs',   amt: needsAmt,   ref: 50, color: 'text-blue-400',    bar: 'bg-blue-500' },
                      { label: 'Wants',   amt: wantsAmt,   ref: 30, color: 'text-purple-400',  bar: 'bg-purple-500' },
                      { label: 'Savings', amt: savingsAmt, ref: 20, color: 'text-emerald-400', bar: 'bg-emerald-500' },
                    ].map(({ label, amt, ref, color }) => {
                      const pct = breakdownTotal > 0 ? Math.round((amt / breakdownTotal) * 100) : 0;
                      const onTrack = Math.abs(pct - ref) <= 5;
                      return (
                        <div key={label} className="flex flex-col items-center px-3 py-4 gap-1">
                          <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
                          <p className={`text-lg font-bold ${color}`}>{pct}%</p>
                          <p className="text-xs text-slate-400">{fmt(amt, currency)}</p>
                          <div className="mt-1 flex items-center gap-1">
                            <div className={`h-1.5 w-1.5 rounded-full ${onTrack ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                            <p className="text-[10px] text-slate-600">goal {ref}%</p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex h-1.5 mx-4 mb-4 rounded-full overflow-hidden gap-0.5">
                    {breakdownTotal > 0 && [
                      { pct: (needsAmt  / breakdownTotal) * 100, cls: 'bg-blue-500' },
                      { pct: (wantsAmt  / breakdownTotal) * 100, cls: 'bg-purple-500' },
                      { pct: (savingsAmt / breakdownTotal) * 100, cls: 'bg-emerald-500' },
                    ].map((s, i) => (
                      <div key={i} className={`h-full rounded-full ${s.cls} transition-all`} style={{ width: `${s.pct}%` }} />
                    ))}
                  </div>
                  <div className="px-4 pb-3">
                    <p className="text-[10px] text-slate-600">Based on the 50/30/20 rule</p>
                  </div>
                </div>
              </div>

              {/* ── Recent Transactions ── */}
              <div>
                <SectionHeader
                  title="Recent Transactions"
                  action={
                    expenses.length > 8 ? (
                      <button onClick={() => setShowAllExpenses(v => !v)}
                        className="text-xs text-blue-400 hover:text-blue-300">
                        {showAllExpenses ? 'Show less' : `Show all (${expenses.length})`}
                      </button>
                    ) : null
                  }
                />
                {expenses.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-8 text-center">
                    <ReceiptIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                    <p className="text-sm text-slate-500 mb-1">No expenses logged yet.</p>
                    <Link href="/expenses/new" className="text-xs text-blue-400 underline underline-offset-2">
                      Log your first expense
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {recentExpenses.map(e => (
                      <div key={e.id} className="flex items-center gap-3 rounded-xl bg-[#111827] border border-[#1e2d40] px-4 py-3">
                        <div className="text-base shrink-0">{CATEGORY_ICONS[e.category]}</div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-white capitalize">{e.category}</p>
                          {e.note && <p className="text-xs text-slate-500 truncate">{e.note}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-medium text-red-400">-{fmt(e.amount, currency)}</p>
                          <p className="text-[10px] text-slate-600">
                            {new Date(e.date).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>{/* end right col */}
          </div>
        </div>
      </div>

      {/* ── Edit Budget Line Sheet ── */}
      {editLine && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setEditLine(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{editLine.icon}</span>
              <p className="font-semibold text-white">{editLine.name}</p>
            </div>
            <InlineAmountInput label="Monthly limit" value={editLimit} onChange={setEditLimit} />
            <p className="text-xs text-slate-500 mt-4 mb-2">Category type</p>
            <div className="flex gap-2 mb-5">
              {(['needs', 'wants', 'savings'] as BudgetType[]).map(t => (
                <button key={t} onClick={() => setEditType(t)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors ${editType === t ? TYPE_COLOR[t] : 'bg-white/5 border-[#1e2d40] text-slate-400'}`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <button onClick={saveEdit} className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Add Budget Line Sheet ── */}
      {addLineOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setAddLineOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <p className="font-semibold text-white text-lg mb-5">New Budget Category</p>
            <p className="text-xs text-slate-500 mb-2">Icon</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {ICON_OPTIONS.map(ico => (
                <button key={ico} onClick={() => setNewLineIcon(ico)}
                  className={`h-10 w-10 rounded-xl text-xl border transition-colors ${newLineIcon === ico ? 'border-blue-500 bg-blue-500/15' : 'border-[#1e2d40] bg-white/5'}`}>
                  {ico}
                </button>
              ))}
            </div>
            <div className="space-y-3 mb-4">
              <InlineAmountInput label="Name" value={newLineName} onChange={setNewLineName} placeholder="e.g. Groceries" />
              <InlineAmountInput label="Monthly limit" value={newLineLimit} onChange={setNewLineLimit} />
            </div>
            <p className="text-xs text-slate-500 mb-2">Type</p>
            <div className="flex gap-2 mb-5">
              {(['needs', 'wants', 'savings'] as BudgetType[]).map(t => (
                <button key={t} onClick={() => setNewLineType(t)}
                  className={`flex-1 rounded-xl py-2.5 text-sm font-medium border transition-colors ${newLineType === t ? TYPE_COLOR[t] : 'bg-white/5 border-[#1e2d40] text-slate-400'}`}>
                  {TYPE_LABELS[t]}
                </button>
              ))}
            </div>
            <button onClick={handleAddLine} disabled={!newLineName.trim()}
              className="w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40">
              Add Category
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
