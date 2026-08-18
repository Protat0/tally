'use client';

import { createContext, useContext, useState, useMemo, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { Deltas, mergeDeltas, negate, expenseDeltas, moveDeltas, round2 } from '@/lib/walletDeltas';

// round2 lives with the delta arithmetic it guards, and is re-exported here
// because SplitPanel, SettleUpSheet and the expense form already import it
// from this module.
export { round2 };

// ─── Types ────────────────────────────────────────────────────────────────────

// Built-in keys keep autocomplete; `(string & {})` also allows user-defined custom category keys.
export type Category = 'food' | 'transport' | 'bills' | 'shopping' | 'health' | 'other' | (string & {});

export interface CustomCategory {
  key: string; label: string; icon: string;
}
export type PaydayCycle = '1st-15th' | 'monthly' | 'custom';
export type InstalmentStatus = 'paid' | 'pending' | 'upcoming';
export type BudgetType = 'needs' | 'wants' | 'savings';

export interface Wallet {
  id: string; name: string; icon: string; balance: number;
}

export interface Expense {
  id: string; amount: number; category: Category;
  // null means another person paid for this, so no wallet of yours moved.
  walletId: string | null; note: string; date: string;
  // When the row was last edited; null means never. Deliberately not defaulted
  // in the database, so existing rows do not claim to have been edited.
  updatedAt: string | null;
}

// Money that moves in or out of a wallet without being a categorised expense.
//   earned    — money in.  walletId is the destination. `source` is set.
//   withdrawn — cash taken out. walletId is the source, toWalletId the cash
//               wallet it lands in, so it is net-zero like `moved` and kept out
//               of spending. Rows written before cash had a destination have a
//               null toWalletId and still mean the money left; readers branch on
//               that field, never on the kind alone.
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
  // What the bank kept for making the move. Charged to the source wallet on top
  // of the amount, so the destination still receives the full amount. Unlike the
  // amount itself this money is gone, so it counts as spending. 0 when free.
  fee: number;
  source: IncomeSource | null; note: string; date: string;
  updatedAt: string | null;
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
  updatedAt: string | null;      // last edited; null = never
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
  // Which expense each month's payment created, keyed by the same 'YYYY-MM'.
  // Unticking a month deletes that expense and refunds the wallet. Months
  // ticked before payments recorded an expense simply have no entry here.
  paidExpenseIds: Record<string, string>;
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

export interface InstalmentPayment {
  id: string; month: string; amount: number; status: InstalmentStatus;
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
  // The wallet that stands for money in your pocket: the default funding wallet,
  // and the destination a withdrawal lands in. Every account has one — if this is
  // null on load the app adopts a wallet already named Cash, or creates one — and
  // it cannot be deleted, so this is only null before an account has been seeded.
  cashWalletId: string | null;
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
  /** Expenses logged this month plus any bank fees paid on moves. */
  totalSpentThisMonth: number;
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
  instalmentRemainingBalance: number;
  instalmentDebtFreeDate: string | null;
}

interface AppContextValue extends Computed {
  wallets: Wallet[];
  expenses: Expense[];
  moneyMoves: MoneyMove[];
  settings: Settings;
  instalmentSchedule: InstalmentPayment[];
  instalmentNewPurchaseLock: boolean;
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
    /** The new expense's id, or null when nothing was written. */
  }) => Promise<string | null>;
  deleteExpense: (id: string) => Promise<boolean>;
  // False means it refused: a debt settled through a wallet is linked to it, or
  // the new share is not a positive amount.
  updateExpense: (id: string, next: {
    amount: number; category: Category; note: string;
    walletId: string | null; date?: string;
    paidByPersonId?: string | null;
    owedToMe?: { personId: string; amount: number }[];
  }) => Promise<boolean>;
  addIncome: (m: { walletId: string; amount: number; source: IncomeSource; note: string }) => Promise<void>;
  /** Record a due payday as received: writes an `earned` move and logs the date. */
  confirmPayday: (date: string, amount: number, walletId: string) => Promise<void>;
  /** Stop counting and stop asking about a due payday. */
  dismissPayday: (date: string) => Promise<void>;
  /** `fee` is charged to the source on top of `amount`; the destination gets the full amount. */
  addWithdrawal: (m: { walletId: string; amount: number; note: string; fee?: number }) => Promise<void>;
  addTransfer: (m: { fromWalletId: string; toWalletId: string; amount: number; note: string; fee?: number }) => Promise<void>;
  deleteMoneyMove: (id: string) => Promise<void>;
  // Refuses debt movements: those are edited through updateDebtEntry.
  updateMoneyMove: (id: string, next: {
    amount: number; walletId: string; toWalletId?: string | null;
    fee?: number; source?: IncomeSource | null; note: string; date?: string;
  }) => Promise<boolean>;
  updateSettings: (updates: Partial<Settings>) => Promise<void>;
  addInstalmentPayment: (p: Omit<InstalmentPayment, 'id'>) => Promise<void>;
  updateInstalmentPayment: (id: string, updates: Partial<InstalmentPayment>) => Promise<void>;
  deleteInstalmentPayment: (id: string) => Promise<void>;
  setInstalmentNewPurchaseLock: (locked: boolean) => Promise<void>;
  addEmergencyFundEntry: (e: Omit<EmergencyFundEntry, 'id' | 'date'>) => Promise<void>;
  addBudgetLine: (b: Omit<BudgetLine, 'id'>) => Promise<void>;
  updateBudgetLine: (id: string, updates: Partial<BudgetLine>) => Promise<void>;
  deleteBudgetLine: (id: string) => Promise<void>;
  toggleAppliance: (id: string) => Promise<void>;
  logApplianceUsage: (id: string, minutes: number) => Promise<void>;
  refundApplianceUsage: (id: string, minutes: number) => Promise<void>;
  setAppliancePinned: (id: string, pinned: boolean) => Promise<void>;
  markBillPaid: (id: string, walletId: string) => Promise<void>;
  unmarkBillPaid: (id: string) => Promise<void>;
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
    deferBalance?: boolean;
  }) => Promise<void>;
  deleteDebtEntry: (id: string) => Promise<void>;
  // Refuses a settled row — reverse its settle-up batch first.
  updateDebtEntry: (id: string, next: {
    amount: number; note: string; date?: string; walletId?: string | null;
  }) => Promise<boolean>;
  setDebtEntrySettled: (id: string, settled: boolean, walletId?: string | null) => Promise<void>;
  settleUpPerson: (personId: string, walletId?: string | null) => Promise<void>;
  reverseSettleBatch: (settleMoveId: string) => Promise<void>;
  recordDebtPayment: (personId: string, amount: number, walletId: string) => Promise<void>;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function currentYYYYMM(): string {
  return new Date().toISOString().slice(0, 7);
}

// The month key an arbitrary date falls in. Same UTC basis as currentYYYYMM,
// so a bill's tick and the month it is compared against never disagree.
export function yyyymmOf(date: string): string {
  return new Date(date).toISOString().slice(0, 7);
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
    cashWalletId:       (r.cash_wallet_id ?? null) as string | null,
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
  if ('cashWalletId'        in s) m.cash_wallet_id        = s.cashWalletId;
  if ('paydayLog'           in s) m.payday_log            = s.paydayLog;
  return m;
}

const fromDBWallet     = (r: Row): Wallet     => ({ id: r.id, name: r.name, icon: r.icon, balance: Number(r.balance) });
const fromDBBill       = (r: Row): Bill       => ({
  id: r.id, name: r.name, amount: Number(r.amount),
  paidMonths: (r.paid_months as string[]) || [],
  paidExpenseIds: (r.paid_expense_ids as Record<string, string>) || {},
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
  updatedAt: r.updated_at ?? null,
});
const fromDBMoneyMove  = (r: Row): MoneyMove  => ({
  id: r.id, kind: r.kind as MoneyMoveKind, amount: Number(r.amount),
  walletId: r.wallet_id, toWalletId: r.to_wallet_id ?? null,
  fee: Number(r.fee) || 0,
  source: (r.source ?? null) as IncomeSource | null,
  note: r.note || '', date: r.date,
  updatedAt: r.updated_at ?? null,
});
const fromDBInstalment = (r: Row): InstalmentPayment => ({
  id: r.id, month: String(r.month || '').slice(0, 7),
  amount: Number(r.amount), status: r.status as InstalmentStatus,
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
  updatedAt: r.updated_at ?? null,
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
  cashWalletId: null,
  paydayLog: {},
};

// The wallet seeded for accounts that have never had one.
const CASH_WALLET = { name: 'Cash', icon: '💵' };

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
  const [instalmentSchedule,   setInstalmentSchedule]   = useState<InstalmentPayment[]>([]);
  const [instalmentNewPurchaseLock, setLock]            = useState(false);
  const [emergencyFund,        setEmergencyFund]        = useState<EmergencyFund>({ entries: [], currentAmount: 0 });
  const [dataLoading,          setDataLoading]          = useState(false);
  const [debtPeople,           setDebtPeople]           = useState<DebtPerson[]>([]);
  const [debtEntries,          setDebtEntries]          = useState<DebtEntry[]>([]);

  // ── Load / clear on auth change ──────────────────────────────────────────
  useEffect(() => {
    if (!userId) {
      setWallets([]); setExpenses([]); setMoneyMoves([]); setSettings(defaultSettings);
      setInstalmentSchedule([]); setLock(false);
      setEmergencyFund({ entries: [], currentAmount: 0 });
      setDebtPeople([]); setDebtEntries([]);
      return;
    }
    loadAll(userId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId]);

  async function loadAll(uid: string) {
    setDataLoading(true);
    const [sRes, wRes, eRes, mmRes, bRes, blRes, aRes, ipRes, efRes, dpRes, deRes] = await Promise.all([
      supabase.from('settings').select('*').eq('user_id', uid).single(),
      supabase.from('wallets').select('*').eq('user_id', uid).order('created_at'),
      supabase.from('expenses').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('money_moves').select('*').eq('user_id', uid).order('date', { ascending: false }),
      supabase.from('bills').select('*').eq('user_id', uid),
      supabase.from('budget_lines').select('*').eq('user_id', uid).order('sort_order'),
      supabase.from('appliances').select('*').eq('user_id', uid),
      supabase.from('instalment_payments').select('*').eq('user_id', uid).order('month'),
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
      setLock(Boolean(sRes.data.instalment_purchase_lock));
    }

    if (wRes.data)  setWallets(wRes.data.map(fromDBWallet));
    if (eRes.data)  setExpenses(eRes.data.map(fromDBExpense));
    if (mmRes.data) setMoneyMoves(mmRes.data.map(fromDBMoneyMove));
    if (ipRes.data) setInstalmentSchedule(ipRes.data.map(fromDBInstalment));
    if (efRes.data) {
      const entries = efRes.data.map(fromDBEFEntry);
      setEmergencyFund({ entries, currentAmount: entries.reduce((s, e) => s + e.amount, 0) });
    }
    if (dpRes.data) setDebtPeople(dpRes.data.map(fromDBDebtPerson));
    if (deRes.data) setDebtEntries(deRes.data.map(fromDBDebtEntry));
    setDataLoading(false);

    await ensureCashWallet(uid, (wRes.data || []).map(fromDBWallet), sRes.data?.cash_wallet_id ?? null);
  }

  // Every account has a wallet standing for money in your pocket. Accounts made
  // before this existed already have one under some name, so an existing wallet
  // called Cash is adopted rather than duplicated; only an account with none
  // gets a new one. Runs after the load has painted, so a first-time user sees
  // their data immediately and the wallet appears a moment later.
  async function ensureCashWallet(uid: string, loaded: Wallet[], pointer: string | null) {
    if (pointer && loaded.some(w => w.id === pointer)) return;

    const existing = loaded.find(w => w.name.trim().toLowerCase() === 'cash');
    if (existing) {
      setSettings(prev => ({ ...prev, cashWalletId: existing.id }));
      await supabase.from('settings').update({ cash_wallet_id: existing.id }).eq('user_id', uid);
      return;
    }

    const { data } = await supabase.from('wallets')
      .insert({ user_id: uid, name: CASH_WALLET.name, icon: CASH_WALLET.icon, balance: 0 })
      .select().single();
    if (!data) return;

    setWallets(prev => [...prev, fromDBWallet(data)]);
    setSettings(prev => ({ ...prev, cashWalletId: data.id }));
    await supabase.from('settings').update({ cash_wallet_id: data.id }).eq('user_id', uid);
  }

  // ── Computed ─────────────────────────────────────────────────────────────
  const computed = useMemo<Computed>(() => {
    const today = new Date();
    const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    });
    // Bank fees are not categorised expenses, but the money is gone all the same,
    // so every spending figure below counts them alongside what you bought.
    const feesThisMonth = moneyMoves
      .filter(mm => {
        const d = new Date(mm.date);
        return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
      })
      .reduce((s, mm) => s + mm.fee, 0);
    const totalSpentThisMonth = monthExpenses.reduce((s, e) => s + e.amount, 0) + feesThisMonth;
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
    const observedRate = totalSpentThisMonth / trackedDays;
    const w = Math.min(trackedDays, RATE_RAMP_DAYS) / RATE_RAMP_DAYS;
    const rate = w * observedRate + (1 - w) * budgetRate;
    const assumedSpending = totalSpentThisMonth + blindSpend + remainingDays * rate;

    const projectedSavings = projectedIncome - totalBills - assumedSpending;
    // Everything goes right: the due paydays did land, and nothing more is spent.
    const optimisticSavings =
      (projectedIncome + unconfirmedIncome) - totalBills - (totalSpentThisMonth + blindSpend);

    // Pace counts the blind days too, so this card and the projection tell the
    // same story instead of contradicting each other.
    const discretionary = settings.monthlyIncome - totalBills;
    const expectedSoFar = discretionary * (daysElapsed / daysInMonth);
    const spendingPacePercent = expectedSoFar > 0
      ? ((totalSpentThisMonth + blindSpend) / expectedSoFar) * 100
      : 0;
    const nextPaydayDate = computeNextPayday(settings);
    const pending = instalmentSchedule.filter(p => p.status !== 'paid');
    return {
      totalBalance, totalSpentThisMonth, receivedThisMonth, projectedSavings, spendingPacePercent,
      optimisticSavings, unconfirmedIncome, pendingPaydays,
      untrackedDays, trackedDays, blindSpend, assumedSpending,
      daysUntilPayday: daysUntil(nextPaydayDate ? new Date(nextPaydayDate) : null),
      nextPaydayDate,
      electricBillEstimate: calcElectric(settings),
      instalmentRemainingBalance: pending.reduce((s, p) => s + p.amount, 0),
      instalmentDebtFreeDate: pending.length > 0 ? pending[pending.length - 1].month : null,
    };
  }, [wallets, expenses, moneyMoves, settings, instalmentSchedule]);

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
    // The cash wallet cannot be deleted. The Wallets page gives it no delete
    // control, and this guard means no other caller can take it away either.
    if (id === settings.cashWalletId) return;
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
    // Returns the new expense's id so a caller that has to remember the
    // expense it caused — a bill being ticked paid — can undo it later.
  }): Promise<string | null> => {
    if (!userId) return null;
    const owed = e.walletId ? (e.owedToMe ?? []) : [];
    const myShare = round2(e.walletId
      ? e.amount - owed.reduce((s, o) => s + o.amount, 0)
      : e.amount);

    // Over-allocating is incoherent: more is owed back to you than was paid out.
    // The UI blocks it, but this is a money boundary and it defends itself rather
    // than trusting every future caller.
    if (myShare < 0) return null;

    const now = new Date().toISOString();

    // Inserted first, and NOT optimistically: the debt rows below need the real
    // expense id as a foreign key. A share of zero (you spotted someone the
    // whole thing) writes no expense at all rather than a ₱0 row that would
    // clutter the feed and the category totals.
    // The whole footprint — this expense and every debt movement it spawns —
    // is described up front and committed once at the end. Nothing below reads
    // a balance, so nothing below can read a stale one.
    const footprint = expenseDeltas({ walletId: e.walletId, myShare, owedToMe: owed });

    let expenseId: string | null = null;
    if (myShare > 0) {
      const { data } = await supabase.from('expenses').insert({
        user_id: userId, wallet_id: e.walletId, amount: myShare,
        category: e.category, note: e.note, date: now,
      }).select().single();

      // Bail before anything moves. The wallet is debited at the end of this
      // function, so carrying on past a failed insert would take the money and
      // leave no record of where it went — the balance would just be wrong.
      // Nothing has been written yet, so returning here changes nothing.
      if (!data) return null;

      expenseId = data.id as string;
      setExpenses(prev => [fromDBExpense(data), ...prev]);
    }

    // deferBalance: each of these writes its own money_move but leaves the
    // balance to the single commit below.
    if (e.walletId) {
      for (const o of owed) {
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: e.note, date: now,
          walletId: e.walletId, expenseId, deferBalance: true,
        });
      }
    } else if (e.paidByPersonId) {
      // No wallet, so no movement and no balance to defer.
      await addDebtEntry({
        personId: e.paidByPersonId, direction: 'i_owe',
        amount: myShare, note: e.note, date: now,
        walletId: null, expenseId,
      });
    }

    await commitDeltas(footprint);
    return expenseId;
  };

  // ── Bill ticks ────────────────────────────────────────────────────────────
  // Ticking a bill paid records an expense and remembers its id. That pointer
  // has to be maintained by anything that moves or removes the expense, or the
  // bill is stranded: a later untick looks for an expense that no longer
  // exists, deleteExpense returns false, and the month can never be paid again.

  // Which bill month, if any, this expense is the payment for.
  const billTickFor = (expenseId: string): { bill: Bill; month: string } | null => {
    for (const bill of settings.bills) {
      const month = Object.keys(bill.paidExpenseIds).find(m => bill.paidExpenseIds[m] === expenseId);
      if (month) return { bill, month };
    }
    return null;
  };

  const writeBillTicks = async (bill: Bill, paidMonths: string[], paidExpenseIds: Record<string, string>) => {
    setSettings(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === bill.id ? { ...b, paidMonths, paidExpenseIds } : b),
    }));
    await supabase.from('bills')
      .update({ paid_months: paidMonths, paid_expense_ids: paidExpenseIds })
      .eq('id', bill.id);
  };

  const clearBillMonth = async (bill: Bill, month: string) => {
    const paidExpenseIds = { ...bill.paidExpenseIds };
    delete paidExpenseIds[month];
    await writeBillTicks(bill, bill.paidMonths.filter(m => m !== month), paidExpenseIds);
  };

  // An expense edited across a month boundary takes its bill's tick with it.
  // Left behind, the bill claims one month while its expense sits in another,
  // and unmarkBillPaid — which always works on the current month — would take
  // back the wrong row.
  const moveBillTick = async (expenseId: string, newDate: string) => {
    const tick = billTickFor(expenseId);
    if (!tick) return;
    const newMonth = yyyymmOf(newDate);
    if (tick.month === newMonth) return;

    const paidExpenseIds = { ...tick.bill.paidExpenseIds };
    delete paidExpenseIds[tick.month];
    paidExpenseIds[newMonth] = expenseId;
    await writeBillTicks(
      tick.bill,
      [...tick.bill.paidMonths.filter(m => m !== tick.month), newMonth],
      paidExpenseIds,
    );
  };

  // Returns false when it refuses. The linked rows exist only because of this
  // expense, so they go with it — but a row settled through a wallet owns no
  // share of its batch's netted movement, so it cannot be handed back. The
  // caller reopens the settle-up first, exactly as the debt board's own trash
  // does, rather than refusing in silence.
  const deleteExpense = async (id: string): Promise<boolean> => {
    const found = expenses.find(e => e.id === id);
    if (!found) return false;

    const linked = debtEntries.filter(d => d.expenseId === id);
    if (linked.some(d => d.settleMoveId)) return false;

    const seed: Record<string, number> = {};
    if (found.walletId) seed[found.walletId] = found.amount;

    const linkedIds = linked.map(d => d.id);
    const moveIds = linked.map(d => d.moveId).filter((m): m is string => Boolean(m));

    setExpenses(prev => prev.filter(e => e.id !== id));
    setDebtEntries(prev => prev.filter(d => !linkedIds.includes(d.id)));

    await Promise.all([
      supabase.from('expenses').delete().eq('id', id),
      ...(linkedIds.length > 0
        ? [supabase.from('debt_entries').delete().in('id', linkedIds)]
        : []),
    ]);

    // A bill's payment going away has to untick the bill as well.
    const tick = billTickFor(id);
    if (tick) await clearBillMonth(tick.bill, tick.month);

    // One call, one balance computation per wallet — the refund and every
    // linked movement together.
    await reverseMoves(moveIds, seed);
    return true;
  };

  // Re-record an expense over the top of itself. Returns false when it refuses.
  //
  // The row keeps its id — bills.paidExpenseIds points at it, and a delete-and-
  // recreate would strand the bill. Its debt rows do not: a split is rewritten
  // wholesale rather than diffed, because working out which of three people's
  // shares moved is more error-prone than describing the end state.
  const updateExpense = async (
    id: string,
    next: {
      amount: number; category: Category; note: string;
      walletId: string | null;
      date?: string;
      paidByPersonId?: string | null;
      owedToMe?: { personId: string; amount: number }[];
    },
  ): Promise<boolean> => {
    if (!userId) return false;
    const found = expenses.find(e => e.id === id);
    if (!found) return false;

    const linked = debtEntries.filter(d => d.expenseId === id);
    // A row settled through a wallet owns no share of its batch's netted
    // movement, so it cannot be handed back — the same refusal deleteExpense
    // makes. The caller reverses the settle-up first.
    if (linked.some(d => d.settleMoveId)) return false;

    const owed = next.walletId ? (next.owedToMe ?? []) : [];
    const myShare = round2(next.walletId
      ? next.amount - owed.reduce((sum, o) => sum + o.amount, 0)
      : next.amount);

    // Negative is over-allocated: more owed back than was paid out. Zero would
    // mean the expense should not exist at all — legitimate under the splits
    // model, but dissolving the row the user is editing while invisible debt
    // rows survive is worse than refusing, so the caller deletes instead.
    if (myShare <= 0) return false;

    const date = next.date ?? found.date;
    const editedAt = new Date().toISOString();

    // What the row does to wallets today, and what it will do once saved. Only
    // owed_to_me rows carrying a wallet ever moved money; an i_owe row from
    // "someone else paid" moved nothing and contributes nothing to reverse.
    const before = expenseDeltas({
      walletId: found.walletId,
      myShare: found.amount,
      owedToMe: linked
        .filter(d => d.direction === 'owed_to_me' && d.walletId)
        .map(d => ({ amount: d.amount })),
    });
    const after = expenseDeltas({ walletId: next.walletId, myShare, owedToMe: owed });

    // The expense row goes FIRST, and a failure here abandons the whole edit.
    // Everything below tears down the split, rebuilds it, and then moves money.
    // If the row itself cannot be written — a category the database rejects,
    // say — none of that may happen: it would destroy the debt rows and debit
    // the wallet for an edit that never landed. Nothing has changed yet here,
    // so returning leaves the expense exactly as it was.
    const { error: writeFailed } = await supabase.from('expenses').update({
      amount: myShare, category: next.category, note: next.note,
      wallet_id: next.walletId, date, updated_at: editedAt,
    }).eq('id', id);
    if (writeFailed) return false;

    setExpenses(prev => prev.map(e => e.id === id ? {
      ...e, amount: myShare, category: next.category, note: next.note,
      walletId: next.walletId, date, updatedAt: editedAt,
    } : e));

    // Now the split is rebuilt wholesale. Deleting before inserting leaves it
    // briefly missing rather than briefly doubled — the feed shows the first
    // and hides the second, so a failure here is visible.
    const linkedIds = linked.map(d => d.id);
    const moveIds = linked.map(d => d.moveId).filter((m): m is string => Boolean(m));
    setDebtEntries(prev => prev.filter(d => !linkedIds.includes(d.id)));
    setMoneyMoves(prev => prev.filter(m => !moveIds.includes(m.id)));
    await Promise.all([
      ...(linkedIds.length > 0 ? [supabase.from('debt_entries').delete().in('id', linkedIds)] : []),
      ...(moveIds.length   > 0 ? [supabase.from('money_moves').delete().in('id', moveIds)]   : []),
    ]);

    // Then the replacements, dated to the new date so a split never drifts
    // away from its parent.
    if (next.walletId) {
      for (const o of owed) {
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: next.note, date,
          walletId: next.walletId, expenseId: id, deferBalance: true,
        });
      }
    } else if (next.paidByPersonId) {
      await addDebtEntry({
        personId: next.paidByPersonId, direction: 'i_owe',
        amount: myShare, note: next.note, date,
        walletId: null, expenseId: id,
      });
    }

    await moveBillTick(id, date);

    // One commit for the whole edit. Editing an amount on the same wallet nets
    // to the difference here; two separate commits would each recompute from
    // the same pre-await balance and the second would overwrite the first.
    await commitDeltas(mergeDeltas(negate(before), after));
    return true;
  };

  // ── Money moves (top-ups, withdrawals, transfers) ─────────────────────────
  // Every balance change outside of expenses goes through here so it leaves a
  // record. Balances are applied optimistically, then persisted alongside the row.

  const balanceOf = (id: string) => wallets.find(w => w.id === id)?.balance ?? 0;

  // Apply a delta map to wallets: ONE computation and ONE write per wallet.
  //
  // Callers say how much each balance should MOVE, never what it should become.
  // balanceOf reads React state, which does not update across an await, so two
  // absolute balances computed either side of one would both derive from the
  // same pre-await figure and the second write would silently overwrite the
  // first — losing the difference from a real wallet. Deltas from independent
  // sources can be summed, so an operation touching several rows merges its
  // whole footprint and calls this EXACTLY ONCE.
  const commitDeltas = async (deltas: Deltas) => {
    // A zero delta is a write that changes nothing; skipping it also means an
    // edit that changed no amount touches no wallet row at all.
    const moving = Object.entries(deltas).filter(([, d]) => d !== 0);
    if (moving.length === 0) return;

    const newBalances: Record<string, number> = {};
    // round2, because this sums several raw floats: 0.01 + 0.05 is
    // 0.060000000000000005, and sub-centavo dust in a stored balance causes real
    // misbehaviour later (a balance that should be zero never compares equal to it).
    for (const [wid, d] of moving) newBalances[wid] = round2(balanceOf(wid) + d);

    setWallets(prev => prev.map(w => w.id in newBalances ? { ...w, balance: newBalances[w.id] } : w));
    await Promise.all(
      Object.entries(newBalances).map(([wid, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', wid)
      ),
    );
  };

  // Writes the row and nothing else. Callers recording several movements use
  // this and commit one merged delta map at the end; single-movement callers
  // use recordMove below, which does both.
  const insertMove = async (
    // Only withdrawals and transfers can carry a fee; the rest omit it.
    move: Omit<MoneyMove, 'id' | 'date' | 'fee' | 'updatedAt'> & { fee?: number },
    date?: string,
  ): Promise<string | null> => {
    if (!userId) return null;
    // Debt movements are dated to the debt itself, which may be days ago.
    const now = date ?? new Date().toISOString();
    const tempId = crypto.randomUUID();

    setMoneyMoves(prev => [
      { ...move, fee: move.fee ?? 0, id: tempId, date: now, updatedAt: null },
      ...prev,
    ]);

    const { data } = await supabase.from('money_moves').insert({
      user_id: userId, kind: move.kind, amount: move.amount,
      wallet_id: move.walletId, to_wallet_id: move.toWalletId,
      fee: move.fee ?? 0, source: move.source, note: move.note, date: now,
    }).select().single();

    if (!data) return null;
    setMoneyMoves(prev => prev.map(m => m.id === tempId ? fromDBMoneyMove(data) : m));
    return data.id as string;
  };

  // One movement and the balances it moves. Safe to call once per operation;
  // a caller needing two movements must use insertMove and commit the merged
  // deltas itself, or the second call recomputes from the first's stale state.
  const recordMove = async (
    move: Omit<MoneyMove, 'id' | 'date' | 'fee' | 'updatedAt'> & { fee?: number },
    deltas: Deltas,
    date?: string,
  ): Promise<string | null> => {
    const id = await insertMove(move, date);
    await commitDeltas(deltas);
    return id;
  };

  // These three discard recordMove's id — only the debt board needs it.
  const addIncome = async (m: { walletId: string; amount: number; source: IncomeSource; note: string }) => {
    await recordMove(
      { kind: 'earned', amount: m.amount, walletId: m.walletId, toWalletId: null, source: m.source, note: m.note },
      { [m.walletId]: m.amount },
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

  // Withdrawing does not spend the money, it changes where the money is: out of
  // the bank and into your pocket. So it credits the cash wallet as it debits the
  // source, and the total balance does not move. Rows written before this landed
  // carry no destination; they still mean "money left", and every reader below
  // branches on toWalletId rather than on the kind alone.
  const addWithdrawal = async (m: { walletId: string; amount: number; note: string; fee?: number }) => {
    const cashId = settings.cashWalletId;
    if (!cashId || cashId === m.walletId) return;
    const fee = m.fee ?? 0;
    await recordMove(
      { kind: 'withdrawn', amount: m.amount, walletId: m.walletId, toWalletId: cashId, fee, source: null, note: m.note },
      {
        [m.walletId]: -m.amount - fee,
        [cashId]:      m.amount,
      },
    );
  };

  const addTransfer = async (m: { fromWalletId: string; toWalletId: string; amount: number; note: string; fee?: number }) => {
    const fee = m.fee ?? 0;
    await recordMove(
      { kind: 'moved', amount: m.amount, walletId: m.fromWalletId, toWalletId: m.toWalletId, fee, source: null, note: m.note },
      {
        [m.fromWalletId]: -m.amount - fee,
        [m.toWalletId]:    m.amount,
      },
    );
  };

  const deleteMoneyMove = async (id: string) => {
    const found = moneyMoves.find(m => m.id === id);
    if (!found) return;

    setMoneyMoves(prev => prev.filter(m => m.id !== id));
    await supabase.from('money_moves').delete().eq('id', id);
    // Undo whatever the move did to the wallets it touched.
    await commitDeltas(negate(moveDeltas(found)));
  };

  // Re-record a money move over the top of itself. Income, transfers and
  // withdrawals only: a debt movement belongs to the entry that created it and
  // is edited through updateDebtEntry, so the two never drift apart.
  const updateMoneyMove = async (
    id: string,
    next: {
      amount: number; walletId: string; toWalletId?: string | null;
      fee?: number; source?: IncomeSource | null; note: string; date?: string;
    },
  ): Promise<boolean> => {
    const found = moneyMoves.find(m => m.id === id);
    if (!found) return false;
    if (found.kind === 'debt_in' || found.kind === 'debt_out') return false;
    if (next.amount <= 0) return false;

    const date = next.date ?? found.date;
    const editedAt = new Date().toISOString();
    const fee = next.fee ?? 0;
    // A withdrawal keeps whichever shape it already has. Giving a legacy row a
    // destination would turn money that really left into a net-zero move and
    // silently lower a past month's spending.
    const toWalletId = found.kind === 'withdrawn' && !found.toWalletId
      ? null
      : (next.toWalletId ?? found.toWalletId);
    const source = next.source ?? found.source;

    const before = moveDeltas(found);
    const after  = moveDeltas({
      kind: found.kind, amount: next.amount, fee,
      walletId: next.walletId, toWalletId,
    });

    setMoneyMoves(prev => prev.map(m => m.id === id ? {
      ...m, amount: next.amount, walletId: next.walletId, toWalletId,
      fee, source, note: next.note, date, updatedAt: editedAt,
    } : m));
    await supabase.from('money_moves').update({
      amount: next.amount, wallet_id: next.walletId, to_wallet_id: toWalletId,
      fee, source, note: next.note, date, updated_at: editedAt,
    }).eq('id', id);

    await commitDeltas(mergeDeltas(negate(before), after));
    return true;
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
  // `seedDeltas` lets a caller fold in a balance change that is not itself a
  // money_move — an expense refund — so it lands in the SAME accumulation as the
  // movements. Patching the wallet separately would read a stale balanceOf.
  const reverseMoves = async (moveIds: string[], seedDeltas?: Record<string, number>) => {
    const ids = moveIds.filter(Boolean);
    const targets = moneyMoves.filter(m => ids.includes(m.id));
    if (targets.length === 0 && !seedDeltas) return;

    const deltas: Record<string, number> = { ...(seedDeltas ?? {}) };
    for (const mv of targets) {
      deltas[mv.walletId] = (deltas[mv.walletId] ?? 0)
        + (mv.kind === 'debt_in' ? -mv.amount : mv.amount);
    }

    setMoneyMoves(prev => prev.filter(m => !ids.includes(m.id)));
    if (ids.length > 0) await supabase.from('money_moves').delete().in('id', ids);
    await commitDeltas(deltas);
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
    // Set when the caller is committing the wallet movement itself as part of a
    // larger merged footprint — an expense and its several debt rows. The entry
    // and its money_move are still written; only the balance is left alone.
    deferBalance?: boolean;
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
      const move = {
        kind: (out ? 'debt_out' : 'debt_in') as MoneyMoveKind,
        amount: e.amount, walletId, toWalletId: null, source: null,
        note: e.moveNote ?? (out ? `Spotted ${name}` : `Borrowed from ${name}`),
      };
      // A caller making several calls against one wallet commits the balances
      // itself, as one merged map. Letting each call commit its own would have
      // every one of them recompute from the same pre-await React state, and
      // the last write would win — silently losing the rest.
      moveId = e.deferBalance
        ? await insertMove(move, e.date)
        : await recordMove(move, { [walletId]: out ? -e.amount : e.amount }, e.date);
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

  // Edit a debt row together with the movement it made, so the two never
  // disagree. Refuses a settled row: its share of the batch's netted movement
  // is not its own to change — reverse the settle-up first.
  const updateDebtEntry = async (
    id: string,
    next: { amount: number; note: string; date?: string; walletId?: string | null },
  ): Promise<boolean> => {
    const entry = debtEntries.find(e => e.id === id);
    if (!entry) return false;
    if (entry.settleMoveId) return false;
    if (next.amount <= 0) return false;

    const date = next.date ?? entry.date;
    const editedAt = new Date().toISOString();
    const walletId = next.walletId === undefined ? entry.walletId : next.walletId;
    const out = entry.direction === 'owed_to_me';
    const existingMoveId = entry.moveId;

    const before: Deltas = entry.walletId
      ? { [entry.walletId]: out ? -entry.amount : entry.amount } : {};
    const after: Deltas = walletId
      ? { [walletId]: out ? -next.amount : next.amount } : {};

    // The movement follows the entry. Clearing the wallet removes it entirely;
    // setting one on a row that never had a wallet creates it.
    let moveId: string | null = existingMoveId;
    if (existingMoveId && !walletId) {
      setMoneyMoves(prev => prev.filter(m => m.id !== existingMoveId));
      await supabase.from('money_moves').delete().eq('id', existingMoveId);
      moveId = null;
    } else if (existingMoveId && walletId) {
      // The movement's note is deliberately left alone. It is a label its
      // creator chose — "Spotted John", "John paid you", "Paid John back" —
      // not the entry's own note, and overwriting it with the entry's would
      // leave the feed row describing nothing at all.
      setMoneyMoves(prev => prev.map(m => m.id === existingMoveId ? {
        ...m, amount: next.amount, walletId, date, updatedAt: editedAt,
      } : m));
      await supabase.from('money_moves').update({
        amount: next.amount, wallet_id: walletId,
        date, updated_at: editedAt,
      }).eq('id', existingMoveId);
    } else if (walletId) {
      const name = debtPeople.find(p => p.id === entry.personId)?.name ?? 'someone';
      moveId = await insertMove({
        kind: (out ? 'debt_out' : 'debt_in') as MoneyMoveKind,
        amount: next.amount, walletId, toWalletId: null, source: null,
        note: out ? `Spotted ${name}` : `Borrowed from ${name}`,
      }, date);
    }

    setDebtEntries(prev => prev.map(e => e.id === id ? {
      ...e, amount: next.amount, note: next.note, date, walletId, moveId, updatedAt: editedAt,
    } : e));
    await supabase.from('debt_entries').update({
      amount: next.amount, note: next.note, date,
      wallet_id: walletId, move_id: moveId, updated_at: editedAt,
    }).eq('id', id);

    await commitDeltas(mergeDeltas(negate(before), after));
    return true;
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
        { [walletId]: incoming ? entry.amount : -entry.amount },
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
        { [walletId]: incoming ? amount : -amount },
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

  // ── Instalments ───────────────────────────────────────────────────────────
  const addInstalmentPayment = async (p: Omit<InstalmentPayment, 'id'>) => {
    if (!userId) return;
    const { data } = await supabase.from('instalment_payments')
      .insert({ user_id: userId, month: p.month + '-01', amount: p.amount, status: p.status })
      .select().single();
    if (data) setInstalmentSchedule(prev => [...prev, fromDBInstalment(data)]);
  };

  const updateInstalmentPayment = async (id: string, updates: Partial<InstalmentPayment>) => {
    setInstalmentSchedule(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
    const db: Row = {};
    if ('status' in updates) {
      db.status = updates.status;
      if (updates.status === 'paid') db.paid_at = new Date().toISOString();
    }
    if ('amount' in updates) db.amount = updates.amount;
    if ('month'  in updates) db.month  = updates.month + '-01';
    await supabase.from('instalment_payments').update(db).eq('id', id);
  };

  const deleteInstalmentPayment = async (id: string) => {
    setInstalmentSchedule(prev => prev.filter(p => p.id !== id));
    await supabase.from('instalment_payments').delete().eq('id', id);
  };

  const setInstalmentNewPurchaseLock = async (locked: boolean) => {
    setLock(locked);
    if (userId) await supabase.from('settings').update({ instalment_purchase_lock: locked }).eq('user_id', userId);
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

  // Paying a bill is spending, so ticking one writes a real expense against the
  // wallet the money came from rather than only flipping a flag. The tick
  // follows the expense: if the write fails there is nothing to mark paid with.
  const markBillPaid = async (id: string, walletId: string) => {
    const month = currentYYYYMM();
    const bill = settings.bills.find(b => b.id === id);
    if (!bill || bill.paidMonths.includes(month)) return;

    const expenseId = await addExpense({
      amount: bill.amount, category: 'bills', note: bill.name, walletId,
    });
    if (!expenseId) return;

    const paidMonths = [...bill.paidMonths, month];
    const paidExpenseIds = { ...bill.paidExpenseIds, [month]: expenseId };
    setSettings(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, paidMonths, paidExpenseIds } : b),
    }));
    await supabase.from('bills')
      .update({ paid_months: paidMonths, paid_expense_ids: paidExpenseIds })
      .eq('id', id);
  };

  // Unticking undoes the payment. deleteExpense refunds the wallet, so the only
  // thing tracked here is which expense to take back.
  const unmarkBillPaid = async (id: string) => {
    const month = currentYYYYMM();
    const bill = settings.bills.find(b => b.id === id);
    if (!bill || !bill.paidMonths.includes(month)) return;

    const expenseId = bill.paidExpenseIds[month];
    if (expenseId) {
      // deleteExpense clears the tick itself on success. On refusal — the
      // expense is load-bearing, a debt settled against it — it changes
      // nothing, and the bill correctly stays paid rather than half-undone.
      await deleteExpense(expenseId);
      return;
    }

    // Months ticked before payments recorded an expense have nothing to take
    // back, so the tick is released on its own.
    await clearBillMonth(bill, month);
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
    setInstalmentSchedule([]); setLock(false);
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
      cashflowWalletId: null, cashWalletId: null, paydayLog: {},
    }));

    const own = (table: string) => supabase.from(table).delete().eq('user_id', userId);

    // Children before parents: expenses, money_moves and debt_entries all
    // reference wallets, and debt_entries reference debt_people.
    await Promise.all([own('debt_entries'), own('expenses'), own('money_moves')]);
    await Promise.all([
      own('debt_people'), own('instalment_payments'), own('emergency_fund_entries'),
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
      cash_wallet_id: null,
      payday_log: {},
      instalment_purchase_lock: false,
    }).eq('user_id', userId);

    // A reset account is a new account, so it gets its Cash wallet back.
    await ensureCashWallet(userId, [], null);
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
      wallets, expenses, moneyMoves, settings, instalmentSchedule, instalmentNewPurchaseLock,
      emergencyFund, dataLoading,
      ...computed,
      addWallet, updateWallet, deleteWallet,
      addExpense, deleteExpense, updateExpense,
      addIncome, addWithdrawal, addTransfer, deleteMoneyMove, updateMoneyMove,
      confirmPayday, dismissPayday,
      updateSettings,
      addInstalmentPayment, updateInstalmentPayment, deleteInstalmentPayment,
      setInstalmentNewPurchaseLock,
      addEmergencyFundEntry,
      addBudgetLine, updateBudgetLine, deleteBudgetLine,
      toggleAppliance, logApplianceUsage, refundApplianceUsage, setAppliancePinned, markBillPaid, unmarkBillPaid,
      updateBill,
      resetBalances, resetAccount,
      debtPeople, debtEntries,
      ...debtTotals,
      addDebtPerson, deleteDebtPerson,
      addDebtEntry, deleteDebtEntry, updateDebtEntry, setDebtEntrySettled, settleUpPerson,
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
