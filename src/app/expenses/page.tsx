'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  useApp, fmt, Category, Bill, currentYYYYMM, calcElectric,
} from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import BottomSheet from '@/components/BottomSheet';
import BudgetTile from '@/components/BudgetTile';
import BillsSheet from '@/components/BillsSheet';
import ProgressBar from '@/components/ProgressBar';
import NumberField from '@/components/NumberField';
import ElectricSheet from '@/components/ElectricSheet';
import SavingsSheet from '@/components/SavingsSheet';
import {
  PlusIcon, TrashIcon, PencilIcon,
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
    emergencyFund,
    updateBill,
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

  // ── collapsed-section sheets ──
  const [billsOpen,    setBillsOpen]    = useState(false);
  const [electricOpen, setElectricOpen] = useState(false);
  const [savingsOpen,  setSavingsOpen]  = useState(false);

  // ── bill edit sheet ──
  const [editBill,     setEditBill]     = useState<Bill | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillAmt,  setEditBillAmt]  = useState('');

  // ── handlers ──
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
              <BudgetTile
                icon="💡"
                label="Bills"
                value={`${fmt(totalBills, currency)}/mo`}
                status={
                  bills.length === 0
                    ? 'none yet'
                    : `${bills.filter(b => !b.paidMonths.includes(currentYYYYMM())).length} of ${bills.length} unpaid`
                }
                statusTone={
                  bills.length > 0 && bills.every(b => b.paidMonths.includes(currentYYYYMM())) ? 'good' : 'default'
                }
                onClick={() => setBillsOpen(true)}
              />

              {/* ── Shopee Pay Later ── */}
              <BudgetTile
                icon="🛍️"
                label="Shopee"
                value={shopeeMonthly > 0 ? fmt(shopeeMonthly, currency) : 'Nothing due'}
                status={
                  shopeeRemainingBalance > 0
                    ? `${fmt(shopeeRemainingBalance, currency)} left${shopeeDebtFreeDate ? ` · ${formatMonth(shopeeDebtFreeDate)}` : ''}`
                    : 'all paid off'
                }
                statusTone={shopeeRemainingBalance > 0 ? 'default' : 'good'}
                href="/shopee"
              />

              {/* ── Savings Target ── */}
              <BudgetTile
                icon="🌱"
                label="Savings"
                value={monthlySavingsTarget > 0 ? `${fmt(monthlySavingsTarget, currency)}/mo` : 'Not set'}
                status={monthlySavingsTarget > 0 ? 'set aside each month' : 'tap to set a target'}
                onClick={() => setSavingsOpen(true)}
              />

              {/* ── Emergency Fund ── */}
              <BudgetTile
                icon="🛡️"
                label="Emergency"
                value={`${fmt(emergencyFund.currentAmount, currency)} of ${fmt(settings.emergencyFundTarget, currency)}`}
                status={
                  settings.emergencyFundTarget > 0
                    ? `${Math.min(100, (emergencyFund.currentAmount / settings.emergencyFundTarget) * 100).toFixed(0)}% funded`
                    : 'no target set'
                }
                statusTone={
                  settings.emergencyFundTarget > 0 && emergencyFund.currentAmount >= settings.emergencyFundTarget
                    ? 'good'
                    : 'default'
                }
                href="/emergency-fund"
              />

            </div>{/* end left col */}

            {/* ══ RIGHT COLUMN ═════════════════════════════════════════════ */}
            <div className="space-y-6 mt-6 md:mt-0">

              {/* ── Electric ── */}
              <BudgetTile
                icon="⚡"
                label="Electric"
                value={fmt(liveElectric, currency)}
                status={
                  settings.appliances.filter(a => a.enabled).length > 0
                    ? `${settings.appliances.filter(a => a.enabled).length} running`
                    : 'nothing running'
                }
                statusTone={settings.appliances.filter(a => a.enabled).length > 0 ? 'warn' : 'default'}
                onClick={() => setElectricOpen(true)}
              />

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

      {/* ── Recurring Bills Sheet ── */}
      {billsOpen && (
        <BillsSheet
          onClose={() => setBillsOpen(false)}
          onEditBill={b => { setBillsOpen(false); openBillEdit(b); }}
        />
      )}

      {/* ── Electric Sheet ── */}
      {electricOpen && <ElectricSheet onClose={() => setElectricOpen(false)} />}

      {/* ── Savings Sheet ── */}
      {savingsOpen && <SavingsSheet onClose={() => setSavingsOpen(false)} />}

      {/* ── Edit Bill Sheet ── */}
      {editBill && (
        <BottomSheet onClose={() => setEditBill(null)}>
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
        </BottomSheet>
      )}

      {/* ── Edit Category Budget Sheet ── */}
      {editCat && (() => {
        const meta = allCategories.find(c => c.key === editCat) ?? { icon: '✦', label: 'Category' };
        return (
          <BottomSheet onClose={() => setEditCat(null)}>
            <div className="flex items-center gap-3 mb-5">
              <span className="text-2xl">{meta.icon}</span>
              <p className="font-semibold text-white">{meta.label} Budget</p>
            </div>
            <InlineAmountInput label="Monthly budget" value={editCatBudget} onChange={setEditCatBudget} />
            <button onClick={saveCatEdit} className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
              Save
            </button>
          </BottomSheet>
        );
      })()}

      {/* ── Add Category Sheet ── */}
      {addCatOpen && (
        <BottomSheet onClose={() => setAddCatOpen(false)}>
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
        </BottomSheet>
      )}

    </div>
  );
}
