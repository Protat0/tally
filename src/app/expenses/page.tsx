'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  useApp, fmt, Category, Bill, ShopeePayment, currentYYYYMM, calcElectric,
} from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import ProgressBar from '@/components/ProgressBar';
import NumberField from '@/components/NumberField';
import ElectricSection from '@/components/ElectricSection';
import {
  PlusIcon, TrashIcon, PencilIcon, CheckIcon,
  AlertIcon, BagIcon, ShieldIcon,
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

const CATEGORY_ICON_OPTIONS = ['🎯','🐶','🎮','📚','☕','🏠','📱','💰','🌱','🎁','✈️','🍿','💪','🚿','👕','🎵'];

// The fixed expense categories logged against, each user-budgetable.
const EXPENSE_CATEGORIES: { key: Category; label: string; icon: string }[] = [
  { key: 'food',      label: 'Food',      icon: '🍜' },
  { key: 'transport', label: 'Transport', icon: '🚗' },
  { key: 'bills',     label: 'Bills',     icon: '💡' },
  { key: 'shopping',  label: 'Shopping',  icon: '🛍️' },
  { key: 'health',    label: 'Health',    icon: '💊' },
  { key: 'other',     label: 'Other',     icon: '✦' },
];

// Budgetable like the rest, but its spend is metered from appliance usage rather
// than logged expenses — so it's deliberately absent from the Log Expense picker.
const ELECTRIC_CATEGORY = { key: 'electric' as Category, label: 'Electric', icon: '⚡' };

const BUDGETABLE_CATEGORIES = [...EXPENSE_CATEGORIES, ELECTRIC_CATEGORY];

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
    shopeeSchedule, shopeeRemainingBalance, shopeeDebtFreeDate,
    shopeeNewPurchaseLock, setShopeeNewPurchaseLock,
    addShopeePayment, updateShopeePayment, deleteShopeePayment,
    emergencyFund, addEmergencyFundEntry,
    toggleBillPaid, updateBill,
    receivedThisMonth,
  } = useApp();

  const {
    currency, bills, monthlyIncome, monthlySavingsTarget,
    categoryBudgets, customCategories, hiddenCategories,
  } = settings;

  // Built-in categories plus any the user has added, minus any they've removed.
  const allCategories = [
    ...BUDGETABLE_CATEGORIES,
    ...customCategories.map(c => ({ key: c.key, label: c.label, icon: c.icon })),
  ].filter(c => !hiddenCategories.includes(c.key));

  // Built-ins the user has removed, still restorable.
  const hiddenBuiltIns = BUDGETABLE_CATEGORIES.filter(c => hiddenCategories.includes(c.key));

  const setCategoryBudget = (cat: Category, v: number) =>
    updateSettings({ categoryBudgets: { ...categoryBudgets, [cat]: v } });

  // ── category budget edit sheet ──
  const [editCat,       setEditCat]       = useState<Category | null>(null);
  const [editCatBudget, setEditCatBudget] = useState('');

  const openCatEdit = (cat: Category) => {
    setEditCat(cat);
    const current = categoryBudgets[cat] ?? 0;
    setEditCatBudget(current > 0 ? String(current) : '');
  };

  const saveCatEdit = () => {
    if (!editCat) return;
    setCategoryBudget(editCat, parseFloat(editCatBudget) || 0);
    setEditCat(null);
  };

  // ── add category sheet ──
  const [addCatOpen, setAddCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('🎯');
  const [newCatBudget, setNewCatBudget] = useState('');

  const handleAddCategory = () => {
    if (!newCatName.trim()) return;
    const key = 'c_' + uid();
    const budgetVal = parseFloat(newCatBudget) || 0;
    updateSettings({
      customCategories: [...customCategories, { key, label: newCatName.trim(), icon: newCatIcon }],
      categoryBudgets: budgetVal > 0 ? { ...categoryBudgets, [key]: budgetVal } : categoryBudgets,
    });
    setAddCatOpen(false);
    setNewCatName(''); setNewCatIcon('🎯'); setNewCatBudget('');
  };

  // ── category deletion ──
  const [confirmDeleteCat, setConfirmDeleteCat] = useState<Category | null>(null);

  // Custom categories are removed outright. Built-ins can't be — expenses
  // already logged against them still need to resolve — so they're hidden
  // instead, and can be restored below. Either way the budget is dropped.
  const deleteCategory = (key: string) => {
    const restBudgets = { ...categoryBudgets };
    delete restBudgets[key];
    const isCustom = customCategories.some(c => c.key === key);
    updateSettings({
      categoryBudgets: restBudgets,
      ...(isCustom
        ? { customCategories: customCategories.filter(c => c.key !== key) }
        : { hiddenCategories: [...hiddenCategories, key] }),
    });
    setConfirmDeleteCat(null);
  };

  const restoreCategory = (key: string) =>
    updateSettings({ hiddenCategories: hiddenCategories.filter(k => k !== key) });

  const catMetaFor = (key: Category) =>
    allCategories.find(c => c.key === key)
    ?? BUDGETABLE_CATEGORIES.find(c => c.key === key)
    ?? { key, label: String(key), icon: '✦' };

  // Electric spend is metered from running appliances rather than logged
  // expenses, so this page ticks to keep its budget row current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const liveElectric = calcElectric(settings);
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

  // Electric reads from the meter; every other category from logged expenses.
  const spentFor = (key: Category): number =>
    key === ELECTRIC_CATEGORY.key ? liveElectric : (spentByCategory[key] ?? 0);

  // ── budget totals ──
  const totalBills    = bills.reduce((s, b) => s + b.amount, 0);
  const nextShopee    = [...shopeeSchedule]
    .filter(p => p.status !== 'paid')
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  const shopeeMonthly = nextShopee?.amount ?? 0;
  // Only budgets for categories that still exist count — a stale entry left by a
  // deleted custom category shouldn't quietly inflate the total.
  const totalCategoryBudgets = allCategories
    .reduce((s, c) => s + (categoryBudgets[c.key] ?? 0), 0);
  const totalAllocated   = totalBills + shopeeMonthly + totalCategoryBudgets + monthlySavingsTarget;
  const unallocated      = monthlyIncome - totalAllocated;
  const allocatedPct     = monthlyIncome > 0 ? (totalAllocated / monthlyIncome) * 100 : 0;

  // Named parts of totalAllocated, for the breakdown under the progress bar.
  const allocationParts = [
    { label: 'Bills',      value: totalBills },
    { label: 'Categories', value: totalCategoryBudgets },
    { label: 'Shopee',     value: shopeeMonthly },
    { label: 'Savings',    value: monthlySavingsTarget },
  ].filter(p => p.value > 0);

  // ── bill inline form ──
  const [addBillOpen, setAddBillOpen] = useState(false);
  const [newBillName, setNewBillName] = useState('');
  const [newBillAmt,  setNewBillAmt]  = useState('');

  // ── bill edit sheet ──
  const [editBill,     setEditBill]     = useState<Bill | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillAmt,  setEditBillAmt]  = useState('');

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

  // ── handlers ──
  const handleAddBill = () => {
    if (!newBillName.trim() || !newBillAmt) return;
    const bill: Bill = { id: uid(), name: newBillName.trim(), amount: parseFloat(newBillAmt), paidMonths: [] };
    updateSettings({ bills: [...bills, bill] });
    setAddBillOpen(false);
    setNewBillName(''); setNewBillAmt('');
  };

  const removeBill = (id: string) =>
    updateSettings({ bills: bills.filter(b => b.id !== id) });

  const openBillEdit = (bill: Bill) => {
    setEditBill(bill);
    setEditBillName(bill.name);
    setEditBillAmt(String(bill.amount));
  };

  const saveBillEdit = () => {
    if (!editBill || !editBillName.trim() || !editBillAmt) return;
    updateBill(editBill.id, { name: editBillName.trim(), amount: parseFloat(editBillAmt) || 0 });
    setEditBill(null);
  };

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
                <div className="flex items-center justify-between gap-4 pb-4 mb-4 border-b border-[#1e2d40]">
                  <div>
                    <p className="text-xs text-slate-500 uppercase tracking-widest">Monthly Income</p>
                    <p className="text-[11px] text-slate-600 mt-0.5">Your take-home pay each month</p>
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

                {/* Actual money received, from wallet top-ups. Deliberately does not
                    feed the allocation maths below — that stays based on the plan. */}
                {(monthlyIncome > 0 || receivedThisMonth > 0) && (
                  <div className="flex items-baseline justify-between gap-3 pb-4 mb-4 border-b border-[#1e2d40]">
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
                )}

                {monthlyIncome === 0 ? (
                  <p className="text-sm text-slate-400 text-center py-1">Enter your monthly income above to start budgeting.</p>
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
                    {allocationParts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
                        {allocationParts.map(p => (
                          <span key={p.label} className="text-[11px] text-slate-600">
                            {p.label} <span className="text-slate-400">{fmt(p.value, currency)}</span>
                          </span>
                        ))}
                      </div>
                    )}
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
                        <button onClick={() => openBillEdit(b)}
                          title="Edit bill"
                          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                          <PencilIcon className="w-3.5 h-3.5 text-slate-500 hover:text-slate-200" />
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

              {/* ── Electric ── */}
              <ElectricSection />

              {/* ── Category Budgets ── */}
              <div>
                <SectionHeader
                  title="Category Budgets"
                  action={
                    <button onClick={() => setAddCatOpen(true)}
                      className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300">
                      <PlusIcon className="w-3.5 h-3.5" /> Add
                    </button>
                  }
                />
                <div className="space-y-2">
                  {allCategories.map(({ key, label, icon }) => {
                    const budget = categoryBudgets[key] ?? 0;
                    const spent = spentFor(key);
                    const hasBudget = budget > 0;
                    const remaining = budget - spent;
                    const pct = hasBudget ? (spent / budget) * 100 : 0;
                    const over = hasBudget && spent > budget;

                    return (
                      <div key={key} className="rounded-xl bg-[#111827] border border-[#1e2d40] p-4">
                        <div className="flex items-center gap-3 mb-2">
                          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg shrink-0">
                            {icon}
                          </div>
                          <p className="flex-1 text-sm font-medium text-white">{label}</p>
                          <div className="flex items-center gap-2 shrink-0">
                            <p className="text-sm font-medium text-white">
                              {hasBudget ? fmt(budget, currency) : <span className="text-slate-500">Not set</span>}
                            </p>
                            <button onClick={() => openCatEdit(key)}
                              title="Edit budget"
                              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10">
                              <PencilIcon className="w-3.5 h-3.5 text-slate-500 hover:text-slate-200" />
                            </button>
                            <button onClick={() => setConfirmDeleteCat(key)}
                              title="Delete category"
                              className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10">
                              <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
                            </button>
                          </div>
                        </div>
                        {hasBudget ? (
                          <>
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs text-slate-500">
                                {fmt(spent, currency)} <span className="text-slate-600">/ {fmt(budget, currency)}</span>
                              </p>
                              <p className={`text-xs font-medium ${over ? 'text-red-400' : 'text-slate-400'}`}>
                                {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
                              </p>
                            </div>
                            <ProgressBar value={spent} max={budget} color={paceColor(pct)} />
                          </>
                        ) : (
                          <p className="text-xs text-slate-600">
                            No budget set · {fmt(spent, currency)} spent this month
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Removed built-ins — restorable, since they can't be truly deleted. */}
                {hiddenBuiltIns.length > 0 && (
                  <div className="mt-4 rounded-xl border border-dashed border-[#1e2d40] p-3">
                    <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-600">
                      Removed
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {hiddenBuiltIns.map(({ key, label, icon }) => (
                        <button
                          key={key}
                          onClick={() => restoreCategory(key)}
                          title={`Restore ${label}`}
                          className="flex items-center gap-1.5 rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
                        >
                          <span className="opacity-50">{icon}</span>
                          {label}
                          <span className="text-slate-600">· restore</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

            </div>{/* end right col */}
          </div>
        </div>
      </div>

      {/* ── Confirm Delete Category ── */}
      {confirmDeleteCat && (() => {
        const { label, icon } = catMetaFor(confirmDeleteCat);
        const isCustom = customCategories.some(c => c.key === confirmDeleteCat);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmDeleteCat(null)}>
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
              onClick={e => e.stopPropagation()}
            >
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-white/5 text-2xl">
                {icon}
              </div>
              <p className="font-semibold text-white mb-1">
                {isCustom ? `Delete ${label}?` : `Remove ${label}?`}
              </p>
              <p className="text-sm text-slate-400 mb-5">
                {isCustom
                  ? 'The category and its budget are removed. Expenses already logged under it are kept.'
                  : 'Hidden from the category pickers and its budget cleared. Expenses already logged under it are kept, and you can restore it any time.'}
              </p>
              <div className="flex gap-3">
                <button onClick={() => setConfirmDeleteCat(null)}
                  className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300">
                  Cancel
                </button>
                <button onClick={() => deleteCategory(confirmDeleteCat)}
                  className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-medium text-white">
                  {isCustom ? 'Delete' : 'Remove'}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Edit Bill Sheet ── */}
      {editBill && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setEditBill(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">💡</span>
              <p className="font-semibold text-white">Edit Bill</p>
            </div>
            <p className="text-xs text-slate-500 mb-1">Name</p>
            <input
              type="text"
              value={editBillName}
              onChange={e => setEditBillName(e.target.value)}
              placeholder="Bill name"
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
            />
            <InlineAmountInput label="Amount" value={editBillAmt} onChange={setEditBillAmt} />
            <button
              onClick={saveBillEdit}
              disabled={!editBillName.trim() || !editBillAmt}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </div>
      )}

      {/* ── Edit Category Budget Sheet ── */}
      {editCat && (() => {
        const meta = allCategories.find(c => c.key === editCat) ?? { icon: '✦', label: 'Category' };
        return (
          <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setEditCat(null)}>
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
            <div className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
              onClick={e => e.stopPropagation()}>
              <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
              <div className="flex items-center gap-3 mb-5">
                <span className="text-2xl">{meta.icon}</span>
                <p className="font-semibold text-white">{meta.label} Budget</p>
              </div>
              <InlineAmountInput label="Monthly budget" value={editCatBudget} onChange={setEditCatBudget} />
              <button onClick={saveCatEdit} className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
                Save
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Add Category Sheet ── */}
      {addCatOpen && (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" onClick={() => setAddCatOpen(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6"
            onClick={e => e.stopPropagation()}>
            <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
            <p className="font-semibold text-white text-lg mb-5">New Category</p>
            <p className="text-xs text-slate-500 mb-2">Icon</p>
            <div className="flex flex-wrap gap-2 mb-4">
              {CATEGORY_ICON_OPTIONS.map(ico => (
                <button key={ico} onClick={() => setNewCatIcon(ico)}
                  className={`h-10 w-10 rounded-xl text-xl border transition-colors ${newCatIcon === ico ? 'border-blue-500 bg-blue-500/15' : 'border-[#1e2d40] bg-white/5'}`}>
                  {ico}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 mb-1">Name</p>
            <input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="e.g. Pets"
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
            />
            <InlineAmountInput label="Monthly budget (optional)" value={newCatBudget} onChange={setNewCatBudget} />
            <button onClick={handleAddCategory} disabled={!newCatName.trim()}
              className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40">
              Add Category
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
