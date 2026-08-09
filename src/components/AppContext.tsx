'use client';

import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

// Built-in keys keep autocomplete; `(string & {})` also allows user-defined custom category keys.
export type Category = 'food' | 'transport' | 'bills' | 'shopping' | 'health' | 'other' | (string & {});

export interface CustomCategory {
  key: string; label: string; icon: string;
}
export type PaydayCycle = '1st-15th' | 'monthly' | 'custom';
export type ShopeeStatus = 'paid' | 'pending' | 'upcoming';
export type BudgetType = 'needs' | 'wants' | 'savings';

export interface Wallet {
  id: string; name: string; icon: string; balance: number;
}

export interface Expense {
  id: string; amount: number; category: Category;
  walletId: string; note: string; date: string;
}

// Money that moves in or out of a wallet without being a categorised expense.
//   earned    — money in.  walletId is the destination. `source` is set.
//   withdrawn — money out. walletId is the source.
//   moved     — wallet-to-wallet. walletId → toWalletId. Net-zero overall,
//               so it is deliberately excluded from earned/spent totals.
// debt_out / debt_in — a debt board movement. Excluded from earned and spent
// totals: lending is not consumption and a repayment is not income. Both are
// your own money changing location.
export type MoneyMoveKind = 'earned' | 'withdrawn' | 'moved' | 'debt_out' | 'debt_in';
export type IncomeSource = 'salary' | 'freelance' | 'gift' | 'refund' | 'other';

export const INCOME_SOURCES: { key: IncomeSource; label: string; icon: string }[] = [
  { key: 'salary',    label: 'Salary',    icon: '💼' },
  { key: 'freelance', label: 'Freelance', icon: '💻' },
  { key: 'gift',      label: 'Gift',      icon: '🎁' },
  { key: 'refund',    label: 'Refund',    icon: '↩️' },
  { key: 'other',     label: 'Other',     icon: '✦'  },
];

export interface MoneyMove {
  id: string; kind: MoneyMoveKind; amount: number;
  walletId: string; toWalletId: string | null;
  source: IncomeSource | null; note: string; date: string;
}

// ── Debt board ──────────────────────────────────────────────────────────────
// A standalone ledger: settling a debt never moves a wallet balance. A person's
// balance is derived from their open entries, never stored.
export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface DebtPerson {
  id: string; name: string; emoji: string;
}

export interface DebtEntry {
  id: string; personId: string; direction: DebtDirection;
  amount: number; note: string; date: string;
  settledAt: string | null;      // null means open
  walletId: string | null;       // wallet the creation movement hit; null = none
  moveId: string | null;         // money_moves row created at creation
  settleMoveId: string | null;   // shared by every entry in one settle-up batch
}

// Positive = they owe you. Caller decides which entries to include; pass only
// open ones for a live balance.
export function netOf(entries: DebtEntry[]): number {
  return entries.reduce(
    (s, e) => s + (e.direction === 'owed_to_me' ? e.amount : -e.amount),
    0,
  );
}

export interface Bill {
  id: string; name: string; amount: number;
  paidMonths: string[]; // 'YYYY-MM' strings — resets each month naturally
}

export interface BudgetLine {
  id: string; name: string; icon: string;
  monthlyLimit: number; type: BudgetType; expenseCategory?: Category;
}

export interface Appliance {
  id: string; name: string; wattage: number;
  enabled: boolean;
  startedAt: string | null;
  totalMinutesThisMonth: number;
  lastResetMonth: string;
  pinnedToHome: boolean;
}

export interface ShopeePayment {
  id: string; month: string; amount: number; status: ShopeeStatus;
}

export interface EmergencyFundEntry {
  id: string; amount: number; date: string; note: string;
}

export interface Settings {
  monthlyIncome: number;
  paydayCycle: PaydayCycle;
  customPaydays: number[];
  emergencyFundTarget: number;
  monthlySavingsTarget: number;
  bills: Bill[];
  budgetLines: BudgetLine[];
  appliances: Appliance[];
  electricityRate: number;
  currency: string;
  categoryBudgets: Partial<Record<Category, number>>;
  customCategories: CustomCategory[];
  // Built-in categories the user has removed. They can't be deleted outright —
  // expenses already logged against them must keep resolving — so they're
  // hidden from the pickers and restorable.
  hiddenCategories: string[];
}

interface EmergencyFund {
  entries: EmergencyFundEntry[];
  currentAmount: number;
}

interface Computed {
  totalBalance: number;
  totalExpensesThisMonth: number;
  receivedThisMonth: number;
  projectedSavings: number;
  spendingPacePercent: number;
  daysUntilPayday: number;
  nextPaydayDate: Date | null;
  electricBillEstimate: number;
  shopeeRemainingBalance: number;
  shopeeDebtFreeDate: string | null;
}

interface AppContextValue extends Computed {
  wallets: Wallet[];
  expenses: Expense[];
  moneyMoves: MoneyMove[];
  settings: Settings;
  shopeeSchedule: ShopeePayment[];
  shopeeNewPurchaseLock: boolean;
  emergencyFund: EmergencyFund;
  dataLoading: boolean;
  addWallet: (w: Omit<Wallet, 'id'>) => Promise<void>;
  updateWallet: (id: string, updates: Partial<Wallet>) => Promise<void>;
  deleteWallet: (id: string) => Promise<void>;
  addExpense: (e: Omit<Expense, 'id' | 'date'>) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addIncome: (m: { walletId: string; amount: number; source: IncomeSource; note: string }) => Promise<void>;
  addWithdrawal: (m: { walletId: string; amount: number; note: string }) => Promise<void>;
  addTransfer: (m: { fromWalletId: string; toWalletId: string; amount: number; note: string }) => Promise<void>;
  deleteMoneyMove: (id: string) => Promise<void>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addShopeePayment: (p: Omit<ShopeePayment, 'id'>) => Promise<void>;
  updateShopeePayment: (id: string, updates: Partial<ShopeePayment>) => Promise<void>;
  deleteShopeePayment: (id: string) => Promise<void>;
  setShopeeNewPurchaseLock: (locked: boolean) => Promise<void>;
  addEmergencyFundEntry: (e: Omit<EmergencyFundEntry, 'id' | 'date'>) => Promise<void>;
  addBudgetLine: (b: Omit<BudgetLine, 'id'>) => Promise<void>;
  updateBudgetLine: (id: string, updates: Partial<BudgetLine>) => Promise<void>;
  deleteBudgetLine: (id: string) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
  logApplianceUsage: (id: string, minutes: number) => Promise<void>;
  refundApplianceUsage: (id: string, minutes: number) => Promise<void>;
  setAppliancePinned: (id: string, pinned: boolean) => Promise<void>;
  toggleBillPaid: (id: string) => Promise<void>;
  updateBill: (id: string, updates: { name?: string; amount?: number }) => Promise<void>;
  resetBalances: (walletBalances: Record<string, number>) => Promise<void>;
  debtPeople: DebtPerson[];
  debtEntries: DebtEntry[];
  totalOwedToMe: number;
  totalIOwe: number;
  addDebtPerson: (p: { name: string; emoji: string }) => Promise<string | null>;
  deleteDebtPerson: (id: string) => Promise<void>;
  addDebtEntry: (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
  }) => Promise<void>;
  deleteDebtEntry: (id: string) => Promise<void>;
  setDebtEntrySettled: (id: string, settled: boolean) => Promise<void>;
  settleUpPerson: (personId: string, walletId?: string | null) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function currentYYYYMM(): string {
  return new Date().toISOString().slice(0, 7);
}

export function getApplianceMinutes(a: Appliance): number {
  const month = currentYYYYMM();
  const base = a.lastResetMonth === month ? a.totalMinutesThisMonth : 0;
  if (a.enabled && a.startedAt) {
    return base + (Date.now() - new Date(a.startedAt).getTime()) / 60_000;
  }
  return base;
}

function computeNextPayday(settings: Settings): Date | null {
  const today = new Date();
  const d = today.getDate(), y = today.getFullYear(), m = today.getMonth();
  if (settings.paydayCycle === '1st-15th') return d < 15 ? new Date(y, m, 15) : new Date(y, m + 1, 1);
  if (settings.paydayCycle === 'monthly') return new Date(y, m + 1, 1);
  if (settings.customPaydays.length > 0) {
    const sorted = [...settings.customPaydays].sort((a, b) => a - b);
    const next = sorted.find(n => n > d);
    return next ? new Date(y, m, next) : new Date(y, m + 1, sorted[0]);
  }
  return null;
}

function daysUntil(date: Date | null): number {
  if (!date) return 0;
  const now = new Date(); now.setHours(0, 0, 0, 0); date.setHours(0, 0, 0, 0);
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / 86400000));
}

export function calcElectric(settings: Settings): number {
  return settings.appliances.reduce((s, a) => {
    return s + (a.wattage * (getApplianceMinutes(a) / 60) / 1000) * settings.electricityRate;
  }, 0);
}

// ─── DB mapping ───────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = Record<string, any>;

function fromDBSettings(r: Row): Partial<Settings> {
  return {
    monthlyIncome:      Number(r.monthly_income)       || 0,
    currency:           String(r.currency              || '₱'),
    paydayCycle:        (r.payday_cycle                || '1st-15th') as PaydayCycle,
    customPaydays:      (r.custom_paydays              || []) as number[],
    emergencyFundTarget: Number(r.emergency_fund_target) || 0,
    monthlySavingsTarget: Number(r.monthly_savings_target) || 0,
    electricityRate:    Number(r.electricity_rate)     || 11.8,
    categoryBudgets:    (r.category_budgets || {}) as Partial<Record<Category, number>>,
    customCategories:   (r.custom_categories || []) as CustomCategory[],
    hiddenCategories:   (r.hidden_categories || []) as string[],
  };
}

function toDBSettings(s: Partial<Settings>): Row {
  const m: Row = {};
  if ('monthlyIncome'       in s) m.monthly_income        = s.monthlyIncome;
  if ('currency'            in s) m.currency              = s.currency;
  if ('paydayCycle'         in s) m.payday_cycle          = s.paydayCycle;
  if ('customPaydays'       in s) m.custom_paydays        = s.customPaydays;
  if ('emergencyFundTarget' in s) m.emergency_fund_target  = s.emergencyFundTarget;
  if ('monthlySavingsTarget' in s) m.monthly_savings_target = s.monthlySavingsTarget;
  if ('electricityRate'     in s) m.electricity_rate      = s.electricityRate;
  if ('categoryBudgets'     in s) m.category_budgets      = s.categoryBudgets;
  if ('customCategories'    in s) m.custom_categories     = s.customCategories;
  if ('hiddenCategories'    in s) m.hidden_categories     = s.hiddenCategories;
  return m;
}

const fromDBWallet     = (r: Row): Wallet     => ({ id: r.id, name: r.name, icon: r.icon, balance: Number(r.balance) });
const fromDBBill       = (r: Row): Bill       => ({
  id: r.id, name: r.name, amount: Number(r.amount),
  paidMonths: (r.paid_months as string[]) || [],
});
const fromDBBudgetLine = (r: Row): BudgetLine => ({
  id: r.id, name: r.name, icon: r.icon,
  monthlyLimit: Number(r.monthly_limit), type: r.type as BudgetType,
  expenseCategory: r.expense_category ?? undefined,
});
const fromDBAppliance  = (r: Row): Appliance  => ({
  id: r.id, name: r.name, wattage: Number(r.wattage),
  enabled: Boolean(r.enabled), startedAt: r.started_at ?? null,
  totalMinutesThisMonth: Number(r.total_minutes_this_month) || 0,
  lastResetMonth: r.last_reset_month || '',
  pinnedToHome: Boolean(r.pinned_to_home),
});
const fromDBExpense    = (r: Row): Expense    => ({
  id: r.id, amount: Number(r.amount), category: r.category as Category,
  walletId: r.wallet_id, note: r.note || '', date: r.date,
});
const fromDBMoneyMove  = (r: Row): MoneyMove  => ({
  id: r.id, kind: r.kind as MoneyMoveKind, amount: Number(r.amount),
  walletId: r.wallet_id, toWalletId: r.to_wallet_id ?? null,
  source: (r.source ?? null) as IncomeSource | null,
  note: r.note || '', date: r.date,
});
const fromDBShopee     = (r: Row): ShopeePayment => ({
  id: r.id, month: String(r.month || '').slice(0, 7),
  amount: Number(r.amount), status: r.status as ShopeeStatus,
});
const fromDBEFEntry    = (r: Row): EmergencyFundEntry => ({
  id: r.id, amount: Number(r.amount), note: r.note || '', date: r.date,
});
const fromDBDebtPerson = (r: Row): DebtPerson => ({
  id: r.id, name: r.name, emoji: r.emoji || '🧑',
});
const fromDBDebtEntry  = (r: Row): DebtEntry => ({
  id: r.id, personId: r.person_id,
  direction: r.direction as DebtDirection,
  amount: Number(r.amount), note: r.note || '',
  date: r.date, settledAt: r.settled_at ?? null,
  walletId: r.wallet_id ?? null,
  moveId: r.move_id ?? null,
  settleMoveId: r.settle_move_id ?? null,
});

// ─── Defaults ────────────────────────────────────────────────────────────────

const defaultSettings: Settings = {
  monthlyIncome: 0, paydayCycle: '1st-15th', customPaydays: [1, 15],
  emergencyFundTarget: 0, monthlySavingsTarget: 0,
  bills: [], budgetLines: [], appliances: [],
  electricityRate: 11.8, currency: '₱',
  categoryBudgets: {},
  customCategories: [],
  hiddenCategories: [],
};

// ─── Context ─────────────────────────────────────────────────────────────────

const AppContext = createContext<AppContextValue | null>(null);

// ─── Provider ─────────────────────────────────────────────────────────────────

export function AppProvider({ children, userId }: { children: ReactNode; userId: string | null }) {
  const [wallets,              setWallets]              = useState<Wallet[]>([]);
  const [expenses,             setExpenses]             = useState<Expense[]>([]);
  const [moneyMoves,           setMoneyMoves]           = useState<MoneyMove[]>([]);
  const [settings,             setSettings]             = useState<Settings>(defaultSettings);
  const [shopeeSchedule,       setShopeeSchedule]       = useState<ShopeePayment[]>([]);
  const [shopeeNewPurchaseLock, setLock]                = useState(false);
  const [emergencyFund,        setEmergencyFund]        = useState<EmergencyFund>({ entries: [], currentAmount: 0 });
  const [dataLoading,          setDataLoading]          = useState(false);
  const [debtPeople,           setDebtPeople]           = useState<DebtPerson[]>([]);
  const [debtEntries,          setDebtEntries]          = useState<DebtEntry[]>([]);

  // ── Load / clear on auth change ──────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setWallets([]); setExpenses([]); setMoneyMoves([]); setSettings(defaultSettings);
      setShopeeSchedule([]); setLock(false);
      setEmergencyFund({ entries: [], currentAmount: 0 });
      setDebtPeople([]); setDebtEntries([]);
      return;
    }
    loadAll(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadAll(uid: string) {
    setDataLoading(true);
    const [sRes, wRes, eRes, mmRes, bRes, blRes, aRes, spRes, efRes, dpRes, deRes] = await Promise.all([
      supabase.from('settings').select('*').eq('user_id', uid).single(),
      supabase.from('wallets').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('expenses').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('money_moves').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('bills').select('*').eq('user_id', uid),
      supabase.from('budget_lines').select('*').eq('user_id', uid).order('sort_order'),
      supabase.from('appliances').select('*').eq('user_id', uid),
      supabase.from('shopee_payments').select('*').eq('user_id', uid).order('month'),
      supabase.from('emergency_fund_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('debt_people').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('debt_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
    ]);

    if (sRes.data) {
      setSettings({
        ...defaultSettings,
        ...fromDBSettings(sRes.data),
        bills:       (bRes.data  || []).map(fromDBBill),
        budgetLines: (blRes.data || []).map(fromDBBudgetLine),
        appliances:  (aRes.data  || []).map(fromDBAppliance),
      });
      setLock(Boolean(sRes.data.shopee_purchase_lock));
    }

    if (wRes.data)  setWallets(wRes.data.map(fromDBWallet));
    if (eRes.data)  setExpenses(eRes.data.map(fromDBExpense));
    if (mmRes.data) setMoneyMoves(mmRes.data.map(fromDBMoneyMove));
    if (spRes.data) setShopeeSchedule(spRes.data.map(fromDBShopee));
    if (efRes.data) {
      const entries = efRes.data.map(fromDBEFEntry);
      setEmergencyFund({ entries, currentAmount: entries.reduce((s, e) => s + e.amount, 0) });
    }
    if (dpRes.data) setDebtPeople(dpRes.data.map(fromDBDebtPerson));
    if (deRes.data) setDebtEntries(deRes.data.map(fromDBDebtEntry));
    setDataLoading(false);
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const computed = useMemo<Computed>(() => {
    const today = new Date();
    const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    });
    const totalExpensesThisMonth = monthExpenses.reduce((s, e) => s + e.amount, 0);
    // Actual money received this month. Kept separate from settings.monthlyIncome
    // (the planned figure) — no budget formula below reads this.
    const receivedThisMonth = moneyMoves
      .filter(mm => {
        if (mm.kind !== 'earned') return false;
        const d = new Date(mm.date);
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      })
      .reduce((s, mm) => s + mm.amount, 0);
    const totalBills = settings.bills.reduce((s, b) => s + b.amount, 0);
    const daysElapsed = today.getDate();
    const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
    const projectedSpending = daysElapsed > 0 ? (totalExpensesThisMonth / daysElapsed) * daysInMonth : 0;
    const projectedSavings = settings.monthlyIncome - totalBills - projectedSpending;
    const discretionary = settings.monthlyIncome - totalBills;
    const expectedSoFar = discretionary * (daysElapsed / daysInMonth);
    const spendingPacePercent = expectedSoFar > 0 ? (totalExpensesThisMonth / expectedSoFar) * 100 : 0;
    const nextPaydayDate = computeNextPayday(settings);
    const pending = shopeeSchedule.filter(p => p.status !== 'paid');
    return {
      totalBalance, totalExpensesThisMonth, receivedThisMonth, projectedSavings, spendingPacePercent,
      daysUntilPayday: daysUntil(nextPaydayDate ? new Date(nextPaydayDate) : null),
      nextPaydayDate,
      electricBillEstimate: calcElectric(settings),
      shopeeRemainingBalance: pending.reduce((s, p) => s + p.amount, 0),
      shopeeDebtFreeDate: pending.length > 0 ? pending[pending.length - 1].month : null,
    };
  }, [wallets, expenses, moneyMoves, settings, shopeeSchedule]);

  // Open entries only — settled debts are history, not balance.
  const debtTotals = useMemo(() => {
    const open = debtEntries.filter(e => !e.settledAt);
    return {
      totalOwedToMe: open.filter(e => e.direction === 'owed_to_me')
                         .reduce((s, e) => s + e.amount, 0),
      totalIOwe:     open.filter(e => e.direction === 'i_owe')
                         .reduce((s, e) => s + e.amount, 0),
    };
  }, [debtEntries]);

  // ── Wallets ───────────────────────────────────────────────────────────────
  const addWallet = async (w: Omit<Wallet, 'id'>) => {
    if (!userId) return;
    const { data } = await supabase.from('wallets')
      .insert({ user_id: userId, name: w.name, icon: w.icon, balance: w.balance })
      .select().single();
    if (data) setWallets(prev => [...prev, fromDBWallet(data)]);
  };

  const updateWallet = async (id: string, updates: Partial<Wallet>) => {
    setWallets(prev => prev.map(w => w.id === id ? { ...w, ...updates } : w));
    const db: Row = {};
    if ('balance' in updates) db.balance = updates.balance;
    if ('name'    in updates) db.name    = updates.name;
    if ('icon'    in updates) db.icon    = updates.icon;
    await supabase.from('wallets').update(db).eq('id', id);
  };

  const deleteWallet = async (id: string) => {
    setWallets(prev => prev.filter(w => w.id !== id));
    await supabase.from('wallets').delete().eq('id', id);
  };

  // ── Expenses ──────────────────────────────────────────────────────────────
  const addExpense = async (e: Omit<Expense, 'id' | 'date'>) => {
    if (!userId) return;
    const wallet = wallets.find(w => w.id === e.walletId);
    const newBalance = (wallet?.balance ?? 0) - e.amount;
    const now = new Date().toISOString();
    const tempId = crypto.randomUUID();

    // Optimistic
    setExpenses(prev => [{ ...e, id: tempId, date: now }, ...prev]);
    setWallets(prev => prev.map(w => w.id === e.walletId ? { ...w, balance: newBalance } : w));

    const [expRes] = await Promise.all([
      supabase.from('expenses').insert({
        user_id: userId, wallet_id: e.walletId, amount: e.amount,
        category: e.category, note: e.note, date: now,
      }).select().single(),
      supabase.from('wallets').update({ balance: newBalance }).eq('id', e.walletId),
    ]);
    if (expRes.data) {
      setExpenses(prev => prev.map(ex => ex.id === tempId ? fromDBExpense(expRes.data) : ex));
    }
  };

  const deleteExpense = async (id: string) => {
    const found = expenses.find(e => e.id === id);
    if (!found) return;
    const newBalance = (wallets.find(w => w.id === found.walletId)?.balance ?? 0) + found.amount;
    setExpenses(prev => prev.filter(e => e.id !== id));
    setWallets(prev => prev.map(w => w.id === found.walletId ? { ...w, balance: newBalance } : w));
    await Promise.all([
      supabase.from('expenses').delete().eq('id', id),
      supabase.from('wallets').update({ balance: newBalance }).eq('id', found.walletId),
    ]);
  };

  // ── Money moves (top-ups, withdrawals, transfers) ─────────────────────────
  // Every balance change outside of expenses goes through here so it leaves a
  // record. Balances are applied optimistically, then persisted alongside the row.
  const recordMove = async (
    move: Omit<MoneyMove, 'id' | 'date'>,
    balanceUpdates: Record<string, number>,
    date?: string,
  ): Promise<string | null> => {
    if (!userId) return null;
    // Debt movements are dated to the debt itself, which may be days ago.
    const now = date ?? new Date().toISOString();
    const tempId = crypto.randomUUID();

    setMoneyMoves(prev => [{ ...move, id: tempId, date: now }, ...prev]);
    setWallets(prev => prev.map(w => w.id in balanceUpdates ? { ...w, balance: balanceUpdates[w.id] } : w));

    const [moveRes] = await Promise.all([
      supabase.from('money_moves').insert({
        user_id: userId, kind: move.kind, amount: move.amount,
        wallet_id: move.walletId, to_wallet_id: move.toWalletId,
        source: move.source, note: move.note, date: now,
      }).select().single(),
      ...Object.entries(balanceUpdates).map(([id, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', id)
      ),
    ]);
    if (moveRes.data) {
      setMoneyMoves(prev => prev.map(m => m.id === tempId ? fromDBMoneyMove(moveRes.data) : m));
      return moveRes.data.id as string;
    }
    return null;
  };

  const balanceOf = (id: string) => wallets.find(w => w.id === id)?.balance ?? 0;

  // These three discard recordMove's id — only the debt board needs it.
  const addIncome = async (m: { walletId: string; amount: number; source: IncomeSource; note: string }) => {
    await recordMove(
      { kind: 'earned', amount: m.amount, walletId: m.walletId, toWalletId: null, source: m.source, note: m.note },
      { [m.walletId]: balanceOf(m.walletId) + m.amount },
    );
  };

  const addWithdrawal = async (m: { walletId: string; amount: number; note: string }) => {
    await recordMove(
      { kind: 'withdrawn', amount: m.amount, walletId: m.walletId, toWalletId: null, source: null, note: m.note },
      { [m.walletId]: balanceOf(m.walletId) - m.amount },
    );
  };

  const addTransfer = async (m: { fromWalletId: string; toWalletId: string; amount: number; note: string }) => {
    await recordMove(
      { kind: 'moved', amount: m.amount, walletId: m.fromWalletId, toWalletId: m.toWalletId, source: null, note: m.note },
      {
        [m.fromWalletId]: balanceOf(m.fromWalletId) - m.amount,
        [m.toWalletId]:   balanceOf(m.toWalletId)   + m.amount,
      },
    );
  };

  const deleteMoneyMove = async (id: string) => {
    const found = moneyMoves.find(m => m.id === id);
    if (!found) return;

    // Undo whatever the move did to the wallets it touched.
    const updates: Record<string, number> = {};
    if (found.kind === 'earned') {
      updates[found.walletId] = balanceOf(found.walletId) - found.amount;
    } else if (found.kind === 'withdrawn') {
      updates[found.walletId] = balanceOf(found.walletId) + found.amount;
    } else if (found.toWalletId) {
      updates[found.walletId]   = balanceOf(found.walletId)   + found.amount;
      updates[found.toWalletId] = balanceOf(found.toWalletId) - found.amount;
    }

    setMoneyMoves(prev => prev.filter(m => m.id !== id));
    setWallets(prev => prev.map(w => w.id in updates ? { ...w, balance: updates[w.id] } : w));

    await Promise.all([
      supabase.from('money_moves').delete().eq('id', id),
      ...Object.entries(updates).map(([wid, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', wid)
      ),
    ]);
  };

  // ── Debt board ────────────────────────────────────────────────────────────
  // Undo a set of debt movements: put the money back and delete the records.
  //
  // Deltas are summed per wallet BEFORE any balance is computed. `balanceOf`
  // reads React state, which does not update between iterations of a loop, so
  // reversing moves one at a time would compute every new balance from the same
  // stale figure and the last write would win — silently corrupting the balance
  // whenever one wallet is hit twice (deleting a person with two linked entries
  // on the same wallet does exactly that).
  const reverseMoves = async (moveIds: string[]) => {
    const ids = moveIds.filter(Boolean);
    if (ids.length === 0) return;
    const targets = moneyMoves.filter(m => ids.includes(m.id));
    if (targets.length === 0) return;

    const deltas: Record<string, number> = {};
    for (const mv of targets) {
      deltas[mv.walletId] = (deltas[mv.walletId] ?? 0)
        + (mv.kind === 'debt_in' ? -mv.amount : mv.amount);
    }

    const newBalances: Record<string, number> = {};
    for (const [wid, d] of Object.entries(deltas)) newBalances[wid] = balanceOf(wid) + d;

    setMoneyMoves(prev => prev.filter(m => !ids.includes(m.id)));
    setWallets(prev => prev.map(w => w.id in newBalances ? { ...w, balance: newBalances[w.id] } : w));

    await Promise.all([
      supabase.from('money_moves').delete().in('id', ids),
      ...Object.entries(newBalances).map(([wid, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', wid)
      ),
    ]);
  };

  // Not optimistic: the caller needs the real row id to reference as a foreign
  // key on the entry it inserts next.
  const addDebtPerson = async (p: { name: string; emoji: string }): Promise<string | null> => {
    if (!userId) return null;
    const { data } = await supabase.from('debt_people').insert({
      user_id: userId, name: p.name, emoji: p.emoji,
    }).select().single();
    if (!data) return null;
    setDebtPeople(prev => [...prev, fromDBDebtPerson(data)]);
    return data.id as string;
  };

  // The DB cascades their entries; mirror that locally so the UI matches.
  const deleteDebtPerson = async (id: string) => {
    setDebtPeople(prev => prev.filter(p => p.id !== id));
    setDebtEntries(prev => prev.filter(e => e.personId !== id));
    await supabase.from('debt_people').delete().eq('id', id);
  };

  // Not optimistic: with a wallet set it must await the move to learn its id,
  // and running two code paths — one optimistic, one not — is more bug surface
  // than the sheet's existing "Saving…" state is worth.
  const addDebtEntry = async (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
  }) => {
    if (!userId) return;
    const walletId = e.walletId || null;
    const name = debtPeople.find(p => p.id === e.personId)?.name ?? 'someone';

    // The movement is inserted first so the entry can reference it. A failure
    // between the two leaves a bare movement in the feed — visible and
    // deletable — rather than an entry claiming a movement that never happened.
    let moveId: string | null = null;
    if (walletId) {
      const out = e.direction === 'owed_to_me';
      moveId = await recordMove(
        {
          kind: out ? 'debt_out' : 'debt_in',
          amount: e.amount, walletId, toWalletId: null, source: null,
          note: out ? `Spotted ${name}` : `Borrowed from ${name}`,
        },
        { [walletId]: balanceOf(walletId) + (out ? -e.amount : e.amount) },
        e.date,
      );
    }

    const { data } = await supabase.from('debt_entries').insert({
      user_id: userId, person_id: e.personId, direction: e.direction,
      amount: e.amount, note: e.note, date: e.date,
      wallet_id: walletId, move_id: moveId,
    }).select().single();

    if (data) setDebtEntries(prev => [fromDBDebtEntry(data), ...prev]);
  };

  const deleteDebtEntry = async (id: string) => {
    setDebtEntries(prev => prev.filter(e => e.id !== id));
    await supabase.from('debt_entries').delete().eq('id', id);
  };

  const setDebtEntrySettled = async (id: string, settled: boolean) => {
    const settledAt = settled ? new Date().toISOString() : null;
    setDebtEntries(prev => prev.map(e => e.id === id ? { ...e, settledAt } : e));
    await supabase.from('debt_entries').update({ settled_at: settledAt }).eq('id', id);
  };

  // Clears every open entry for one person. With a wallet, the NET moves — not
  // any row's face value — because squaring up is one exchange of one amount.
  // A zero net means the entries cancel out and no money changes hands.
  const settleUpPerson = async (personId: string, walletId?: string | null) => {
    const open = debtEntries.filter(e => e.personId === personId && !e.settledAt);
    if (open.length === 0) return;

    const net = netOf(open);
    const settledAt = new Date().toISOString();
    const name = debtPeople.find(p => p.id === personId)?.name ?? 'someone';

    let moveId: string | null = null;
    if (walletId && net !== 0) {
      const incoming = net > 0;
      const amount = Math.abs(net);
      moveId = await recordMove(
        {
          kind: incoming ? 'debt_in' : 'debt_out',
          amount, walletId, toWalletId: null, source: null,
          note: incoming ? `${name} settled up` : `Settled up with ${name}`,
        },
        { [walletId]: balanceOf(walletId) + (incoming ? amount : -amount) },
      );
    }

    setDebtEntries(prev => prev.map(
      e => e.personId === personId && !e.settledAt
        ? { ...e, settledAt, settleMoveId: moveId }
        : e
    ));

    // Still filtered on the server by `settled_at is null` — the local state
    // above has changed but the rows have not been written yet.
    await supabase.from('debt_entries')
      .update({ settled_at: settledAt, settle_move_id: moveId })
      .eq('person_id', personId)
      .is('settled_at', null);
  };

  // ── Settings (scalar fields + bills + appliances) ─────────────────────────
  const updateSettings = async (updates: Partial<Settings>) => {
    setSettings(prev => ({ ...prev, ...updates }));
    if (!userId) return;

    const { bills, budgetLines: _bl, appliances, ...scalar } = updates;

    // Scalar settings row
    const dbScalar = toDBSettings(scalar);
    if (Object.keys(dbScalar).length > 0) {
      const { error } = await supabase.from('settings').update(dbScalar).eq('user_id', userId);
      // State above was set optimistically, so a rejected write — a column that
      // doesn't exist yet, an RLS denial — otherwise looks fine until the next reload.
      if (error) console.error('settings update failed:', error.message, Object.keys(dbScalar));
    }

    // Bills — detect add or remove
    if (bills !== undefined) {
      const current = settings.bills;
      if (bills.length > current.length) {
        const added = bills.filter(b => !current.some(c => c.id === b.id));
        for (const b of added) {
          await supabase.from('bills').insert({ id: b.id, user_id: userId, name: b.name, amount: b.amount, paid_months: b.paidMonths ?? [] });
        }
      } else {
        const removed = current.filter(c => !bills.some(b => b.id === c.id));
        for (const r of removed) {
          await supabase.from('bills').delete().eq('id', r.id);
        }
      }
    }

    // Appliances — detect add, remove, or edit
    if (appliances !== undefined) {
      const current = settings.appliances;
      if (appliances.length > current.length) {
        const added = appliances.filter(a => !current.some(c => c.id === a.id));
        for (const a of added) {
          await supabase.from('appliances').insert({
            id: a.id, user_id: userId, name: a.name, wattage: a.wattage,
            enabled: a.enabled, started_at: a.startedAt,
            total_minutes_this_month: a.totalMinutesThisMonth,
            last_reset_month: a.lastResetMonth,
          });
        }
      } else if (appliances.length < current.length) {
        const removed = current.filter(c => !appliances.some(a => a.id === c.id));
        for (const r of removed) {
          await supabase.from('appliances').delete().eq('id', r.id);
        }
      } else {
        // Edit (name or wattage changed)
        for (const a of appliances) {
          const orig = current.find(c => c.id === a.id);
          if (orig && (orig.name !== a.name || orig.wattage !== a.wattage)) {
            await supabase.from('appliances').update({ name: a.name, wattage: a.wattage }).eq('id', a.id);
          }
        }
      }
    }
  };

  // ── Shopee ────────────────────────────────────────────────────────────────
  const addShopeePayment = async (p: Omit<ShopeePayment, 'id'>) => {
    if (!userId) return;
    const { data } = await supabase.from('shopee_payments')
      .insert({ user_id: userId, month: p.month + '-01', amount: p.amount, status: p.status })
      .select().single();
    if (data) setShopeeSchedule(prev => [...prev, fromDBShopee(data)]);
  };

  const updateShopeePayment = async (id: string, updates: Partial<ShopeePayment>) => {
    setShopeeSchedule(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    const db: Row = {};
    if ('status' in updates) {
      db.status = updates.status;
      if (updates.status === 'paid') db.paid_at = new Date().toISOString();
    }
    if ('amount' in updates) db.amount = updates.amount;
    if ('month'  in updates) db.month  = updates.month + '-01';
    await supabase.from('shopee_payments').update(db).eq('id', id);
  };

  const deleteShopeePayment = async (id: string) => {
    setShopeeSchedule(prev => prev.filter(p => p.id !== id));
    await supabase.from('shopee_payments').delete().eq('id', id);
  };

  const setShopeeNewPurchaseLock = async (locked: boolean) => {
    setLock(locked);
    if (userId) await supabase.from('settings').update({ shopee_purchase_lock: locked }).eq('user_id', userId);
  };

  // ── Emergency Fund ────────────────────────────────────────────────────────
  const addEmergencyFundEntry = async (e: Omit<EmergencyFundEntry, 'id' | 'date'>) => {
    if (!userId) return;
    const { data } = await supabase.from('emergency_fund_entries')
      .insert({ user_id: userId, amount: e.amount, note: e.note, date: new Date().toISOString() })
      .select().single();
    if (data) {
      const entry = fromDBEFEntry(data);
      setEmergencyFund(prev => ({
        entries: [entry, ...prev.entries],
        currentAmount: prev.currentAmount + entry.amount,
      }));
    }
  };

  // ── Budget Lines ──────────────────────────────────────────────────────────
  const addBudgetLine = async (b: Omit<BudgetLine, 'id'>) => {
    if (!userId) return;
    const { data } = await supabase.from('budget_lines').insert({
      user_id: userId, name: b.name, icon: b.icon,
      monthly_limit: b.monthlyLimit, type: b.type,
      expense_category: b.expenseCategory || null,
      sort_order: settings.budgetLines.length,
    }).select().single();
    if (data) setSettings(prev => ({ ...prev, budgetLines: [...prev.budgetLines, fromDBBudgetLine(data)] }));
  };

  const updateBudgetLine = async (id: string, updates: Partial<BudgetLine>) => {
    setSettings(prev => ({
      ...prev,
      budgetLines: prev.budgetLines.map(b => b.id === id ? { ...b, ...updates } : b),
    }));
    const db: Row = {};
    if ('name'             in updates) db.name             = updates.name;
    if ('icon'             in updates) db.icon             = updates.icon;
    if ('monthlyLimit'     in updates) db.monthly_limit    = updates.monthlyLimit;
    if ('type'             in updates) db.type             = updates.type;
    if ('expenseCategory'  in updates) db.expense_category = updates.expenseCategory || null;
    await supabase.from('budget_lines').update(db).eq('id', id);
  };

  const deleteBudgetLine = async (id: string) => {
    setSettings(prev => ({ ...prev, budgetLines: prev.budgetLines.filter(b => b.id !== id) }));
    await supabase.from('budget_lines').delete().eq('id', id);
  };

  // ── Appliances (live toggle + manual log) ─────────────────────────────────
  const toggleAppliance = async (id: string) => {
    const now = new Date();
    const month = currentYYYYMM();
    const appl = settings.appliances.find(a => a.id === id);
    if (!appl) return;
    const base = appl.lastResetMonth === month ? appl.totalMinutesThisMonth : 0;

    let local: Partial<Appliance>;
    let db: Row;
    if (appl.enabled && appl.startedAt) {
      const sessionMin = (now.getTime() - new Date(appl.startedAt).getTime()) / 60_000;
      local = { enabled: false, startedAt: null, totalMinutesThisMonth: base + sessionMin, lastResetMonth: month };
      db    = { enabled: false, started_at: null, total_minutes_this_month: base + sessionMin, last_reset_month: month };
    } else {
      local = { enabled: true, startedAt: now.toISOString(), totalMinutesThisMonth: base, lastResetMonth: month };
      db    = { enabled: true, started_at: now.toISOString(), total_minutes_this_month: base, last_reset_month: month };
    }
    setSettings(prev => ({ ...prev, appliances: prev.appliances.map(a => a.id === id ? { ...a, ...local } : a) }));
    await supabase.from('appliances').update(db).eq('id', id);
  };

  const setAppliancePinned = async (id: string, pinned: boolean) => {
    setSettings(prev => ({
      ...prev,
      appliances: prev.appliances.map(a => a.id === id ? { ...a, pinnedToHome: pinned } : a),
    }));
    await supabase.from('appliances').update({ pinned_to_home: pinned }).eq('id', id);
  };

  const toggleBillPaid = async (id: string) => {
    const month = currentYYYYMM();
    const bill = settings.bills.find(b => b.id === id);
    if (!bill) return;
    const isPaid = bill.paidMonths.includes(month);
    const newPaidMonths = isPaid
      ? bill.paidMonths.filter(m => m !== month)
      : [...bill.paidMonths, month];
    setSettings(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, paidMonths: newPaidMonths } : b),
    }));
    await supabase.from('bills').update({ paid_months: newPaidMonths }).eq('id', id);
  };

  const updateBill = async (id: string, updates: { name?: string; amount?: number }) => {
    setSettings(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, ...updates } : b),
    }));
    const db: Row = {};
    if ('name'   in updates) db.name   = updates.name;
    if ('amount' in updates) db.amount = updates.amount;
    await supabase.from('bills').update(db).eq('id', id);
  };

  const logApplianceUsage = async (id: string, minutes: number) => {
    const month = currentYYYYMM();
    const appl = settings.appliances.find(a => a.id === id);
    if (!appl) return;
    const base = appl.lastResetMonth === month ? appl.totalMinutesThisMonth : 0;
    const newTotal = base + minutes;
    setSettings(prev => ({
      ...prev,
      appliances: prev.appliances.map(a =>
        a.id === id ? { ...a, totalMinutesThisMonth: newTotal, lastResetMonth: month } : a
      ),
    }));
    await supabase.from('appliances').update({ total_minutes_this_month: newTotal, last_reset_month: month }).eq('id', id);
  };

  // ── Reset ─────────────────────────────────────────────────────────────────
  // Fresh start: overwrite wallet balances, wipe this month's expenses, and
  // zero out this month's appliance usage (stopping any running appliance).
  const resetBalances = async (walletBalances: Record<string, number>) => {
    if (!userId) return;
    const month = currentYYYYMM();
    const monthStart = `${month}-01T00:00:00.000Z`;
    const [y, m] = month.split('-').map(Number);
    const nextMonth = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
    const nextStart = `${nextMonth}-01T00:00:00.000Z`;

    // Optimistic local updates
    setWallets(prev => prev.map(w => w.id in walletBalances ? { ...w, balance: walletBalances[w.id] } : w));
    setExpenses(prev => prev.filter(e => !(e.date >= monthStart && e.date < nextStart)));
    setMoneyMoves(prev => prev.filter(m => !(m.date >= monthStart && m.date < nextStart)));
    setSettings(prev => ({
      ...prev,
      appliances: prev.appliances.map(a => ({
        ...a, enabled: false, startedAt: null,
        totalMinutesThisMonth: 0, lastResetMonth: month,
      })),
    }));

    // Persist
    await Promise.all([
      ...Object.entries(walletBalances).map(([id, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', id)
      ),
      supabase.from('expenses').delete()
        .eq('user_id', userId).gte('date', monthStart).lt('date', nextStart),
      supabase.from('money_moves').delete()
        .eq('user_id', userId).gte('date', monthStart).lt('date', nextStart),
      ...settings.appliances.map(a =>
        supabase.from('appliances').update({
          enabled: false, started_at: null,
          total_minutes_this_month: 0, last_reset_month: month,
        }).eq('id', a.id)
      ),
    ]);
  };

  const refundApplianceUsage = async (id: string, minutes: number) => {
    const month = currentYYYYMM();
    const appl = settings.appliances.find(a => a.id === id);
    if (!appl) return;
    const base = appl.lastResetMonth === month ? appl.totalMinutesThisMonth : 0;
    const newTotal = Math.max(0, base - minutes);
    setSettings(prev => ({
      ...prev,
      appliances: prev.appliances.map(a =>
        a.id === id ? { ...a, totalMinutesThisMonth: newTotal, lastResetMonth: month } : a
      ),
    }));
    await supabase.from('appliances').update({ total_minutes_this_month: newTotal, last_reset_month: month }).eq('id', id);
  };

  return (
    <AppContext.Provider value={{
      wallets, expenses, moneyMoves, settings, shopeeSchedule, shopeeNewPurchaseLock,
      emergencyFund, dataLoading,
      ...computed,
      addWallet, updateWallet, deleteWallet,
      addExpense, deleteExpense,
      addIncome, addWithdrawal, addTransfer, deleteMoneyMove,
      updateSettings,
      addShopeePayment, updateShopeePayment, deleteShopeePayment,
      setShopeeNewPurchaseLock,
      addEmergencyFundEntry,
      addBudgetLine, updateBudgetLine, deleteBudgetLine,
      toggleAppliance, logApplianceUsage, refundApplianceUsage, setAppliancePinned, toggleBillPaid,
      updateBill,
      resetBalances,
      debtPeople, debtEntries,
      ...debtTotals,
      addDebtPerson, deleteDebtPerson,
      addDebtEntry, deleteDebtEntry, setDebtEntrySettled, settleUpPerson,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

export function fmt(amount: number, currency = '₱'): string {
  return `${amount < 0 ? '-' : ''}${currency}${Math.abs(amount).toLocaleString('en-PH', {
    minimumFractionDigits: 2, maximumFractionDigits: 2,
  })}`;
}
