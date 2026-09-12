// Credit card statements, kept pure: no React, no Supabase.
//
// Dates are local calendar days as 'YYYY-MM-DD' strings, which compare
// correctly as plain strings; callers turn stored instants into days with
// isoDay first. Money is rounded to the centavo. Nothing here is stored:
// statements are rebuilt from a card's terms, purchases and payments.

export interface CardTerms {
  creditLimit: number;
  statementDay: number;
  dueDay: number;
  /** Percent per month: 3 means 3%. */
  monthlyInterestRate: number;
  /** Percent of the statement balance. */
  minPaymentPercent: number;
  minPaymentFloor: number;
  lateFee: number | null;
  annualFee: number | null;
  /** 1–12, set whenever annualFee is. */
  annualFeeMonth: number | null;
  /** What was owed on the day the card was added. */
  openingBalance: number;
  /** The day the card was added. */
  addedOn: string;
}

/** A purchase or a payment on a card. */
export interface CardTxn {
  date: string;
  amount: number;
}

export interface Charges {
  interest: number;
  lateFee: number;
  annualFee: number;
}

export interface Statement {
  closesOn: string;
  dueOn: string;
  /** Stands for what was owed when the card was added. */
  opening: boolean;
  purchases: number;
  /** Payments dated in this statement's period. */
  payments: number;
  charges: Charges;
  balance: number;
  minimumDue: number;
  /** Payments dated after it closed, up to and including its due date. */
  paidByDue: number;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const pad = (n: number): string => String(n).padStart(2, '0');

// `month` is zero-based and may run past 11 or below 0; Date normalises it.
function dayString(year: number, month: number, day: number): string {
  const d = new Date(year, month, day);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function partsOf(ymd: string): { year: number; month: number; day: number } {
  const [y, m, d] = ymd.split('-').map(Number);
  return { year: y, month: m - 1, day: d };
}

// A day past the end of a month becomes its last day. The same rule as
// clampDay in cycle.ts, repeated here so this module has no runtime imports.
function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

export function ymdToDate(ymd: string): Date {
  const { year, month, day } = partsOf(ymd);
  return new Date(year, month, day);
}

export function addDays(ymd: string, days: number): string {
  const { year, month, day } = partsOf(ymd);
  return dayString(year, month, day + days);
}

/** Where a statement closes in a calendar month (zero-based, may overflow). */
export function closeDateIn(year: number, month: number, statementDay: number): string {
  return dayString(year, month, clampDay(year, month, statementDay));
}

/** The first due day strictly after a statement closes. */
export function dueDateAfter(closesOn: string, dueDay: number): string {
  const { year, month } = partsOf(closesOn);
  const sameMonth = dayString(year, month, clampDay(year, month, dueDay));
  if (sameMonth > closesOn) return sameMonth;
  return dayString(year, month + 1, clampDay(year, month + 1, dueDay));
}

export function minimumDue(balance: number, percent: number, floor: number): number {
  if (balance <= 0) return 0;
  return round2(Math.min(balance, Math.max((percent / 100) * balance, floor)));
}

// Sum of the transactions dated after `after`, up to and including `through`.
const sumBetween = (txns: CardTxn[], after: string, through: string): number =>
  round2(txns.filter(t => t.date > after && t.date <= through).reduce((s, t) => s + t.amount, 0));

/**
 * Every statement from the one standing for the opening balance up to the
 * latest that has closed by `today`, oldest first.
 */
export function buildStatements(
  terms: CardTerms,
  purchases: CardTxn[],
  payments: CardTxn[],
  today: string,
): Statement[] {
  // The opening statement is the latest close on or before the day the card was added.
  const added = partsOf(terms.addedOn);
  const baseMonth = closeDateIn(added.year, added.month, terms.statementDay) > terms.addedOn
    ? added.month - 1
    : added.month;

  const closes = [closeDateIn(added.year, baseMonth, terms.statementDay)];
  for (let k = 1; ; k++) {
    const next = closeDateIn(added.year, baseMonth + k, terms.statementDay);
    if (next > today) break;
    closes.push(next);
  }

  const statements: Statement[] = [];
  closes.forEach((closesOn, i) => {
    const dueOn = dueDateAfter(closesOn, terms.dueDay);
    const paidByDue = sumBetween(payments, closesOn, dueOn);

    if (i === 0) {
      const balance = round2(terms.openingBalance);
      statements.push({
        closesOn, dueOn, opening: true,
        purchases: 0, payments: 0,
        charges: { interest: 0, lateFee: 0, annualFee: 0 },
        balance,
        minimumDue: minimumDue(balance, terms.minPaymentPercent, terms.minPaymentFloor),
        paidByDue,
      });
      return;
    }

    const previousClose = closes[i - 1];
    const periodPurchases = sumBetween(purchases, previousClose, closesOn);
    const periodPayments = sumBetween(payments, previousClose, closesOn);

    // Interest and a late fee come from the latest earlier statement whose due
    // date passed in this period. Normally there is exactly one. When a short
    // month puts two due dates in one period, the later statement's balance
    // already carries the earlier one's, so charging both would double-count.
    let interest = 0;
    let lateFee = 0;
    const settled = [...statements].reverse()
      .find(s => s.dueOn > previousClose && s.dueOn <= closesOn);
    if (settled) {
      const unpaid = round2(settled.balance - settled.paidByDue);
      if (unpaid > 0) interest = (terms.monthlyInterestRate / 100) * unpaid;
      if (terms.lateFee !== null && settled.minimumDue > 0 && settled.paidByDue < settled.minimumDue) {
        lateFee = terms.lateFee;
      }
    }
    const closeMonth = partsOf(closesOn).month + 1;
    const annualFee = terms.annualFee !== null && terms.annualFeeMonth === closeMonth ? terms.annualFee : 0;

    const charges: Charges = {
      interest: round2(interest), lateFee: round2(lateFee), annualFee: round2(annualFee),
    };
    const balance = round2(
      statements[i - 1].balance - periodPayments + periodPurchases
      + charges.interest + charges.lateFee + charges.annualFee,
    );
    statements.push({
      closesOn, dueOn, opening: false,
      purchases: periodPurchases, payments: periodPayments, charges,
      balance,
      minimumDue: minimumDue(balance, terms.minPaymentPercent, terms.minPaymentFloor),
      paidByDue,
    });
  });
  return statements;
}

export type CardStatus =
  /** The last statement was zero or a credit. */
  | { kind: 'none' }
  /** Paid in full since it closed. */
  | { kind: 'paid' }
  | { kind: 'due'; unpaid: number; dueOn: string; minimumLeft: number; overdue: boolean };

export interface CardSummary {
  statements: Statement[];
  last: Statement;
  owedNow: number;
  /** Purchases since the last statement closed. */
  unbilled: number;
  availableCredit: number;
  paidSinceClose: number;
  status: CardStatus;
  /** Due, and 7 days or less from its due date, or past it. */
  remind: boolean;
}

const REMIND_DAYS = 7;

export function summarizeCard(
  terms: CardTerms,
  purchases: CardTxn[],
  payments: CardTxn[],
  today: string,
): CardSummary {
  const statements = buildStatements(terms, purchases, payments, today);
  const last = statements[statements.length - 1];
  const since = (txns: CardTxn[]) =>
    round2(txns.filter(t => t.date > last.closesOn).reduce((s, t) => s + t.amount, 0));

  const paidSinceClose = since(payments);
  const unbilled = since(purchases);
  // Interest or fees not yet posted are left out until their statement closes.
  const owedNow = round2(last.balance - paidSinceClose + unbilled);
  const availableCredit = round2(Math.max(0, terms.creditLimit - owedNow));
  const unpaid = round2(last.balance - paidSinceClose);

  let status: CardStatus;
  if (last.balance <= 0) status = { kind: 'none' };
  else if (unpaid <= 0) status = { kind: 'paid' };
  else status = {
    kind: 'due', unpaid, dueOn: last.dueOn,
    minimumLeft: round2(Math.max(0, last.minimumDue - paidSinceClose)),
    overdue: today > last.dueOn,
  };

  const remind = status.kind === 'due' && today >= addDays(status.dueOn, -REMIND_DAYS);
  return { statements, last, owedNow, unbilled, availableCredit, paidSinceClose, status, remind };
}

/** Interest and fees on statements closing on or after `from` and before `before`. */
export function chargesInRange(statements: Statement[], from: string, before: string): number {
  return round2(statements
    .filter(s => s.closesOn >= from && s.closesOn < before)
    .reduce((sum, s) => sum + s.charges.interest + s.charges.lateFee + s.charges.annualFee, 0));
}

// ── The add and edit card form ──────────────────────────────────────────────

export interface CardFormFields {
  name: string;
  creditLimit: string;
  openingBalance: string;
  statementDay: string;
  dueDay: string;
  monthlyInterestRate: string;
  minPaymentPercent: string;
  minPaymentFloor: string;
  lateFee: string;
  annualFee: string;
  annualFeeMonth: string;
}

export interface CardFormValues {
  name: string;
  creditLimit: number;
  openingBalance: number;
  statementDay: number;
  dueDay: number;
  monthlyInterestRate: number;
  minPaymentPercent: number;
  minPaymentFloor: number;
  lateFee: number | null;
  annualFee: number | null;
  annualFeeMonth: number | null;
}

export type CardFormResult =
  | { ok: true; values: CardFormValues }
  | { ok: false; error: string };

// What was typed, checked against what a card can have. Blank optional
// amounts are zero or none. Comparisons are written `!(x >= 0)` so that NaN,
// from text that isn't a number, fails every one of them.
export function parseCardForm(f: CardFormFields): CardFormResult {
  const fail = (error: string): CardFormResult => ({ ok: false, error });
  const blank = (s: string) => s.trim() === '';
  const num = (s: string) => (blank(s) ? NaN : Number(s.trim()));
  const dayOfMonth = (x: number) => Number.isInteger(x) && x >= 1 && x <= 31;
  const percent = (x: number) => x >= 0 && x <= 100;

  const name = f.name.trim();
  if (!name) return fail('Give the card a name.');

  const creditLimit = num(f.creditLimit);
  if (!(creditLimit > 0)) return fail('The credit limit must be more than zero.');

  const openingBalance = blank(f.openingBalance) ? 0 : num(f.openingBalance);
  if (!(openingBalance >= 0)) return fail('What you owe now can’t be negative.');

  const statementDay = num(f.statementDay);
  if (!dayOfMonth(statementDay)) return fail('The statement day must be a day of the month, 1 to 31.');
  const dueDay = num(f.dueDay);
  if (!dayOfMonth(dueDay)) return fail('The due day must be a day of the month, 1 to 31.');

  const monthlyInterestRate = num(f.monthlyInterestRate);
  if (!percent(monthlyInterestRate)) return fail('The monthly interest rate must be from 0 to 100%.');

  const minPaymentPercent = num(f.minPaymentPercent);
  if (!percent(minPaymentPercent)) return fail('The minimum payment percentage must be from 0 to 100%.');
  const minPaymentFloor = blank(f.minPaymentFloor) ? 0 : num(f.minPaymentFloor);
  if (!(minPaymentFloor >= 0)) return fail('The minimum payment floor can’t be negative.');

  const lateFee = blank(f.lateFee) ? null : num(f.lateFee);
  if (lateFee !== null && !(lateFee >= 0)) return fail('The late fee can’t be negative.');

  const annualFee = blank(f.annualFee) ? null : num(f.annualFee);
  if (annualFee !== null && !(annualFee >= 0)) return fail('The annual fee can’t be negative.');
  let annualFeeMonth: number | null = null;
  if (annualFee !== null) {
    annualFeeMonth = num(f.annualFeeMonth);
    if (!(Number.isInteger(annualFeeMonth) && annualFeeMonth >= 1 && annualFeeMonth <= 12)) {
      return fail('Choose the month the annual fee is charged.');
    }
  }

  return {
    ok: true,
    values: {
      name, creditLimit, openingBalance, statementDay, dueDay,
      monthlyInterestRate, minPaymentPercent, minPaymentFloor,
      lateFee, annualFee, annualFeeMonth,
    },
  };
}
