'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import {
  useApp, fmt, Category, Bill, calcElectric,
} from '@/components/AppContext';
import { currentCycleKey, cycleKeyOf, cycleLabel, dueDateInCycle } from '@/lib/cycle';
import BottomNav from '@/components/BottomNav';
import BottomSheet from '@/components/BottomSheet';
import { ScrollLock } from '@/components/ModalLock';
import BudgetTile from '@/components/BudgetTile';
import BillsSheet from '@/components/BillsSheet';
import BudgetHero from '@/components/BudgetHero';
import CategoryGrid from '@/components/CategoryGrid';
import CategoryDetailSheet from '@/components/CategoryDetailSheet';
import ElectricSheet from '@/components/ElectricSheet';
import SavingsSheet from '@/components/SavingsSheet';
import { PlusIcon, CogIcon } from '@/components/Icons';
import { visibleCategories, BUILTIN_CATEGORIES } from '@/lib/categories';

// ─── helpers ─────────────────────────────────────────────────────────────────

function uid() { return crypto.randomUUID(); }

function formatMonth(m: string): string {
  const [y, mo] = m.split('-');
  return new Date(parseInt(y), parseInt(mo) - 1)
    .toLocaleDateString('en-PH', { month: 'short', year: 'numeric' });
}

const CATEGORY_ICON_OPTIONS = ['🎯','🐶','🎮','📚','☕','🏠','📱','💰','🌱','🎁','✈️','🍿','💪','🚿','👕','🎵'];

// ─── small components ─────────────────────────────────────────────────────────

function InlineAmountInput({
  label, value, onChange, placeholder = '0.00',
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1">{label}</p>
      <input
        type="number"
        inputMode="decimal"
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
    instalmentSchedule, instalmentRemainingBalance, instalmentDebtFreeDate,
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
    ...BUILTIN_CATEGORIES,
    ...customCategories.map(c => ({ key: c.key, label: c.label, icon: c.icon })),
  ].filter(c => !hiddenCategories.includes(c.key));

  // Built-ins the user has removed, still restorable.
  const hiddenBuiltIns = BUILTIN_CATEGORIES.filter(c => hiddenCategories.includes(c.key));

  const setCategoryBudget = (cat: Category, v: number) =>
    updateSettings({ categoryBudgets: { ...categoryBudgets, [cat]: v } });

  // ── category detail sheet ──
  const [detailCat, setDetailCat] = useState<Category | null>(null);

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
    ?? BUILTIN_CATEGORIES.find(c => c.key === key)
    ?? { key, label: String(key), icon: '✦' };

  // The ⚡ tile's forecast is read live from running appliances, so this page
  // ticks to keep it current.
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(t => t + 1), 10_000);
    return () => clearInterval(id);
  }, []);
  const liveElectric = calcElectric(settings);
  const { cycleStartDay } = settings;
  const currentCycle = currentCycleKey(cycleStartDay);
  const monthLabel = cycleLabel(currentCycle, cycleStartDay);

  // ── this-cycle spend per expense category ──
  const spentByCategory = useMemo(() => {
    const acc: Partial<Record<Category, number>> = {};
    expenses.forEach(e => {
      if (cycleKeyOf(new Date(e.date), cycleStartDay) === currentCycle) {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      }
    });
    return acc;
  }, [expenses, cycleStartDay, currentCycle]);

  // ── budget totals ──
  const totalBills    = bills.reduce((s, b) => s + b.amount, 0);
  const nextInstalment = [...instalmentSchedule]
    .filter(p => p.status !== 'paid')
    .sort((a, b) => a.month.localeCompare(b.month))[0];
  const instalmentMonthly = nextInstalment?.amount ?? 0;
  // Only budgets for categories that still exist count — a stale entry left by a
  // deleted custom category shouldn't quietly inflate the total.
  const totalCategoryBudgets = allCategories
    .reduce((s, c) => s + (categoryBudgets[c.key] ?? 0), 0);
  const totalAllocated   = totalBills + instalmentMonthly + totalCategoryBudgets + monthlySavingsTarget;
  const unallocated      = monthlyIncome - totalAllocated;
  const allocatedPct     = monthlyIncome > 0 ? (totalAllocated / monthlyIncome) * 100 : 0;

  // Named parts of totalAllocated, for the breakdown under the progress bar.
  const allocationParts = [
    { label: 'Bills',       value: totalBills },
    { label: 'Categories',  value: totalCategoryBudgets },
    { label: 'Instalments', value: instalmentMonthly },
    { label: 'Savings',     value: monthlySavingsTarget },
  ].filter(p => p.value > 0);

  // ── collapsed-section sheets ──
  const [billsOpen,    setBillsOpen]    = useState(false);
  const [electricOpen, setElectricOpen] = useState(false);
  const [savingsOpen,  setSavingsOpen]  = useState(false);

  // ── bill edit sheet ──
  const [editBill,     setEditBill]     = useState<Bill | null>(null);
  const [editBillName, setEditBillName] = useState('');
  const [editBillAmt,  setEditBillAmt]  = useState('');
  const [editBillDue,  setEditBillDue]  = useState('');
  const [editBillCat,  setEditBillCat]  = useState<Category>('bills');

  // ── handlers ──
  const openBillEdit = (bill: Bill) => {
    setEditBill(bill);
    setEditBillName(bill.name);
    setEditBillAmt(String(bill.amount));
    setEditBillDue(bill.dueDay ? String(bill.dueDay) : '');
    setEditBillCat(bill.category);
  };

  const saveBillEdit = () => {
    if (!editBill || !editBillName.trim() || !editBillAmt) return;
    updateBill(editBill.id, {
      name: editBillName.trim(),
      amount: parseFloat(editBillAmt) || 0,
      dueDay: editBillDue ? Math.min(Math.max(parseInt(editBillDue), 1), 31) : null,
      category: editBillCat,
    });
    setEditBill(null);
  };

  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdueCount = bills.filter(b =>
    b.dueDay !== null
    && !b.paidMonths.includes(currentCycle)
    && dueDateInCycle(b.dueDay, currentCycle, cycleStartDay) < startOfToday
  ).length;

  // The bill the meter is trying to predict, if the user has one.
  const electricBill = bills.find(b => b.category === 'electric') ?? null;

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          {/* ── Log Expense ── */}
          <div className="flex justify-end items-center gap-2 pt-14 pb-4 md:pt-10">
            <Link
              href="/settings"
              aria-label="Settings"
              className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
            >
              <CogIcon className="w-5 h-5 text-slate-400" />
            </Link>
            <Link
              href="/expenses/new"
              className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span className="hidden sm:inline">Log Expense</span>
            </Link>
          </div>

          <div className="space-y-6">

            {/* ── Hero — always open ── */}
            <BudgetHero
              monthLabel={monthLabel}
              allocated={totalAllocated}
              unallocated={unallocated}
              allocatedPct={allocatedPct}
              parts={allocationParts}
              receivedThisMonth={receivedThisMonth}
            />

            {/* ── Collapsed sections ── */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3">

              <BudgetTile
                icon="💡"
                label="Bills"
                value={`${fmt(totalBills, currency)}/mo`}
                status={
                  bills.length === 0
                    ? 'none yet'
                    : overdueCount > 0
                      ? `${overdueCount} overdue`
                      : `${bills.filter(b => !b.paidMonths.includes(currentCycle)).length} of ${bills.length} unpaid`
                }
                statusTone={
                  overdueCount > 0 ? 'warn'
                    : bills.length > 0 && bills.every(b => b.paidMonths.includes(currentCycle)) ? 'good' : 'default'
                }
                onClick={() => setBillsOpen(true)}
              />

              <BudgetTile
                icon="⚡"
                label="Electric"
                value={`Est. ${fmt(liveElectric, currency)}`}
                status={
                  electricBill
                    ? liveElectric > electricBill.amount
                      ? `over your ${fmt(electricBill.amount, currency)} bill`
                      : `tracking under your ${fmt(electricBill.amount, currency)} bill`
                    : settings.appliances.filter(a => a.enabled).length > 0
                      ? `${settings.appliances.filter(a => a.enabled).length} running`
                      : 'from your appliances'
                }
                statusTone={electricBill && liveElectric > electricBill.amount ? 'warn' : 'default'}
                onClick={() => setElectricOpen(true)}
              />

              <BudgetTile
                icon="🌱"
                label="Savings"
                value={monthlySavingsTarget > 0 ? `${fmt(monthlySavingsTarget, currency)}/mo` : 'Not set'}
                status={monthlySavingsTarget > 0 ? 'set aside each month' : 'tap to set a target'}
                onClick={() => setSavingsOpen(true)}
              />

              <BudgetTile
                icon="💳"
                label="Instalments"
                value={instalmentMonthly > 0 ? fmt(instalmentMonthly, currency) : 'Nothing due'}
                status={
                  instalmentRemainingBalance > 0
                    ? `${fmt(instalmentRemainingBalance, currency)} left${instalmentDebtFreeDate ? ` · ${formatMonth(instalmentDebtFreeDate)}` : ''}`
                    : 'all paid off'
                }
                statusTone={instalmentRemainingBalance > 0 ? 'default' : 'good'}
                href="/instalments"
              />

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

            </div>

            {/* ── Categories ── */}
            <CategoryGrid
              categories={allCategories}
              amountFor={key => spentByCategory[key] ?? 0}
              budgets={categoryBudgets}
              currency={currency}
              onSelect={key => openCatEdit(key as Category)}
              onOpen={key => setDetailCat(key as Category)}
              onAdd={() => setAddCatOpen(true)}
            />

          </div>
        </div>
      </div>

      {/* ── Confirm Delete Category ── */}
      {confirmDeleteCat && (() => {
        const { label, icon } = catMetaFor(confirmDeleteCat);
        const isCustom = customCategories.some(c => c.key === confirmDeleteCat);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center px-6" onClick={() => setConfirmDeleteCat(null)}>
            <ScrollLock />
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
          <div className="mt-4">
            <InlineAmountInput
              label="Due day of month" value={editBillDue} onChange={setEditBillDue}
              placeholder="e.g. 15"
            />
          </div>
          <div className="mt-4">
            <p className="text-xs text-slate-500 mb-1">Category</p>
            <select
              value={editBillCat}
              onChange={e => setEditBillCat(e.target.value as Category)}
              className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
            >
              {visibleCategories(settings.customCategories, settings.hiddenCategories).map(c => (
                <option key={c.key} value={c.key} className="bg-[#111827]">{c.icon} {c.label}</option>
              ))}
            </select>
          </div>
          <button
            onClick={saveBillEdit}
            disabled={!editBillName.trim() || !editBillAmt}
            className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
          >
            Save
          </button>
        </BottomSheet>
      )}

      {/* ── Category Detail Sheet ── */}
      {detailCat && (() => {
        const meta = catMetaFor(detailCat);
        return (
          <CategoryDetailSheet
            categoryKey={detailCat}
            icon={meta.icon}
            label={meta.label}
            budget={categoryBudgets[detailCat] ?? 0}
            spent={spentByCategory[detailCat] ?? 0}
            currency={currency}
            onClose={() => setDetailCat(null)}
          />
        );
      })()}

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
            {/* The per-card trash icon is gone, so this sheet is the only route
                to deletion. Close it first, so one overlay shows at a time. */}
            <button
              onClick={() => { const k = editCat; setEditCat(null); setConfirmDeleteCat(k); }}
              className="mt-3 w-full rounded-xl bg-white/5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
            >
              {customCategories.some(c => c.key === editCat) ? 'Delete category' : 'Remove category'}
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

          {/* Removed built-ins — restorable, since they can't be truly deleted. */}
          {hiddenBuiltIns.length > 0 && (
            <div className="mt-6 border-t border-[#1e2d40] pt-4">
              <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-600">Removed</p>
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
        </BottomSheet>
      )}

    </div>
  );
}
