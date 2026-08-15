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
  // null means another person paid for this, so no wallet of yours moved.
  walletId: string | null; note: string; date: string;
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
  expenseId: string | null;      // the expense that produced this row; null = standalone debt
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
  // Wallet the salary lands in. Lets the payday prompt be one tap instead of
  // a form. null = not chosen yet, so the prompt asks which wallet.
  cashflowWalletId: string | null;
  // Which scheduled paydays have been accounted for, keyed by local ISO day.
  // A payday absent from here that is already due is treated as NOT received.
  paydayLog: Record<string, PaydayStatus>;
}

// 'received'  — confirmed, an `earned` move was written.
// 'dismissed' — don't count it and stop asking. Covers both "it never came"
//               and "I already logged it by hand on the Wallets page".
export type PaydayStatus = 'received' | 'dismissed';

export interface PendingPayday {
  date: string;    // local ISO day, 'YYYY-MM-DD'
  amount: number;  // monthlyIncome split across the month's paydays
}

interface EmergencyFund {
  entries: EmergencyFundEntry[];
  currentAmount: number;
}

interface Computed {
  totalBalance: number;
  totalExpensesThisMonth: number;
  receivedThisMonth: number;
  /**
   * End-of-month savings, deliberately conservative. Every error term in the
   * old formula pushed this number up — an unlogged expense, an untracked day,
   * income assumed to have arrived — so the headline figure is now the
   * pessimistic end and `optimisticSavings` is the stretch.
   */
  projectedSavings: number;
  /** Best case: every scheduled payday lands and nothing more is spent. */
  optimisticSavings: number;
  /** Income that was due but has not been confirmed. Excluded from the projection. */
  unconfirmedIncome: number;
  pendingPaydays: PendingPayday[];
  /** Days this month that predate the first recorded expense. */
  untrackedDays: number;
  trackedDays: number;
  /** What the untracked days were charged, at the user's own budgeted rate. */
  blindSpend: number;
  /** Recorded + blind + projected-remaining spending for the whole month. */
  assumedSpending: number;
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
  addExpense: (e: {
    amount: number;                                   // what the payer paid out
    category: Category;
    note: string;
    walletId: string | null;                          // null = a person paid
    paidByPersonId?: string | null;                   // set when walletId is null
    owedToMe?: { personId: string; amount: number }[];// set when a wallet paid
  }) => Promise<void>;
  deleteExpense: (id: string) => Promise<void>;
  addIncome: (m: { walletId: string; amount: number; source: IncomeSource; note: string }) => Promise<void>;
  /** Record a due payday as received: writes an `earned` move and logs the date. */
  confirmPayday: (date: string, amount: number, walletId: string) => Promise<void>;
  /** Stop counting and stop asking about a due payday. */
  dismissPayday: (date: string) => Promise<void>;
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
  resetAccount: () => Promise<void>;
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
    /** Overrides the money-move note. A repayment is not a new loan and
     *  should not read like one in the transactions feed. */
    moveNote?: string;
    expenseId?: string | null;
    walletBalanceAfter?: number;
  }) => Promise<void>;
  deleteDebtEntry: (id: string) => Promise<void>;
  setDebtEntrySettled: (id: string, settled: boolean, walletId?: string | null) => Promise<void>;
  settleUpPerson: (personId: string, walletId?: string | null) => Promise<void>;
  reverseSettleBatch: (settleMoveId: string) => Promise<void>;
  recordDebtPayment: (personId: string, amount: number, walletId: string) => Promise<void>;
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

// Local ISO day. Deliberately not toISOString() — that converts to UTC first,
// which in PH (UTC+8) reports the previous day for anything before 08:00.
export function isoDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Every payday falling in a given month, ascending. A payday set to the 31st
// still has to land in a 30-day month, so days are clamped to the month's end.
export function paydaysInMonth(settings: Settings, year: number, month: number): Date[] {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days =
    settings.paydayCycle === '1st-15th' ? [1, 15]
    : settings.paydayCycle === 'monthly' ? [1]
    : settings.customPaydays;
  const clamped = [...new Set(days.map(d => Math.min(Math.max(d, 1), lastDay)))];
  return clamped.sort((a, b) => a - b).map(d => new Date(year, month, d));
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
    cashflowWalletId:   (r.cashflow_wallet_id ?? null) as string | null,
    paydayLog:          (r.payday_log || {}) as Record<string, PaydayStatus>,
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
  if ('cashflowWalletId'    in s) m.cashflow_wallet_id    = s.cashflowWalletId;
  if ('paydayLog'           in s) m.payday_log            = s.paydayLog;
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
  walletId: r.wallet_id ?? null, note: r.note || '', date: r.date,
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
  expenseId: r.expense_id ?? null,
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
  cashflowWalletId: null,
  paydayLog: {},
};

// Days of real data before the observed spending rate is trusted on its own.
// Below this the projection leans on the user's own budgeted rate instead —
// one grocery run on day 2 should not set the pace for the whole month.
const RATE_RAMP_DAYS = 5;

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

    // ── Income ───────────────────────────────────────────────────────────────
    // A payday that has come and gone without confirmation is NOT counted: the
    // money was due and there is no evidence it arrived. Future paydays are
    // counted — dropping those would be pessimistic rather than realistic.
    const paydays = paydaysInMonth(settings, today.getFullYear(), today.getMonth());
    const perPayday = paydays.length > 0 ? settings.monthlyIncome / paydays.length : 0;
    const pendingPaydays: PendingPayday[] = paydays
      .filter(d => d.getDate() <= daysElapsed && !settings.paydayLog[isoDay(d)])
      .map(d => ({ date: isoDay(d), amount: perPayday }));
    const unconfirmedIncome = pendingPaydays.reduce((s, p) => s + p.amount, 0);
    const futureIncome = paydays.filter(d => d.getDate() > daysElapsed).length * perPayday;
    // receivedThisMonth is real `earned` money, so a confirmed payday is already
    // in it — adding perPayday again here would double-count.
    const projectedIncome = receivedThisMonth + futureIncome;

    // ── Spending ─────────────────────────────────────────────────────────────
    // Tracking begins at the first expense ever recorded. Days in this month
    // before that are unobserved, and charging them zero is what made the old
    // projection wildly optimistic for anyone who signed up mid-month.
    const firstExpenseDate = expenses.reduce<string | null>(
      (min, e) => (min === null || e.date < min ? e.date : min), null,
    );
    const trackingStart = firstExpenseDate ? new Date(firstExpenseDate) : today;
    const startedThisMonth =
      trackingStart.getMonth() === today.getMonth() &&
      trackingStart.getFullYear() === today.getFullYear();
    const untrackedDays = startedThisMonth ? Math.max(0, trackingStart.getDate() - 1) : 0;
    const trackedDays = Math.max(1, daysElapsed - untrackedDays);
    const remainingDays = Math.max(0, daysInMonth - daysElapsed);

    // What the user's own plan says a day costs, once bills and the savings
    // target are set aside. Used both to price unobserved days and to steady
    // the projection while there is too little real data to extrapolate from.
    const budgetRate = Math.max(
      0, settings.monthlyIncome - totalBills - settings.monthlySavingsTarget,
    ) / daysInMonth;
    const blindSpend = untrackedDays * budgetRate;
    const observedRate = totalExpensesThisMonth / trackedDays;
    const w = Math.min(trackedDays, RATE_RAMP_DAYS) / RATE_RAMP_DAYS;
    const rate = w * observedRate + (1 - w) * budgetRate;
    const assumedSpending = totalExpensesThisMonth + blindSpend + remainingDays * rate;

    const projectedSavings = projectedIncome - totalBills - assumedSpending;
    // Everything goes right: the due paydays did land, and nothing more is spent.
    const optimisticSavings =
      (projectedIncome + unconfirmedIncome) - totalBills - (totalExpensesThisMonth + blindSpend);

    // Pace counts the blind days too, so this card and the projection tell the
    // same story instead of contradicting each other.
    const discretionary = settings.monthlyIncome - totalBills;
    const expectedSoFar = discretionary * (daysElapsed / daysInMonth);
    const spendingPacePercent = expectedSoFar > 0
      ? ((totalExpensesThisMonth + blindSpend) / expectedSoFar) * 100
      : 0;
    const nextPaydayDate = computeNextPayday(settings);
    const pending = shopeeSchedule.filter(p => p.status !== 'paid');
    return {
      totalBalance, totalExpensesThisMonth, receivedThisMonth, projectedSavings, spendingPacePercent,
      optimisticSavings, unconfirmedIncome, pendingPaydays,
      untrackedDays, trackedDays, blindSpend, assumedSpending,
      daysUntilPayday: daysUntil(nextPaydayDate ? new Date(nextPaydayDate) : null),
      nextPaydayDate,
      electricBillEstimate: calcElectric(settings),
      shopeeRemainingBalance: pending.reduce((s, p) => s + p.amount, 0),
      shopeeDebtFreeDate: pending.length > 0 ? pending[pending.length - 1].month : null,
    };
  }, [wallets, expenses, moneyMoves, settings, shopeeSchedule]);

  // Open entries only — settled debts are history, not balance.
  //
  // Netted per person, not summed gross. One person cannot both owe you and be
  // owed by you at the same time; only their balance is real. Summing face
  // values would count a part-paid debt on both sides and report a position
  // that matches no card on the page.
  const debtTotals = useMemo(() => {
    const netByPerson = new Map<string, number>();
    for (const e of debtEntries) {
      if (e.settledAt) continue;
      const signed = e.direction === 'owed_to_me' ? e.amount : -e.amount;
      netByPerson.set(e.personId, (netByPerson.get(e.personId) ?? 0) + signed);
    }

    let totalOwedToMe = 0;
    let totalIOwe = 0;
    for (const net of netByPerson.values()) {
      if (net > 0) totalOwedToMe += net;
      else if (net < 0) totalIOwe -= net;
    }
    return { totalOwedToMe, totalIOwe };
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
    // Otherwise the payday prompt would prefill a wallet that no longer exists.
    if (settings.cashflowWalletId === id) await updateSettings({ cashflowWalletId: null });
    await supabase.from('wallets').delete().eq('id', id);
  };

  // ── Expenses ──────────────────────────────────────────────────────────────
  // An expense records what YOU consumed. The amount passed here is what the
  // payer handed over; anything owed back to you becomes debt rows instead.
  //
  //   wallet paid → your share is the amount minus what others owe you
  //   person paid → the total is irrelevant (you do not track their finances),
  //                 so the amount IS your share and you owe all of it
  const addExpense = async (e: {
    amount: number; category: Category; note: string;
    walletId: string | null;
    paidByPersonId?: string | null;
    owedToMe?: { personId: string; amount: number }[];
  }) => {
    if (!userId) return;
    const owed = e.walletId ? (e.owedToMe ?? []) : [];
    const myShare = round2(e.walletId
      ? e.amount - owed.reduce((s, o) => s + o.amount, 0)
      : e.amount);

    // Over-allocating is incoherent: more is owed back to you than was paid out.
    // The UI blocks it, but this is a money boundary and it defends itself rather
    // than trusting every future caller.
    if (myShare < 0) return;

    const now = new Date().toISOString();

    // Inserted first, and NOT optimistically: the debt rows below need the real
    // expense id as a foreign key. A share of zero (you spotted someone the
    // whole thing) writes no expense at all rather than a ₱0 row that would
    // clutter the feed and the category totals.
    // ONE running balance owns every deduction below. `balanceOf` and the
    // `wallets` state both read the value captured in this render and do NOT
    // update across awaits, so reading either one again after the first write
    // would compute from a stale figure and the last write would win —
    // silently losing the difference. Read the wallet exactly once, here.
    let running = e.walletId
      ? (wallets.find(w => w.id === e.walletId)?.balance ?? 0)
      : 0;

    let expenseId: string | null = null;
    if (myShare > 0) {
      const newBalance = e.walletId ? round2(running - myShare) : null;
      if (newBalance !== null) running = newBalance;

      const [expRes] = await Promise.all([
        supabase.from('expenses').insert({
          user_id: userId, wallet_id: e.walletId, amount: myShare,
          category: e.category, note: e.note, date: now,
        }).select().single(),
        ...(newBalance !== null && e.walletId
          ? [supabase.from('wallets').update({ balance: newBalance }).eq('id', e.walletId)]
          : []),
      ]);

      if (expRes.data) {
        expenseId = expRes.data.id as string;
        setExpenses(prev => [fromDBExpense(expRes.data), ...prev]);
      }
      if (newBalance !== null) {
        setWallets(prev => prev.map(w => w.id === e.walletId ? { ...w, balance: newBalance } : w));
      }
    }

    // Sequential, and each call is handed the balance it must leave behind.
    // Letting addDebtEntry compute its own would reintroduce the stale read
    // described above the moment two people share a wallet.
    if (e.walletId) {
      for (const o of owed) {
        running = round2(running - o.amount);
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: e.note, date: now,
          walletId: e.walletId, expenseId,
          walletBalanceAfter: running,
        });
      }
    } else if (e.paidByPersonId) {
      // No wallet, so no movement and no balance to hand over.
      await addDebtEntry({
        personId: e.paidByPersonId, direction: 'i_owe',
        amount: myShare, note: e.note, date: now,
        walletId: null, expenseId,
      });
    }
  };

  const deleteExpense = async (id: string) => {
    const found = expenses.find(e => e.id === id);
    if (!found) return;
    const wallet = found.walletId ? wallets.find(w => w.id === found.walletId) : undefined;
    const newBalance = wallet ? wallet.balance + found.amount : null;
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (newBalance !== null) {
      setWallets(prev => prev.map(w => w.id === found.walletId ? { ...w, balance: newBalance } : w));
    }
    await Promise.all([
      supabase.from('expenses').delete().eq('id', id),
      ...(newBalance !== null && found.walletId
        ? [supabase.from('wallets').update({ balance: newBalance }).eq('id', found.walletId)]
        : []),
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

  // Payday confirmation. Schedule-driven but never schedule-assumed: the money
  // only counts once the user says it landed, and confirming writes a real
  // `earned` move so wallet balances stay true.
  const confirmPayday = async (date: string, amount: number, walletId: string) => {
    await addIncome({ walletId, amount, source: 'salary', note: `Payday ${date}` });
    await updateSettings({ paydayLog: { ...settings.paydayLog, [date]: 'received' } });
  };

  const dismissPayday = async (date: string) => {
    await updateSettings({ paydayLog: { ...settings.paydayLog, [date]: 'dismissed' } });
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

  // The DB cascades their entries; mirror that locally, then undo every
  // movement they caused. Each distinct settle batch is reversed exactly once,
  // and all of it goes through one reverseMoves call so repeated hits on the
  // same wallet accumulate instead of overwriting each other.
  const deleteDebtPerson = async (id: string) => {
    const mine = debtEntries.filter(e => e.personId === id);
    const moveIds = [...new Set(
      mine.flatMap(e => [e.moveId, e.settleMoveId]).filter((m): m is string => Boolean(m))
    )];

    setDebtPeople(prev => prev.filter(p => p.id !== id));
    setDebtEntries(prev => prev.filter(e => e.personId !== id));
    await supabase.from('debt_people').delete().eq('id', id);
    await reverseMoves(moveIds);
  };

  // Not optimistic: with a wallet set it must await the move to learn its id,
  // and running two code paths — one optimistic, one not — is more bug surface
  // than the sheet's existing "Saving…" state is worth.
  const addDebtEntry = async (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
    moveNote?: string;
    expenseId?: string | null;
    walletBalanceAfter?: number;
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
      // A caller making several calls against one wallet must pass the balance
      // itself: balanceOf reads React state, which does not update across
      // awaits, so a second call would compute from the same stale figure and
      // the last write would win. Single-call callers omit it.
      const after = e.walletBalanceAfter ?? (balanceOf(walletId) + (out ? -e.amount : e.amount));
      moveId = await recordMove(
        {
          kind: out ? 'debt_out' : 'debt_in',
          amount: e.amount, walletId, toWalletId: null, source: null,
          note: e.moveNote ?? (out ? `Spotted ${name}` : `Borrowed from ${name}`),
        },
        { [walletId]: after },
        e.date,
      );
    }

    const { data } = await supabase.from('debt_entries').insert({
      user_id: userId, person_id: e.personId, direction: e.direction,
      amount: e.amount, note: e.note, date: e.date,
      wallet_id: walletId, move_id: moveId,
      expense_id: e.expenseId ?? null,
    }).select().single();

    if (data) setDebtEntries(prev => [fromDBDebtEntry(data), ...prev]);
  };

  // A payment against a person's balance. It is an ordinary entry pointing the
  // other way, not a settlement: paying down a positive net is money coming in,
  // which is exactly what `addDebtEntry` already books for an `i_owe` row. The
  // originals keep their face values and nothing is marked settled — the new
  // balance falls out of `netOf`, as it does for every other entry.
  //
  // The net is read here rather than passed in: the direction of the money
  // depends on it, and a stale figure from a render would point the wallet
  // movement the wrong way.
  const recordDebtPayment = async (personId: string, amount: number, walletId: string) => {
    const net = netOf(debtEntries.filter(e => e.personId === personId && !e.settledAt));
    if (amount <= 0 || net === 0) return;

    const incoming = net > 0;
    const name = debtPeople.find(p => p.id === personId)?.name ?? 'someone';
    const note = incoming ? `${name} paid you` : `Paid ${name}`;

    await addDebtEntry({
      personId,
      direction: incoming ? 'i_owe' : 'owed_to_me',
      amount,
      note,
      // Midday of today, as AddDebtSheet dates a hand-entered row: a bare
      // toISOString() before 08:00 in PH stamps yesterday, which backdates the
      // person on the debts list and reads as the wrong day on the row.
      date: new Date(`${isoDay(new Date())}T12:00:00`).toISOString(),
      walletId,
      moveNote: note,
    });
  };

  // Refuses a row that was settled through a wallet. Its share of the settle
  // movement cannot be handed back: the batch netted several rows into one
  // amount that belongs to no single row, so removing one member would leave
  // the movement standing at a figure nothing on the page accounts for and the
  // wallet quietly wrong. The caller reverses the batch first — that restores
  // the money and reopens every row — and deletes the row while it is open.
  const deleteDebtEntry = async (id: string) => {
    const entry = debtEntries.find(e => e.id === id);
    if (entry?.settleMoveId) return;
    setDebtEntries(prev => prev.filter(e => e.id !== id));
    await supabase.from('debt_entries').delete().eq('id', id);
    if (entry?.moveId) await reverseMoves([entry.moveId]);
  };

  // Un-settle a whole settle-up batch. Reversing one row's share of a netted
  // movement has no coherent meaning — ₱250 owed and ₱180 owing became a single
  // ₱70 movement that no individual row owns — so the batch is the unit.
  const reverseSettleBatch = async (settleMoveId: string) => {
    setDebtEntries(prev => prev.map(
      e => e.settleMoveId === settleMoveId
        ? { ...e, settledAt: null, settleMoveId: null }
        : e
    ));
    await supabase.from('debt_entries')
      .update({ settled_at: null, settle_move_id: null })
      .eq('settle_move_id', settleMoveId);
    await reverseMoves([settleMoveId]);
  };

  // Settling one row is a settle-up batch of exactly one, so it reuses
  // settle_move_id and reverses through the same path as a netted batch.
  const setDebtEntrySettled = async (id: string, settled: boolean, walletId?: string | null) => {
    const entry = debtEntries.find(e => e.id === id);
    if (!entry) return;

    // Un-settling a wallet-linked row goes through reverseSettleBatch instead;
    // this branch only handles rows that never moved money.
    if (!settled) {
      setDebtEntries(prev => prev.map(e => e.id === id ? { ...e, settledAt: null } : e));
      await supabase.from('debt_entries').update({ settled_at: null }).eq('id', id);
      return;
    }

    const settledAt = new Date().toISOString();
    const name = debtPeople.find(p => p.id === entry.personId)?.name ?? 'someone';

    // Settling `owed_to_me` means they paid you: money in. Settling `i_owe`
    // means you paid them: money out.
    let moveId: string | null = null;
    if (walletId) {
      const incoming = entry.direction === 'owed_to_me';
      moveId = await recordMove(
        {
          kind: incoming ? 'debt_in' : 'debt_out',
          amount: entry.amount, walletId, toWalletId: null, source: null,
          note: incoming ? `${name} paid you back` : `Paid ${name} back`,
        },
        { [walletId]: balanceOf(walletId) + (incoming ? entry.amount : -entry.amount) },
      );
    }

    setDebtEntries(prev => prev.map(
      e => e.id === id ? { ...e, settledAt, settleMoveId: moveId } : e
    ));
    await supabase.from('debt_entries')
      .update({ settled_at: settledAt, settle_move_id: moveId })
      .eq('id', id);
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
      // Rounded before it moves: a net left at 166.66000000000003 by an earlier
      // partial payment would otherwise carry its dust into the movement and
      // the wallet balance, where nothing displays it but it never leaves.
      const amount = Math.round(Math.abs(net) * 100) / 100;
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

  // Wipe everything the user has entered, leaving the account itself and the
  // few preferences that are configuration rather than data: currency, payday
  // cycle and electricity rate.
  const resetAccount = async () => {
    if (!userId) return;

    // Local first so the UI empties immediately rather than after ten writes.
    setWallets([]); setExpenses([]); setMoneyMoves([]);
    setShopeeSchedule([]); setLock(false);
    setEmergencyFund({ entries: [], currentAmount: 0 });
    setDebtPeople([]); setDebtEntries([]);
    setSettings(prev => ({
      ...prev,
      monthlyIncome: 0,
      emergencyFundTarget: 0,
      monthlySavingsTarget: 0,
      bills: [], budgetLines: [], appliances: [],
      categoryBudgets: {}, customCategories: [], hiddenCategories: [],
      // The wallets it pointed at are gone, and last month's payday answers
      // must not carry into a fresh account.
      cashflowWalletId: null, paydayLog: {},
    }));

    const own = (table: string) => supabase.from(table).delete().eq('user_id', userId);

    // Children before parents: expenses, money_moves and debt_entries all
    // reference wallets, and debt_entries reference debt_people.
    await Promise.all([own('debt_entries'), own('expenses'), own('money_moves')]);
    await Promise.all([
      own('debt_people'), own('shopee_payments'), own('emergency_fund_entries'),
      own('bills'), own('budget_lines'), own('appliances'),
    ]);
    await own('wallets');

    await supabase.from('settings').update({
      monthly_income: 0,
      emergency_fund_target: 0,
      monthly_savings_target: 0,
      category_budgets: {},
      custom_categories: [],
      hidden_categories: [],
      cashflow_wallet_id: null,
      payday_log: {},
      shopee_purchase_lock: false,
    }).eq('user_id', userId);
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
      confirmPayday, dismissPayday,
      updateSettings,
      addShopeePayment, updateShopeePayment, deleteShopeePayment,
      setShopeeNewPurchaseLock,
      addEmergencyFundEntry,
      addBudgetLine, updateBudgetLine, deleteBudgetLine,
      toggleAppliance, logApplianceUsage, refundApplianceUsage, setAppliancePinned, toggleBillPaid,
      updateBill,
      resetBalances, resetAccount,
      debtPeople, debtEntries,
      ...debtTotals,
      addDebtPerson, deleteDebtPerson,
      addDebtEntry, deleteDebtEntry, setDebtEntrySettled, settleUpPerson,
      reverseSettleBatch, recordDebtPayment,
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

// One definition of how money rounds. Never compare raw floats for a
// "is this the full amount" decision. A raw float comparison would send a
// ₱333.33 payment against a ₱333.33 balance down the partial path and leave a
// phantom ₱0.00 entry open forever.
export const round2 = (n: number) => Math.round(n * 100) / 100;
