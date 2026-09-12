# Credit Cards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user add credit cards, pay for expenses with them, see each statement's balance, minimum and due date with interest and fees, and track limit usage.

**Architecture:** Cards are their own `credit_cards` rows; wallets are untouched. A card purchase is an expense with `card_id` set and `wallet_id` null, and paying a card is a `card_payment` money movement out of a wallet. Every statement figure is calculated by a pure module, `src/lib/creditCard.ts`, from the card's terms, purchases and payments; `AppContext` feeds it and exposes the results to the screens.

**Tech Stack:** Next.js 16 (App Router, client components), React 19, TypeScript, Tailwind v4, Supabase, Node's built-in test runner (`node --test --experimental-strip-types`).

**Spec:** `docs/superpowers/specs/2026-09-11-credit-cards-design.md`

## Global Constraints

- Work on a branch `feat/credit-cards` made from `main`.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing Next.js-specific code (AGENTS.md).
- Pure logic lives in `src/lib/*.ts` with a `*.test.ts` beside it. `src/lib` modules have **no runtime imports of each other** (Node's test runner can't resolve extensionless imports); `import type` is fine.
- Dates in `creditCard.ts` are local calendar days as `'YYYY-MM-DD'` strings. Convert stored instants with `isoDay(new Date(iso))` from `AppContext`.
- Money is rounded to the centavo: `Math.round(n * 100) / 100`.
- Interest is an estimate; any screen showing interest labels it "(estimate)".
- Colours: teal marks things to tap; green, amber and red only carry meaning (good, nearing a limit, over).
- A commit that changes something users notice ends with `Patch-note:` lines (AGENTS.md).
- Verification per task: the task's own test file. Before finishing the branch: `npm test`, `npx tsc --noEmit`, `npx eslint` on touched files (AppContext already has 1 error and 1 warning; compare against `main`), `npm run build`.
- The database migration is run by the user in the Supabase SQL editor. Never apply it from code.

## File map

| File | Responsibility |
|---|---|
| `docs/sql/2026-09-11-credit-cards.sql` | Create | Migration: `credit_cards`, `card_id` columns, `card_payment` kind |
| `src/lib/creditCard.ts` | Create | Statement dates, statements, card summary, charges in a range, card form parsing |
| `src/lib/creditCard.test.ts` | Create | Tests for the above |
| `src/lib/walletDeltas.ts` | Modify | `card_payment` in `moveDeltas` |
| `src/lib/walletDeltas.test.ts` | Modify | Card payment and card purchase deltas |
| `src/components/AppContext.tsx` | Modify | Card types, load, add/update/archive/pay, card-funded expenses, summaries, owed on cards, charges in spending |
| `src/components/WalletPresetPicker.tsx` | Modify | Optional `groups` and `title` props |
| `src/components/CreditCardForm.tsx` | Create | Add and edit a card |
| `src/components/CreditCardTile.tsx` | Create | A card on the Wallets page; status text helpers |
| `src/components/CreditCardSheet.tsx` | Create | Card details, delete (archive) |
| `src/components/PayCardSheet.tsx` | Create | Pay a card from a wallet |
| `src/components/FundingPicker.tsx` | Create | Wallets then cards, for editing an expense |
| `src/components/CardDueStrip.tsx` | Create | Dashboard due reminder |
| `src/app/wallets/page.tsx` | Modify | Wallet / Credit card switch, cards section, owed line, sheets |
| `src/app/expenses/new/page.tsx` | Modify | Cards in "Pay from", over-limit warning |
| `src/components/EditEntrySheet.tsx` | Modify | FundingPicker for expenses, date-before-card guard |
| `src/app/page.tsx` | Modify | Owed-on-cards line, due strips, pay sheet |
| `src/components/ActivityRow.tsx` | Modify | `cardPayment` and `charge` sources |
| `src/app/transactions/page.tsx` | Modify | Card purchases, payments and charges in the feed |

---

### Task 1: Database migration

**Files:**
- Create: `docs/sql/2026-09-11-credit-cards.sql`

**Interfaces:**
- Produces: table `credit_cards` (columns in the SQL below); `expenses.card_id`; `money_moves.card_id`; money move kind `'card_payment'`.

- [ ] **Step 1: Write the migration**

Create `docs/sql/2026-09-11-credit-cards.sql`:

```sql
-- Credit cards (2026-09-11)
--
-- Run in the Supabase SQL editor. Paste and run the whole block at once:
-- Postgres parses the entire batch first, so a partial paste fails with a
-- syntax error on the line after the cut. Safe to run twice.


-- 1. Cards. Never deleted, only archived, so rows that reference one never dangle.
create table if not exists credit_cards (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users(id) on delete cascade,
  name                  text not null,
  icon                  text not null default 'credit-card',
  credit_limit          numeric not null check (credit_limit > 0),
  statement_day         int not null check (statement_day between 1 and 31),
  due_day               int not null check (due_day between 1 and 31),
  monthly_interest_rate numeric not null check (monthly_interest_rate between 0 and 100),
  min_payment_percent   numeric not null check (min_payment_percent between 0 and 100),
  min_payment_floor     numeric not null default 0 check (min_payment_floor >= 0),
  late_fee              numeric check (late_fee >= 0),
  annual_fee            numeric check (annual_fee >= 0),
  annual_fee_month      int check (annual_fee_month between 1 and 12),
  opening_balance       numeric not null default 0 check (opening_balance >= 0),
  created_at            timestamptz not null default now(),
  archived_at           timestamptz,
  constraint credit_cards_annual_fee_has_month
    check (annual_fee is null or annual_fee_month is not null)
);

alter table credit_cards enable row level security;

drop policy if exists credit_cards_select_own on credit_cards;
drop policy if exists credit_cards_insert_own on credit_cards;
drop policy if exists credit_cards_update_own on credit_cards;
drop policy if exists credit_cards_delete_own on credit_cards;
create policy credit_cards_select_own on credit_cards for select using (auth.uid() = user_id);
create policy credit_cards_insert_own on credit_cards for insert with check (auth.uid() = user_id);
create policy credit_cards_update_own on credit_cards for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy credit_cards_delete_own on credit_cards for delete using (auth.uid() = user_id);


-- 2. A purchase is paid from a wallet or a card, never both.
alter table expenses add column if not exists card_id uuid references credit_cards(id);
alter table expenses drop constraint if exists expenses_one_funding_source;
alter table expenses add constraint expenses_one_funding_source
  check (wallet_id is null or card_id is null);


-- 3. Paying a card: a movement out of a wallet, naming the card.
alter table money_moves add column if not exists card_id uuid references credit_cards(id);

-- The kind check was created by hand and its name is not known, so any check
-- on money_moves.kind is dropped before the full list is added back.
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'money_moves'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table money_moves drop constraint %I', c.conname);
  end loop;
end $$;

alter table money_moves add constraint money_moves_kind_check
  check (kind in ('earned', 'withdrawn', 'moved', 'debt_out', 'debt_in',
                  'fund_deposit', 'fund_withdrawal', 'card_payment'));
```

- [ ] **Step 2: Check it parses as PostgreSQL**

In the scratchpad directory (not the repo):

```bash
mkdir -p sqlcheck && cd sqlcheck && npm init -y >/dev/null && npm install --silent libpg-query
node --input-type=module -e "
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const pg = createRequire(process.cwd() + '/package.json')('libpg-query');
if (pg.loadModule) await pg.loadModule();
const sql = readFileSync('<repo>/docs/sql/2026-09-11-credit-cards.sql', 'utf8');
const parse = pg.parseSync ?? pg.parseQuerySync;
const tree = await (parse ? parse(sql) : pg.parse(sql));
console.log(tree.stmts.length, 'statements');"
```

Replace `<repo>` with the repository path. Expected: `16 statements`, no error.

- [ ] **Step 3: Ask the user to run it**

Tell the user to paste the whole file into the Supabase SQL editor and run it, and wait for them to confirm success. Later manual checks depend on it; code tasks can proceed meanwhile.

- [ ] **Step 4: Commit**

```bash
git add docs/sql/2026-09-11-credit-cards.sql
git commit -m "docs: SQL for credit cards"
```

---

### Task 2: Statement dates and statements

**Files:**
- Create: `src/lib/creditCard.ts`
- Test: `src/lib/creditCard.test.ts`

**Interfaces:**
- Produces (exported from `src/lib/creditCard.ts`):
  - `interface CardTerms { creditLimit: number; statementDay: number; dueDay: number; monthlyInterestRate: number; minPaymentPercent: number; minPaymentFloor: number; lateFee: number | null; annualFee: number | null; annualFeeMonth: number | null; openingBalance: number; addedOn: string }`
  - `interface CardTxn { date: string; amount: number }`
  - `interface Charges { interest: number; lateFee: number; annualFee: number }`
  - `interface Statement { closesOn: string; dueOn: string; opening: boolean; purchases: number; payments: number; charges: Charges; balance: number; minimumDue: number; paidByDue: number }`
  - `ymdToDate(ymd: string): Date`
  - `addDays(ymd: string, days: number): string`
  - `closeDateIn(year: number, month: number, statementDay: number): string` (month zero-based)
  - `dueDateAfter(closesOn: string, dueDay: number): string`
  - `minimumDue(balance: number, percent: number, floor: number): number`
  - `buildStatements(terms: CardTerms, purchases: CardTxn[], payments: CardTxn[], today: string): Statement[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/creditCard.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  addDays, closeDateIn, dueDateAfter, minimumDue, buildStatements, type CardTerms,
} from './creditCard.ts';

const terms = (over: Partial<CardTerms> = {}): CardTerms => ({
  creditLimit: 50000, statementDay: 5, dueDay: 25,
  monthlyInterestRate: 3, minPaymentPercent: 3, minPaymentFloor: 500,
  lateFee: null, annualFee: null, annualFeeMonth: null,
  openingBalance: 0, addedOn: '2026-01-10',
  ...over,
});
const tx = (date: string, amount: number) => ({ date, amount });

test('a statement day past the end of a month closes on its last day', () => {
  assert.equal(closeDateIn(2026, 1, 31), '2026-02-28');
  assert.equal(closeDateIn(2028, 1, 31), '2028-02-29');
  assert.equal(closeDateIn(2026, 3, 31), '2026-04-30');
  assert.equal(closeDateIn(2026, 12, 5), '2027-01-05');
  assert.equal(closeDateIn(2026, -1, 31), '2025-12-31');
});

test('a statement is due on the first due day strictly after it closes', () => {
  assert.equal(dueDateAfter('2026-01-05', 25), '2026-01-25');
  assert.equal(dueDateAfter('2026-01-25', 5), '2026-02-05');
  assert.equal(dueDateAfter('2026-01-05', 5), '2026-02-05');
  assert.equal(dueDateAfter('2026-12-20', 10), '2027-01-10');
  assert.equal(dueDateAfter('2026-02-28', 30), '2026-03-30');
});

test('days add across month and year ends', () => {
  assert.equal(addDays('2026-01-25', -7), '2026-01-18');
  assert.equal(addDays('2026-12-30', 3), '2027-01-02');
});

test('the minimum is the percent or the floor, whichever is higher, capped at the balance', () => {
  assert.equal(minimumDue(10000, 3, 500), 500);
  assert.equal(minimumDue(20000, 3, 500), 600);
  assert.equal(minimumDue(300, 3, 500), 300);
  assert.equal(minimumDue(0, 3, 500), 0);
  assert.equal(minimumDue(-50, 3, 500), 0);
});

test('statements run from the latest close on or before the day the card was added', () => {
  const closes = (t: CardTerms, today: string) => buildStatements(t, [], [], today).map(s => s.closesOn);
  assert.deepEqual(closes(terms(), '2026-03-20'), ['2026-01-05', '2026-02-05', '2026-03-05']);
  // Added Jan 3, so the opening statement is the Dec 5 close before it — and by
  // Jan 20 the Jan 5 one has closed too.
  assert.deepEqual(closes(terms({ addedOn: '2026-01-03' }), '2026-01-20'), ['2025-12-05', '2026-01-05']);
  assert.deepEqual(closes(terms({ addedOn: '2026-01-05' }), '2026-01-05'), ['2026-01-05']);
});

test('the opening statement is what was owed when the card was added', () => {
  const [opening] = buildStatements(terms({ openingBalance: 2000 }), [], [], '2026-01-20');
  assert.equal(opening.opening, true);
  assert.equal(opening.balance, 2000);
  assert.equal(opening.dueOn, '2026-01-25');
  assert.equal(opening.minimumDue, 500);
  assert.deepEqual(opening.charges, { interest: 0, lateFee: 0, annualFee: 0 });
});

test('a purchase on the closing day belongs to that statement; the next day, to the next', () => {
  const s = buildStatements(terms(), [tx('2026-02-05', 1000), tx('2026-02-06', 200)], [], '2026-03-10');
  assert.equal(s[1].purchases, 1000);
  assert.equal(s[2].purchases, 200);
});

test('paid in full by the due date means no interest', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 3000)], '2026-03-10');
  assert.equal(s[1].balance, 3000);
  assert.equal(s[1].paidByDue, 3000);
  assert.equal(s[2].charges.interest, 0);
  assert.equal(s[2].balance, 0);
});

test('interest is charged on the part left unpaid by the due date', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 1000)], '2026-03-10');
  assert.equal(s[2].charges.interest, 60);
  assert.equal(s[2].balance, 2060);
});

test('a payment after the due date does not count as paid by due', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-27', 3000)], '2026-03-10');
  assert.equal(s[1].paidByDue, 0);
  assert.equal(s[2].charges.interest, 90);
  assert.equal(s[2].balance, 90);
});

test('the late fee applies only when set and less than the minimum was paid', () => {
  const run = (lateFee: number | null, paid: number) =>
    buildStatements(terms({ lateFee }), [tx('2026-01-20', 3000)], [tx('2026-02-20', paid)], '2026-03-10')[2];
  assert.equal(run(850, 50).charges.lateFee, 850);
  assert.equal(run(850, 500).charges.lateFee, 0);
  assert.equal(run(null, 50).charges.lateFee, 0);
});

test('the annual fee posts in its month, never on the opening statement', () => {
  const t = terms({ annualFee: 3000, annualFeeMonth: 2 });
  const s = buildStatements(t, [], [], '2026-03-10');
  assert.equal(s[1].charges.annualFee, 3000);
  assert.equal(s[1].balance, 3000);
  assert.equal(s[2].charges.annualFee, 0);

  const [opening] = buildStatements(terms({ annualFee: 3000, annualFeeMonth: 2, addedOn: '2026-02-10' }), [], [], '2026-02-20');
  assert.equal(opening.charges.annualFee, 0);
});

test('paying more than is owed leaves a credit with no minimum', () => {
  const s = buildStatements(terms(), [tx('2026-01-20', 1000)], [tx('2026-02-20', 1500)], '2026-03-10');
  assert.equal(s[2].balance, -500);
  assert.equal(s[2].minimumDue, 0);
});

// Statement day 28 with due day 30: the statement closing Feb 28 is due Mar 30,
// after the next statement closes on Mar 28. Its charges post on the first close
// on or after Mar 30. The Mar 28 statement is due Mar 30 as well and its balance
// already carries the Feb one's, so interest is charged once, not twice.
test('a due date after the next close posts its charges on the first close on or after it', () => {
  const t = terms({ statementDay: 28, dueDay: 30, addedOn: '2026-01-29' });
  const s = buildStatements(t, [tx('2026-02-10', 2000)], [], '2026-04-30');
  assert.deepEqual(s.map(x => x.closesOn), ['2026-01-28', '2026-02-28', '2026-03-28', '2026-04-28']);
  assert.equal(s[1].dueOn, '2026-03-30');
  assert.equal(s[2].charges.interest, 0);
  assert.equal(s[3].charges.interest, 60);

  const paid = buildStatements(t, [tx('2026-02-10', 2000)], [tx('2026-03-29', 2000)], '2026-04-30');
  assert.equal(paid[3].charges.interest, 0);
  assert.equal(paid[3].balance, 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types src/lib/creditCard.test.ts`
Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `creditCard.ts`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/creditCard.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types src/lib/creditCard.test.ts`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/creditCard.ts src/lib/creditCard.test.ts
git commit -m "feat: credit card statement maths"
```

---

### Task 3: Card summary, charges in a range, and form parsing

**Files:**
- Modify: `src/lib/creditCard.ts`
- Test: `src/lib/creditCard.test.ts`

**Interfaces:**
- Consumes: `CardTerms`, `CardTxn`, `Statement`, `buildStatements`, `addDays` from Task 2.
- Produces (exported from `src/lib/creditCard.ts`):
  - `type CardStatus = { kind: 'none' } | { kind: 'paid' } | { kind: 'due'; unpaid: number; dueOn: string; minimumLeft: number; overdue: boolean }`
  - `interface CardSummary { statements: Statement[]; last: Statement; owedNow: number; unbilled: number; availableCredit: number; paidSinceClose: number; status: CardStatus; remind: boolean }`
  - `summarizeCard(terms: CardTerms, purchases: CardTxn[], payments: CardTxn[], today: string): CardSummary`
  - `chargesInRange(statements: Statement[], from: string, before: string): number`
  - `interface CardFormFields { name: string; creditLimit: string; openingBalance: string; statementDay: string; dueDay: string; monthlyInterestRate: string; minPaymentPercent: string; minPaymentFloor: string; lateFee: string; annualFee: string; annualFeeMonth: string }`
  - `interface CardFormValues { name: string; creditLimit: number; openingBalance: number; statementDay: number; dueDay: number; monthlyInterestRate: number; minPaymentPercent: number; minPaymentFloor: number; lateFee: number | null; annualFee: number | null; annualFeeMonth: number | null }`
  - `type CardFormResult = { ok: true; values: CardFormValues } | { ok: false; error: string }`
  - `parseCardForm(fields: CardFormFields): CardFormResult`

- [ ] **Step 1: Write the failing tests**

Change the import at the top of `src/lib/creditCard.test.ts` to:

```ts
import {
  addDays, closeDateIn, dueDateAfter, minimumDue, buildStatements,
  summarizeCard, chargesInRange, parseCardForm,
  type CardTerms, type CardFormFields,
} from './creditCard.ts';
```

Append to the end of `src/lib/creditCard.test.ts`:

```ts
test('owed now is the last statement, less payments since, plus purchases since', () => {
  const t = terms({ openingBalance: 2000 });
  const s = summarizeCard(t, [tx('2026-01-15', 500)], [tx('2026-01-18', 300)], '2026-01-20');
  assert.equal(s.last.closesOn, '2026-01-05');
  assert.equal(s.owedNow, 2200);
  assert.equal(s.unbilled, 500);
  assert.equal(s.paidSinceClose, 300);
  assert.equal(s.availableCredit, 47800);
});

test('available credit never goes below zero', () => {
  const s = summarizeCard(terms({ creditLimit: 1000, openingBalance: 1500 }), [], [], '2026-01-20');
  assert.equal(s.availableCredit, 0);
});

test('a statement with nothing owed has no status to chase', () => {
  const s = summarizeCard(terms(), [], [], '2026-01-20');
  assert.deepEqual(s.status, { kind: 'none' });
  assert.equal(s.remind, false);
});

test('a statement is due until paid, with the minimum still to pay', () => {
  const t = terms({ openingBalance: 2000 });
  assert.deepEqual(summarizeCard(t, [], [tx('2026-01-12', 300)], '2026-01-20').status, {
    kind: 'due', unpaid: 1700, dueOn: '2026-01-25', minimumLeft: 200, overdue: false,
  });
  assert.deepEqual(summarizeCard(t, [], [tx('2026-01-12', 2000)], '2026-01-20').status, { kind: 'paid' });
});

test('a reminder starts 7 days before the due date and stays once overdue', () => {
  const t = terms({ openingBalance: 2000 });
  assert.equal(summarizeCard(t, [], [], '2026-01-17').remind, false);
  assert.equal(summarizeCard(t, [], [], '2026-01-18').remind, true);
  const late = summarizeCard(t, [], [], '2026-01-26');
  assert.equal(late.remind, true);
  assert.equal(late.status.kind === 'due' && late.status.overdue, true);
});

test('charges count in the range their statement closes in', () => {
  const { statements } = summarizeCard(terms(), [tx('2026-01-20', 3000)], [tx('2026-02-20', 1000)], '2026-03-10');
  assert.equal(chargesInRange(statements, '2026-03-01', '2026-04-01'), 60);
  assert.equal(chargesInRange(statements, '2026-02-01', '2026-03-01'), 0);
  assert.equal(chargesInRange(statements, '2026-03-05', '2026-03-06'), 60);
  assert.equal(chargesInRange(statements, '2026-02-06', '2026-03-05'), 0);
});

const fields = (over: Partial<CardFormFields> = {}): CardFormFields => ({
  name: 'BPI Gold', creditLimit: '50000', openingBalance: '',
  statementDay: '5', dueDay: '25',
  monthlyInterestRate: '3', minPaymentPercent: '3', minPaymentFloor: '',
  lateFee: '', annualFee: '', annualFeeMonth: '',
  ...over,
});

test('a card form with only the required fields reads blanks as zero or none', () => {
  assert.deepEqual(parseCardForm(fields()), {
    ok: true,
    values: {
      name: 'BPI Gold', creditLimit: 50000, openingBalance: 0,
      statementDay: 5, dueDay: 25,
      monthlyInterestRate: 3, minPaymentPercent: 3, minPaymentFloor: 0,
      lateFee: null, annualFee: null, annualFeeMonth: null,
    },
  });
});

test('optional fees are read when given', () => {
  const r = parseCardForm(fields({ lateFee: '850', annualFee: '3000', annualFeeMonth: '2' }));
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.values.lateFee, 850);
    assert.equal(r.values.annualFee, 3000);
    assert.equal(r.values.annualFeeMonth, 2);
  }
});

test('a month without an annual fee is ignored', () => {
  const r = parseCardForm(fields({ annualFeeMonth: '6' }));
  assert.equal(r.ok && r.values.annualFeeMonth, null);
});

test('a card form refuses what a card cannot have', () => {
  const bad: Partial<CardFormFields>[] = [
    { name: '  ' },
    { creditLimit: '0' }, { creditLimit: '' }, { creditLimit: 'abc' },
    { openingBalance: '-1' },
    { statementDay: '0' }, { statementDay: '32' }, { statementDay: '2.5' }, { dueDay: '' },
    { monthlyInterestRate: '' }, { monthlyInterestRate: '101' },
    { minPaymentPercent: '-3' }, { minPaymentFloor: '-1' },
    { lateFee: '-5' }, { annualFee: '3000' }, { annualFee: '3000', annualFeeMonth: '13' },
  ];
  for (const b of bad) {
    assert.equal(parseCardForm(fields(b)).ok, false, JSON.stringify(b));
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test --experimental-strip-types src/lib/creditCard.test.ts`
Expected: FAIL with `does not provide an export named 'summarizeCard'`.

- [ ] **Step 3: Write the implementation**

Append to the end of `src/lib/creditCard.ts`:

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types src/lib/creditCard.test.ts`
Expected: PASS, 24 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/creditCard.ts src/lib/creditCard.test.ts
git commit -m "feat: credit card summary, charges and form parsing"
```

---

### Task 4: Cards in AppContext

**Files:**
- Modify: `src/lib/walletDeltas.ts`
- Test: `src/lib/walletDeltas.test.ts`
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 2–3.
- Produces:
  - `moveDeltas` handles `kind: 'card_payment'`.
  - `interface CreditCard { id: string; name: string; icon: string; creditLimit: number; statementDay: number; dueDay: number; monthlyInterestRate: number; minPaymentPercent: number; minPaymentFloor: number; lateFee: number | null; annualFee: number | null; annualFeeMonth: number | null; openingBalance: number; createdAt: string; archivedAt: string | null }`
  - `type CreditCardInput = Omit<CreditCard, 'id' | 'createdAt' | 'archivedAt'>`
  - `Expense.cardId: string | null`, `MoneyMove.cardId: string | null`, kind `'card_payment'`
  - On the context: `creditCards: CreditCard[]`, `addCreditCard(c: CreditCardInput): Promise<boolean>`, `updateCreditCard(id: string, updates: Partial<CreditCardInput>): Promise<boolean>`, `archiveCreditCard(id: string): Promise<void>`, `payCreditCard(cardId: string, amount: number, walletId: string): Promise<boolean>`

- [ ] **Step 1: Write the failing tests**

Append to `src/lib/walletDeltas.test.ts`:

```ts
// Paying a card bill is money leaving the wallet it is paid from. A card is not
// a wallet, so nothing lands anywhere.
test('a card payment takes the amount out of the wallet it is paid from', () => {
  const d = moveDeltas({
    kind: 'card_payment', amount: 5000, fee: 0,
    walletId: 'bpi', toWalletId: null,
  });

  assert.deepEqual(d, { bpi: -5000 });
});

test('deleting a card payment puts the money back', () => {
  const d = negate(moveDeltas({
    kind: 'card_payment', amount: 5000, fee: 0,
    walletId: 'bpi', toWalletId: null,
  }));

  assert.deepEqual(d, { bpi: 5000 });
});

// Guard, not a driven cycle: a card purchase carries no wallet, and the wallet
// only moves when the bill is paid. The split's share is owed to you either way.
test('an expense paid by card moves no wallet', () => {
  const d = expenseDeltas({ walletId: null, myShare: 1200, owedToMe: [{ amount: 300 }] });

  assert.deepEqual(d, {});
});
```

- [ ] **Step 2: Run the tests**

Run: `node --test --experimental-strip-types src/lib/walletDeltas.test.ts`
Expected: PASS, including the two new card payment tests. They are guards, not a driven cycle: a card payment carries no fee and no destination, so the existing fall-through already returns `-amount`, and negating it already returns `+amount`. The branch added in Step 3 states that intent explicitly, next to the fund movements that need their own branches — it does not change today's behaviour.

- [ ] **Step 3: Add the branch to `moveDeltas`**

In `src/lib/walletDeltas.ts`, after the `fund_withdrawal` line:

```ts
  if (m.kind === 'fund_withdrawal') return { [m.walletId]:  m.amount };
  // Paying a credit card bill: money leaves the wallet it is paid from, and a
  // card is not a wallet, so nothing lands anywhere.
  if (m.kind === 'card_payment')    return { [m.walletId]: -m.amount };
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test --experimental-strip-types src/lib/walletDeltas.test.ts`
Expected: PASS.

- [ ] **Step 5: Add the card type and the row mappers**

In `src/components/AppContext.tsx`, after the `Wallet` interface:

```ts
export interface Wallet {
  id: string; name: string; icon: string; balance: number;
}

// A credit card. Deliberately NOT a wallet: it is money you owe, not money you
// have, so it stays out of wallet lists and out of the total balance. Nothing
// about a statement is stored — lib/creditCard.ts works it out from these terms
// and the card's purchases and payments.
export interface CreditCard {
  id: string; name: string; icon: string;
  creditLimit: number;
  /** Day of the month the statement closes, clamped in short months. */
  statementDay: number;
  /** Day of the month it is due: the first one after it closes. */
  dueDay: number;
  /** Percent per month, charged on what is unpaid by the due date. */
  monthlyInterestRate: number;
  minPaymentPercent: number;
  minPaymentFloor: number;
  lateFee: number | null;
  annualFee: number | null;
  annualFeeMonth: number | null;
  /** What was owed on the day the card was added. */
  openingBalance: number;
  createdAt: string;
  /** Set instead of deleting: its purchases and payments are real history. */
  archivedAt: string | null;
}

export type CreditCardInput = Omit<CreditCard, 'id' | 'createdAt' | 'archivedAt'>;
```

In the `Expense` interface:

```ts
export interface Expense {
  id: string; amount: number; category: Category;
  // null means no wallet of yours moved: another person paid, or a card did.
  // cardId says which of the two it was.
  walletId: string | null; note: string; date: string;
  /** The card that paid, when one did. Never set together with walletId. */
  cardId: string | null;
```

The move kinds:

```ts
// fund_deposit / fund_withdrawal — money set aside into the emergency fund from
// a wallet, or taken back out into one. Like debt movements, neither is spending
// or income: it is your own money changing place.
// card_payment — paying a credit card bill from a wallet. Not spending either:
// the purchases counted when they were made.
export type MoneyMoveKind =
  | 'earned' | 'withdrawn' | 'moved' | 'debt_out' | 'debt_in'
  | 'fund_deposit' | 'fund_withdrawal' | 'card_payment';
```

In the `MoneyMove` interface:

```ts
  source: IncomeSource | null; note: string; date: string;
  /** The card a card_payment paid. Null on every other kind. */
  cardId: string | null;
  updatedAt: string | null;
}
```

After `fromDBWallet`, add the card mappers:

```ts
const fromDBCreditCard = (r: Row): CreditCard => ({
  id: r.id, name: r.name, icon: r.icon || 'credit-card',
  creditLimit: Number(r.credit_limit),
  statementDay: Number(r.statement_day),
  dueDay: Number(r.due_day),
  monthlyInterestRate: Number(r.monthly_interest_rate),
  minPaymentPercent: Number(r.min_payment_percent),
  minPaymentFloor: Number(r.min_payment_floor) || 0,
  // A fee that is not set is null, which Number() would turn into 0 — a real
  // ₱0 fee — so each is checked before it is converted.
  lateFee: r.late_fee == null ? null : Number(r.late_fee),
  annualFee: r.annual_fee == null ? null : Number(r.annual_fee),
  annualFeeMonth: r.annual_fee_month ?? null,
  openingBalance: Number(r.opening_balance) || 0,
  createdAt: r.created_at,
  archivedAt: r.archived_at ?? null,
});

// Only the fields present are written, so an edit can send a few of them.
const toDBCreditCard = (c: Partial<CreditCardInput>): Row => {
  const m: Row = {};
  if ('name'                in c) m.name                  = c.name;
  if ('icon'                in c) m.icon                  = c.icon;
  if ('creditLimit'         in c) m.credit_limit          = c.creditLimit;
  if ('statementDay'        in c) m.statement_day         = c.statementDay;
  if ('dueDay'              in c) m.due_day               = c.dueDay;
  if ('monthlyInterestRate' in c) m.monthly_interest_rate = c.monthlyInterestRate;
  if ('minPaymentPercent'   in c) m.min_payment_percent   = c.minPaymentPercent;
  if ('minPaymentFloor'     in c) m.min_payment_floor     = c.minPaymentFloor;
  if ('lateFee'             in c) m.late_fee              = c.lateFee;
  if ('annualFee'           in c) m.annual_fee            = c.annualFee;
  if ('annualFeeMonth'      in c) m.annual_fee_month      = c.annualFeeMonth;
  if ('openingBalance'      in c) m.opening_balance       = c.openingBalance;
  return m;
};
```

Add the new column to the expense and move mappers:

```ts
const fromDBExpense    = (r: Row): Expense    => ({
  id: r.id, amount: Number(r.amount), category: r.category as Category,
  walletId: r.wallet_id ?? null, note: r.note || '', date: r.date,
  cardId: r.card_id ?? null,
  updatedAt: r.updated_at ?? null,
});
```

```ts
  source: (r.source ?? null) as IncomeSource | null,
  note: r.note || '', date: r.date,
  cardId: r.card_id ?? null,
  updatedAt: r.updated_at ?? null,
});
```

- [ ] **Step 6: Load cards, and clear them with everything else**

State, after `debtEntries`:

```ts
  const [debtPeople,           setDebtPeople]           = useState<DebtPerson[]>([]);
  const [debtEntries,          setDebtEntries]          = useState<DebtEntry[]>([]);
  const [creditCards,          setCreditCards]          = useState<CreditCard[]>([]);
```

Signing out:

```ts
      setEmergencyFund({ entries: [], currentAmount: 0 });
      setDebtPeople([]); setDebtEntries([]);
      setCreditCards([]);
      return;
```

In `loadAll`, add `ccRes` to the destructure:

```ts
    const [sRes, wRes, eRes, mmRes, bRes, blRes, aRes, ipRes, efRes, dpRes, deRes, ccRes] = await Promise.all([
```

and the query at the end of that array:

```ts
      supabase.from('debt_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
      // Archived cards load too, so old rows can still name the card they used.
      supabase.from('credit_cards').select('*').eq('user_id', uid).order('created_at'),
    ]);
```

and the state it fills:

```ts
    if (deRes.data) setDebtEntries(deRes.data.map(fromDBDebtEntry));
    if (ccRes.data) setCreditCards(ccRes.data.map(fromDBCreditCard));
    setDataLoading(false);
```

- [ ] **Step 7: Carry the card on a money movement**

`insertMove`'s parameter, so only a card payment names a card:

```ts
  const insertMove = async (
    // Only withdrawals and transfers can carry a fee, and only a card payment
    // names a card; the rest omit both.
    move: Omit<MoneyMove, 'id' | 'date' | 'fee' | 'updatedAt' | 'cardId'>
      & { fee?: number; cardId?: string | null },
    date?: string,
  ): Promise<string | null> => {
```

its optimistic row:

```ts
    setMoneyMoves(prev => [
      { ...move, fee: move.fee ?? 0, cardId: move.cardId ?? null, id: tempId, date: now, updatedAt: null },
      ...prev,
    ]);
```

its insert:

```ts
      fee: move.fee ?? 0, source: move.source, note: move.note, date: now,
      card_id: move.cardId ?? null,
    }).select().single();
```

and `recordMove`'s matching parameter:

```ts
  const recordMove = async (
    move: Omit<MoneyMove, 'id' | 'date' | 'fee' | 'updatedAt' | 'cardId'>
      & { fee?: number; cardId?: string | null },
    deltas: Deltas,
    date?: string,
  ): Promise<string | null> => {
```

In `updateMoneyMove`, refuse card payments:

```ts
    // Likewise a fund movement belongs to the emergency fund entry that made it.
    if (found.kind === 'fund_deposit' || found.kind === 'fund_withdrawal') return false;
    // A card payment is deleted and made again rather than edited, so it can
    // never disagree with the card it paid.
    if (found.kind === 'card_payment') return false;
```

- [ ] **Step 8: Add the card functions**

Immediately before the `// ── Budget Lines ─` comment:

```ts
  // ── Credit cards ──────────────────────────────────────────────────────────
  // A card is what you owe, not money you have, so none of this touches the
  // wallet list. Statements are calculated on read; only the terms are stored.

  const addCreditCard = async (c: CreditCardInput): Promise<boolean> => {
    if (!userId) return false;
    const { data } = await supabase.from('credit_cards')
      .insert({ user_id: userId, ...toDBCreditCard(c) })
      .select().single();
    if (!data) return false;
    setCreditCards(prev => [...prev, fromDBCreditCard(data)]);
    return true;
  };

  const updateCreditCard = async (id: string, updates: Partial<CreditCardInput>): Promise<boolean> => {
    const { error } = await supabase.from('credit_cards').update(toDBCreditCard(updates)).eq('id', id);
    if (error) return false;
    setCreditCards(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
    return true;
  };

  // Deleting would take real spending and real payments with it, so a card is
  // archived: it leaves every list, and its history keeps its name.
  const archiveCreditCard = async (id: string) => {
    const archivedAt = new Date().toISOString();
    setCreditCards(prev => prev.map(c => c.id === id ? { ...c, archivedAt } : c));
    await supabase.from('credit_cards').update({ archived_at: archivedAt }).eq('id', id);
  };

  // Paying the bill moves your own money to the bank. The purchases already
  // counted as spending when they were made, so this is not spending again.
  const payCreditCard = async (cardId: string, amount: number, walletId: string): Promise<boolean> => {
    const card = creditCards.find(c => c.id === cardId);
    if (!card || card.archivedAt || amount <= 0 || !walletId) return false;
    const id = await recordMove(
      {
        kind: 'card_payment', amount, walletId, toWalletId: null, source: null,
        note: `Paid ${card.name}`, cardId,
      },
      moveDeltas({ kind: 'card_payment', amount, fee: 0, walletId, toWalletId: null }),
    );
    return id !== null;
  };

```

- [ ] **Step 9: Clear cards on account reset**

In `resetAccount`, the local state:

```ts
    setEmergencyFund({ entries: [], currentAmount: 0 });
    setDebtPeople([]); setDebtEntries([]);
    setCreditCards([]);
    setSettings(prev => ({
```

and the deletes — cards go with the second group, after expenses and money movements, which reference them:

```ts
    await Promise.all([
      own('debt_people'), own('instalment_payments'), own('emergency_fund_entries'),
      own('bills'), own('budget_lines'), own('appliances'),
      // Expenses and money_moves reference cards, and both are gone above.
      own('credit_cards'),
    ]);
    await own('wallets');
```

- [ ] **Step 10: Declare and expose the new pieces**

In `AppContextValue`, after `emergencyFund: EmergencyFund;`:

```ts
  emergencyFund: EmergencyFund;
  creditCards: CreditCard[];
```

after `deleteEmergencyFundEntry`:

```ts
  deleteEmergencyFundEntry: (id: string) => Promise<boolean>;
  addCreditCard: (c: CreditCardInput) => Promise<boolean>;
  updateCreditCard: (id: string, updates: Partial<CreditCardInput>) => Promise<boolean>;
  /** Archives it: its purchases and payments stay as history. */
  archiveCreditCard: (id: string) => Promise<void>;
  /** Records a card_payment movement out of `walletId`. */
  payCreditCard: (cardId: string, amount: number, walletId: string) => Promise<boolean>;
```

and in the provider's value:

```ts
      recordEmergencyFundEntry, deleteEmergencyFundEntry,
      creditCards, addCreditCard, updateCreditCard, archiveCreditCard, payCreditCard,
```

- [ ] **Step 11: Type check**

Run: `npx tsc --noEmit`
Expected: exit 0. A complaint about a missing `cardId` anywhere means a money movement or expense object is being built by hand somewhere this plan missed — add the field there.

- [ ] **Step 12: Commit**

```bash
git add src/lib/walletDeltas.ts src/lib/walletDeltas.test.ts src/components/AppContext.tsx
git commit -m "feat: store credit cards and card payments"
```

---

### Task 5: Card purchases, summaries and spending

**Files:**
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Consumes: `summarizeCard`, `chargesInRange`, `CardSummary`, `CardTerms`, `CardTxn` (Tasks 2–3); `CreditCard`, `creditCards` (Task 4).
- Produces on the context:
  - `cardSummaries: Record<string, CardSummary>` — keyed by card id
  - `owedOnCards: number`
  - `addExpense` and `updateExpense` accept `cardId?: string | null`
  - card interest and fees included in `totalSpentThisMonth`

- [ ] **Step 1: Import the statement maths and map a card to its terms**

The import, after the emergency fund one:

```ts
import { fundBalance, canWithdraw, canDeleteEntry, type FundDirection } from '@/lib/emergencyFund';
import {
  summarizeCard, chargesInRange, type CardSummary, type CardTerms, type CardTxn,
} from '@/lib/creditCard';
```

After `toDBCreditCard`:

```ts
// A card's terms in the shape the statement maths reads. The day it was added
// is a local calendar day, like every date creditCard.ts works with.
const termsOf = (c: CreditCard): CardTerms => ({
  creditLimit: c.creditLimit,
  statementDay: c.statementDay,
  dueDay: c.dueDay,
  monthlyInterestRate: c.monthlyInterestRate,
  minPaymentPercent: c.minPaymentPercent,
  minPaymentFloor: c.minPaymentFloor,
  lateFee: c.lateFee,
  annualFee: c.annualFee,
  annualFeeMonth: c.annualFeeMonth,
  openingBalance: c.openingBalance,
  addedOn: isoDay(new Date(c.createdAt)),
});
```

- [ ] **Step 2: Summarise every card**

Immediately before the `// ── Computed ─` comment:

```ts
  // ── Credit cards ─────────────────────────────────────────────────────────
  // Rebuilt from each card's terms and its rows; nothing about a statement is
  // stored. A purchase charged the card the whole amount paid at the till —
  // your share plus what others owe you back — exactly as a wallet-funded split
  // takes the whole amount out of the wallet.
  const cardSummaries = useMemo<Record<string, CardSummary>>(() => {
    const today = isoDay(new Date());
    const out: Record<string, CardSummary> = {};
    for (const card of creditCards) {
      const purchases: CardTxn[] = expenses
        .filter(e => e.cardId === card.id)
        .map(e => ({
          date: isoDay(new Date(e.date)),
          amount: round2(e.amount + debtEntries
            .filter(d => d.expenseId === e.id && d.direction === 'owed_to_me')
            .reduce((s, d) => s + d.amount, 0)),
        }));
      const payments: CardTxn[] = moneyMoves
        .filter(m => m.kind === 'card_payment' && m.cardId === card.id)
        .map(m => ({ date: isoDay(new Date(m.date)), amount: m.amount }));
      out[card.id] = summarizeCard(termsOf(card), purchases, payments, today);
    }
    return out;
  }, [creditCards, expenses, moneyMoves, debtEntries]);

  // A card in credit does not cancel out another card's debt, so only cards
  // that owe are counted. Archived cards are out of every total.
  const owedOnCards = useMemo(() => round2(creditCards
    .filter(c => !c.archivedAt)
    .reduce((s, c) => s + Math.max(0, cardSummaries[c.id]?.owedNow ?? 0), 0)),
  [creditCards, cardSummaries]);

```

- [ ] **Step 3: Count card interest and fees as spending**

In the computed memo, replace the `totalSpentThisMonth` line:

```ts
    // Card interest and fees are money gone too. They count in the cycle their
    // statement closes in, as bank fees do. An archived card's past charges
    // still happened, so every card counts here.
    const { start: cycleStart, end: cycleEnd } = cycleRange(currentCycle, startDay);
    const cardChargesThisMonth = Object.values(cardSummaries).reduce(
      (s, c) => s + chargesInRange(c.statements, isoDay(cycleStart), isoDay(cycleEnd)), 0,
    );
    const totalSpentThisMonth = monthExpenses.reduce((s, e) => s + e.amount, 0)
      + feesThisMonth + cardChargesThisMonth;
```

and add the summaries to that memo's dependencies:

```ts
  }, [wallets, expenses, moneyMoves, settings, instalmentSchedule, cardSummaries]);
```

- [ ] **Step 4: Let an expense be paid by a card**

`addExpense`'s declared type in `AppContextValue`:

```ts
    walletId: string | null;                          // null = a card or a person paid
    cardId?: string | null;                           // set instead of walletId when a card paid
    paidByPersonId?: string | null;                   // set when neither paid
```

and its implementation's opening:

```ts
  const addExpense = async (e: {
    amount: number; category: Category; note: string;
    walletId: string | null;
    cardId?: string | null;
    paidByPersonId?: string | null;
    owedToMe?: { personId: string; amount: number }[];
    // Returns the new expense's id so a caller that has to remember the
    // expense it caused — a bill being ticked paid — can undo it later.
  }): Promise<string | null> => {
    if (!userId) return null;
    const cardId = e.cardId ?? null;
    // Paid from a wallet or a card, never both, and an archived card takes no
    // new purchases.
    if (e.walletId && cardId) return null;
    if (cardId && !creditCards.some(c => c.id === cardId && !c.archivedAt)) return null;

    // Either way YOU paid the whole amount, so others can owe you their share.
    const paidByMe = Boolean(e.walletId || cardId);
    const owed = paidByMe ? (e.owedToMe ?? []) : [];
    const myShare = round2(paidByMe
      ? e.amount - owed.reduce((s, o) => s + o.amount, 0)
      : e.amount);
```

its insert:

```ts
        user_id: userId, wallet_id: e.walletId, card_id: cardId, amount: myShare,
        category: e.category, note: e.note, date: now,
```

and the split rows it writes — a card purchase makes the same debt rows, with no wallet movement because `walletId` is null:

```ts
    if (paidByMe) {
      for (const o of owed) {
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: e.note, date: now,
          walletId: e.walletId, expenseId, deferBalance: true,
        });
      }
```

- [ ] **Step 5: Let an edit move an expense onto or off a card**

`updateExpense`'s declared type in `AppContextValue`:

```ts
  updateExpense: (id: string, next: {
    amount: number; category: Category; note: string;
    walletId: string | null; cardId?: string | null; date?: string;
    paidByPersonId?: string | null;
    owedToMe?: { personId: string; amount: number }[];
  }) => Promise<boolean>;
```

its implementation's parameter:

```ts
    next: {
      amount: number; category: Category; note: string;
      walletId: string | null;
      cardId?: string | null;
      date?: string;
      paidByPersonId?: string | null;
      owedToMe?: { personId: string; amount: number }[];
    },
```

the share it works out:

```ts
    const cardId = next.cardId ?? null;
    if (next.walletId && cardId) return false;
    const card = cardId ? creditCards.find(c => c.id === cardId) : undefined;
    // An archived card keeps the purchases it has; it takes no new ones.
    if (cardId && (!card || (card.archivedAt && cardId !== found.cardId))) return false;

    const paidByMe = Boolean(next.walletId || cardId);
    const owed = paidByMe ? (next.owedToMe ?? []) : [];
    const myShare = round2(paidByMe
      ? next.amount - owed.reduce((sum, o) => sum + o.amount, 0)
      : next.amount);
```

the date guard, right after the share check (the anchor includes the comment above it, because `const date = next.date ?? found.date;` appears in three functions):

```ts
    // Negative is over-allocated: more owed back than was paid out. Zero would
    // mean the expense should not exist at all — legitimate under the splits
    // model, but dissolving the row the user is editing while invisible debt
    // rows survive is worse than refusing, so the caller deletes instead.
    if (myShare <= 0) return false;

    const date = next.date ?? found.date;
    // What was owed when the card was added already covers anything before it,
    // so a purchase dated earlier would be counted twice.
    if (card && isoDay(new Date(date)) < isoDay(new Date(card.createdAt))) return false;
    const editedAt = new Date().toISOString();
```

the row it writes:

```ts
    const { error: writeFailed } = await supabase.from('expenses').update({
      amount: myShare, category: next.category, note: next.note,
      wallet_id: next.walletId, card_id: cardId, date, updated_at: editedAt,
    }).eq('id', id);
```

the local row:

```ts
    setExpenses(prev => prev.map(e => e.id === id ? {
      ...e, amount: myShare, category: next.category, note: next.note,
      walletId: next.walletId, cardId, date, updatedAt: editedAt,
    } : e));
```

and the split it rebuilds:

```ts
    if (paidByMe) {
      for (const o of owed) {
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: next.note, date,
          walletId: next.walletId, expenseId: id, deferBalance: true,
        });
      }
```

- [ ] **Step 6: Declare the new context values**

In `AppContextValue`, under `creditCards`:

```ts
  creditCards: CreditCard[];
  /** Statements and figures per card id, calculated from its rows. */
  cardSummaries: Record<string, CardSummary>;
  /** What is owed across active cards. A card in credit counts as zero. */
  owedOnCards: number;
```

and in the provider's value:

```ts
      creditCards, cardSummaries, owedOnCards,
      addCreditCard, updateCreditCard, archiveCreditCard, payCreditCard,
```

(replacing the single line added in Task 4 Step 10).

- [ ] **Step 7: Check it all still builds**

Run: `npm test` — expected: every test passes, including Tasks 2–4's.
Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

Nothing on screen changes yet: no card can be added until Task 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: card purchases, statements and charges in the budget"
```

---

### Task 6: Adding and editing a card

**Files:**
- Modify: `src/components/WalletPresetPicker.tsx`
- Create: `src/components/CreditCardForm.tsx`
- Modify: `src/app/wallets/page.tsx`

**Interfaces:**
- Consumes: `parseCardForm`, `CardFormFields` (Task 3); `addCreditCard`, `updateCreditCard`, `CreditCard` (Task 4).
- Produces:
  - `WalletPresetPicker` props gain `groups?: typeof WALLET_PRESET_GROUPS` and `title?: string`.
  - `CreditCardForm({ card, onDone }: { card?: CreditCard; onDone: () => void })` — the fields of a card, added or saved.

- [ ] **Step 1: Let the preset picker offer only some groups**

In `src/components/WalletPresetPicker.tsx`, the props and signature:

```tsx
interface Props {
  /** The preset the wallet's name currently matches, if any. */
  selected: WalletPreset | null;
  onPick: (preset: WalletPreset) => void;
  /** Which groups to offer. All of them by default. */
  groups?: typeof WALLET_PRESET_GROUPS;
  title?: string;
}

// Quick pick for a new wallet: one row in the form, and every bank and
// e-wallet, logo first, in a sheet of its own — a native select can't show
// pictures in its options.
export default function WalletPresetPicker({
  selected, onPick, groups = WALLET_PRESET_GROUPS, title = 'Bank or e-wallet',
}: Props) {
```

the sheet's heading:

```tsx
          <p className="text-lg font-semibold text-ink">{title}</p>
```

and the list it maps:

```tsx
          {groups.map(group => (
```

- [ ] **Step 2: Write the card form**

Create `src/components/CreditCardForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useApp, type CreditCard } from './AppContext';
import WalletPresetPicker, { presetIcon } from './WalletPresetPicker';
import { WALLET_PRESET_GROUPS, type WalletPreset } from '@/lib/walletPresets';
import { parseCardForm, type CardFormFields } from '@/lib/creditCard';
import { ChevronDownIcon } from './Icons';

// Cards come from banks, not from e-wallets.
const CARD_PRESET_GROUPS = WALLET_PRESET_GROUPS.filter(g => g.label !== 'Cash & e-wallets');
const CARD_PRESETS = CARD_PRESET_GROUPS.flatMap(g => g.presets);

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const label = 'mb-2 text-xs text-ink-3';
const field = 'w-full rounded-xl bg-canvas border border-line px-4 py-3 text-ink placeholder-ink-4 outline-none focus:border-primary text-sm';

// Editing starts from the card; adding starts blank, with the rates most
// Philippine cards charge already filled in.
const fieldsOf = (card?: CreditCard): CardFormFields => ({
  name: card?.name ?? '',
  creditLimit: card ? String(card.creditLimit) : '',
  openingBalance: card ? String(card.openingBalance) : '',
  statementDay: card ? String(card.statementDay) : '',
  dueDay: card ? String(card.dueDay) : '',
  monthlyInterestRate: card ? String(card.monthlyInterestRate) : '3',
  minPaymentPercent: card ? String(card.minPaymentPercent) : '3',
  minPaymentFloor: card && card.minPaymentFloor ? String(card.minPaymentFloor) : '',
  lateFee: card?.lateFee != null ? String(card.lateFee) : '',
  annualFee: card?.annualFee != null ? String(card.annualFee) : '',
  annualFeeMonth: card?.annualFeeMonth != null ? String(card.annualFeeMonth) : '',
});

interface Props {
  /** The card being edited, or nothing when adding one. */
  card?: CreditCard;
  onDone: () => void;
}

// A card's terms are typed once here; every statement figure is worked out
// from them afterwards, so this is the only place they are entered.
export default function CreditCardForm({ card, onDone }: Props) {
  const { addCreditCard, updateCreditCard, settings } = useApp();
  const [fields, setFields] = useState<CardFormFields>(() => fieldsOf(card));
  const [icon, setIcon] = useState(card?.icon ?? 'credit-card');
  const [showFees, setShowFees] = useState(Boolean(card && (card.lateFee !== null || card.annualFee !== null)));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof CardFormFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setFields(prev => ({ ...prev, [key]: e.target.value }));

  const preset = CARD_PRESETS.find(p => p.name === fields.name) ?? null;

  const pickPreset = (p: WalletPreset) => {
    setFields(prev => ({ ...prev, name: p.name }));
    setIcon(presetIcon(p));
  };

  const save = async () => {
    const parsed = parseCardForm(fields);
    if (!parsed.ok) { setError(parsed.error); return; }
    setSaving(true);
    const ok = card
      ? await updateCreditCard(card.id, { ...parsed.values, icon })
      : await addCreditCard({ ...parsed.values, icon });
    setSaving(false);
    if (ok) onDone();
    else setError('Couldn’t save the card. Check your connection and try again.');
  };

  // text + inputMode rather than type="number": no stepper on any platform,
  // and mobile still gets the numeric keypad. The same choice the wallet form makes.
  const amountField = (key: keyof CardFormFields, placeholder: string) => (
    <input
      type="text" inputMode="decimal" value={fields[key]} onChange={set(key)}
      placeholder={placeholder} className={field}
    />
  );

  return (
    <>
      <p className={label}>Quick pick</p>
      <div className="mb-4">
        <WalletPresetPicker
          selected={preset}
          onPick={pickPreset}
          groups={CARD_PRESET_GROUPS}
          title="Which bank?"
        />
      </div>

      <p className={label}>Name</p>
      <input
        type="text" value={fields.name} onChange={set('name')}
        placeholder="e.g. BPI Gold" className={`${field} mb-4`}
      />

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Credit limit</p>
          {amountField('creditLimit', '50000')}
        </div>
        <div>
          <p className={label}>Owed right now</p>
          {amountField('openingBalance', '0.00')}
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Statement day</p>
          <input
            type="text" inputMode="numeric" value={fields.statementDay} onChange={set('statementDay')}
            placeholder="5" className={field}
          />
        </div>
        <div>
          <p className={label}>Due day</p>
          <input
            type="text" inputMode="numeric" value={fields.dueDay} onChange={set('dueDay')}
            placeholder="25" className={field}
          />
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        <div>
          <p className={label}>Interest % a month</p>
          {amountField('monthlyInterestRate', '3')}
        </div>
        <div>
          <p className={label}>Minimum %</p>
          {amountField('minPaymentPercent', '3')}
        </div>
      </div>

      <p className={label}>Minimum at least ({settings.currency})</p>
      <div className="mb-4">{amountField('minPaymentFloor', '500')}</div>

      <button
        onClick={() => setShowFees(v => !v)}
        aria-expanded={showFees}
        className="mb-4 flex w-full items-center justify-between rounded-xl border border-line bg-raised px-3 py-2.5 text-sm text-ink-2"
      >
        <span>Late and annual fees <span className="text-ink-4">(optional)</span></span>
        <ChevronDownIcon className={`h-4 w-4 text-ink-3 transition-transform ${showFees ? 'rotate-180' : ''}`} />
      </button>

      {showFees && (
        <>
          <p className={label}>Late payment fee</p>
          <div className="mb-4">{amountField('lateFee', '850')}</div>

          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <p className={label}>Annual fee</p>
              {amountField('annualFee', '3000')}
            </div>
            <div>
              <p className={label}>Charged in</p>
              <select value={fields.annualFeeMonth} onChange={set('annualFeeMonth')} className={field}>
                <option value="">Month…</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </div>
          </div>
        </>
      )}

      {error && <p className="mb-3 text-xs text-danger-text">{error}</p>}

      <p className="mb-4 text-[11px] text-ink-4">
        Interest is worked out from these terms, so it is an estimate — your
        bank's own method can differ by a few pesos.
      </p>

      <button
        onClick={save}
        disabled={saving}
        className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary active:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : card ? 'Save card' : 'Add card'}
      </button>
    </>
  );
}
```

- [ ] **Step 3: Put a Wallet / Credit card switch on the Add sheet**

In `src/app/wallets/page.tsx`, the import:

```tsx
import WalletPresetPicker, { presetIcon } from '@/components/WalletPresetPicker';
import CreditCardForm from '@/components/CreditCardForm';
import { logoOf, type IconKey } from '@/lib/icons';
```

the state:

```tsx
  const [showAdd, setShowAdd] = useState(false);
  const [addKind, setAddKind] = useState<'wallet' | 'card'>('wallet');
  const [newName, setNewName] = useState('');
```

a helper, and the reset it does, in place of `handleAdd`'s `setShowAdd(false)`:

```tsx
  // The sheet reopens on Wallet, whichever kind was added last.
  const closeAdd = () => { setShowAdd(false); setAddKind('wallet'); };

  const handleAdd = () => {
    if (!newName.trim()) return;
    addWallet({ name: newName.trim(), icon: newIcon, balance: parseFloat(newBalance) || 0 });
    closeAdd();
    setNewName('');
    setNewBalance('');
    setNewIcon('credit-card');
  };
```

the sheet's opening, with the switch:

```tsx
      {showAdd && (
        <BottomSheet onClose={closeAdd}>
          <p className="mb-4 text-center font-semibold text-ink text-lg">
            {addKind === 'card' ? 'New Credit Card' : 'New Wallet'}
          </p>

          {/* Two different things, one sheet: a card is not a wallet, but it is
              added from the same place. */}
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl bg-canvas p-1">
            {(['wallet', 'card'] as const).map(k => (
              <button
                key={k}
                onClick={() => setAddKind(k)}
                aria-pressed={addKind === k}
                className={`rounded-lg py-2 text-sm font-medium transition-colors ${
                  addKind === k ? 'bg-surface text-ink elev-knob' : 'text-ink-3 hover:text-ink-2'
                }`}
              >
                {k === 'wallet' ? 'Wallet' : 'Credit card'}
              </button>
            ))}
          </div>

          {addKind === 'card' ? <CreditCardForm onDone={closeAdd} /> : (
            <>
```

and its closing, where the wallet form's button already ends:

```tsx
            <button
              onClick={handleAdd}
              disabled={!newName.trim()}
              className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary active:bg-primary-hover disabled:opacity-40 transition-colors"
            >
              Add Wallet
            </button>
            </>
          )}
        </BottomSheet>
      )}
```

- [ ] **Step 4: Check it builds**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/components/CreditCardForm.tsx src/components/WalletPresetPicker.tsx src/app/wallets/page.tsx` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

- [ ] **Step 5: Try it, once the migration has run**

Start the app, open Wallets → Add Wallet → **Credit card**, pick a bank, fill the limit, days and rates, and add it. Nothing lists the card yet — that is Task 7 — so check it saved by reloading and opening the sheet again, or by querying `credit_cards` in Supabase.

- [ ] **Step 6: Commit**

```bash
git add src/components/CreditCardForm.tsx src/components/WalletPresetPicker.tsx src/app/wallets/page.tsx
git commit -m "feat: add and edit credit cards"
```

---

### Task 7: Cards on the Wallets page

**Files:**
- Create: `src/components/CreditCardTile.tsx`
- Create: `src/components/CreditCardSheet.tsx`
- Create: `src/components/PayCardSheet.tsx`
- Modify: `src/app/wallets/page.tsx`

**Interfaces:**
- Consumes: `CardSummary`, `CardStatus`, `ymdToDate` (Tasks 2–3); `CreditCard`, `archiveCreditCard`, `payCreditCard` (Task 4); `cardSummaries`, `owedOnCards` (Task 5); `CreditCardForm` (Task 6).
- Produces:
  - `shortDay(ymd: string): string` and `cardStatusText(status: CardStatus, currency: string): string`, both exported from `CreditCardTile.tsx`
  - `CreditCardTile({ card, summary, currency, onOpen })`
  - `CreditCardSheet({ card, summary, currency, onClose, onPay, onEdit })`
  - `PayCardSheet({ card, summary, currency, onClose })`

- [ ] **Step 1: Write the tile**

Create `src/components/CreditCardTile.tsx`:

```tsx
'use client';

import { fmt, type CreditCard } from './AppContext';
import { ymdToDate, type CardStatus, type CardSummary } from '@/lib/creditCard';
import ProgressBar, { type Tone } from './ProgressBar';
import { IconTile } from './AppIcon';

/** A due date as "Sep 25". */
export const shortDay = (ymd: string): string =>
  ymdToDate(ymd).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });

/** The one line a card shows about its last statement. */
export function cardStatusText(status: CardStatus, currency: string): string {
  if (status.kind === 'none') return 'No statement due';
  if (status.kind === 'paid') return 'Paid';
  const when = status.overdue ? `was due ${shortDay(status.dueOn)}` : `due ${shortDay(status.dueOn)}`;
  return `${fmt(status.unpaid, currency)} ${when} · min ${fmt(status.minimumLeft, currency)}`;
}

// Amber once it is due, red once that date has passed; green only for a card
// that owes nothing, which is money doing well.
const statusClass = (status: CardStatus): string => {
  if (status.kind === 'paid') return 'text-growth-text';
  if (status.kind === 'due') return status.overdue ? 'text-danger-text' : 'text-warning-text';
  return 'text-ink-4';
};

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onOpen: () => void;
}

// A card on the Wallets page: what is owed, how much of the limit is gone, and
// when it is due. The bar turns amber near the limit and red over it.
export default function CreditCardTile({ card, summary, currency, onOpen }: Props) {
  // A card in credit owes nothing; it never shows a negative debt.
  const owed = Math.max(0, summary.owedNow);
  const used = card.creditLimit > 0 ? owed / card.creditLimit : 0;
  const tone: Tone = used > 1 ? 'danger' : used >= 0.8 ? 'warning' : 'primary';

  return (
    <button
      onClick={onOpen}
      className="w-full rounded-2xl border border-line bg-surface p-4 text-left transition-colors hover:border-line-strong"
    >
      <div className="flex items-center gap-3">
        <IconTile icon={card.icon} fallback="credit-card" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-ink">{card.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            <span className="tabular-nums">{fmt(summary.availableCredit, currency)}</span> available
            {' of '}
            <span className="tabular-nums">{fmt(card.creditLimit, currency)}</span>
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[17px] font-bold leading-tight tabular-nums text-ink">{fmt(owed, currency)}</p>
          <p className="text-[11px] leading-tight text-ink-4">owed</p>
        </div>
      </div>

      <ProgressBar value={owed} max={card.creditLimit} tone={tone} className="mt-3" />
      <p className={`mt-2 text-xs ${statusClass(summary.status)}`}>
        {cardStatusText(summary.status, currency)}
      </p>
    </button>
  );
}
```

- [ ] **Step 2: Write the details sheet**

Create `src/components/CreditCardSheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt, type CreditCard } from './AppContext';
import BottomSheet from './BottomSheet';
import { IconTile } from './AppIcon';
import { PencilIcon, TrashIcon } from './Icons';
import { categoryMeta } from '@/lib/categories';
import type { CardSummary } from '@/lib/creditCard';
import { shortDay } from './CreditCardTile';

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
}

const row = 'flex items-baseline justify-between gap-3 text-sm';

// What the card is doing: owed now, the last statement in full, and the rows
// behind both. Interest is calculated rather than read off a statement, so it
// says so wherever it appears.
export default function CreditCardSheet({ card, summary, currency, onClose, onPay, onEdit }: Props) {
  const { expenses, debtEntries, moneyMoves, settings, archiveCreditCard } = useApp();
  const [confirming, setConfirming] = useState(false);
  const { last } = summary;
  const { charges } = last;

  // A purchase charged the card the whole amount paid at the till: your share
  // plus whatever others owe you back on it.
  const chargedFor = (expenseId: string, amount: number) => amount + debtEntries
    .filter(d => d.expenseId === expenseId && d.direction === 'owed_to_me')
    .reduce((s, d) => s + d.amount, 0);

  const recent = [
    ...expenses.filter(e => e.cardId === card.id).map(e => ({
      id: e.id, date: e.date, payment: false,
      label: categoryMeta(e.category, settings.customCategories).label,
      note: e.note, amount: chargedFor(e.id, e.amount),
    })),
    ...moneyMoves.filter(m => m.kind === 'card_payment' && m.cardId === card.id).map(m => ({
      id: m.id, date: m.date, payment: true,
      label: 'Payment', note: m.note, amount: m.amount,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  const archive = async () => { await archiveCreditCard(card.id); onClose(); };

  return (
    <BottomSheet onClose={onClose}>
      <div className="mb-5 flex items-center gap-3">
        <IconTile icon={card.icon} fallback="credit-card" size="lg" />
        <div className="min-w-0">
          <p className="truncate text-lg font-bold leading-tight text-ink">{card.name}</p>
          <p className="mt-0.5 text-xs text-ink-3">
            Closes day {card.statementDay} · due day {card.dueDay}
          </p>
        </div>
      </div>

      <div className="mb-4 space-y-2 rounded-xl border border-line bg-raised px-4 py-3">
        <div className={row}>
          <span className="text-ink-2">Owed now</span>
          <span className="font-semibold tabular-nums text-ink">
            {fmt(Math.max(0, summary.owedNow), currency)}
          </span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Available credit</span>
          <span className="tabular-nums text-ink">{fmt(summary.availableCredit, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Not yet on a statement</span>
          <span className="tabular-nums text-ink">{fmt(summary.unbilled, currency)}</span>
        </div>
      </div>

      <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
        Statement of {shortDay(last.closesOn)}
      </p>
      <div className="mb-4 space-y-2 rounded-xl border border-line bg-raised px-4 py-3">
        <div className={row}>
          <span className="text-ink-2">Balance</span>
          <span className="font-semibold tabular-nums text-ink">{fmt(last.balance, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Due {shortDay(last.dueOn)}</span>
          <span className="tabular-nums text-ink">min {fmt(last.minimumDue, currency)}</span>
        </div>
        <div className={row}>
          <span className="text-ink-2">Paid since it closed</span>
          <span className="tabular-nums text-ink">{fmt(summary.paidSinceClose, currency)}</span>
        </div>
        {charges.interest > 0 && (
          <div className={row}>
            <span className="text-ink-2">Interest <span className="text-ink-4">(estimate)</span></span>
            <span className="tabular-nums text-ink">{fmt(charges.interest, currency)}</span>
          </div>
        )}
        {charges.lateFee > 0 && (
          <div className={row}>
            <span className="text-ink-2">Late fee</span>
            <span className="tabular-nums text-ink">{fmt(charges.lateFee, currency)}</span>
          </div>
        )}
        {charges.annualFee > 0 && (
          <div className={row}>
            <span className="text-ink-2">Annual fee</span>
            <span className="tabular-nums text-ink">{fmt(charges.annualFee, currency)}</span>
          </div>
        )}
      </div>

      {recent.length > 0 && (
        <>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-widest text-ink-3">Recent</p>
          <div className="mb-4 space-y-1.5">
            {recent.map(r => (
              <div key={r.id} className="flex items-center gap-3 text-sm">
                <span className="min-w-0 flex-1 truncate text-ink">
                  {r.label}
                  {r.note ? <span className="text-ink-3"> · {r.note}</span> : null}
                </span>
                {/* A payment brings the balance down, a purchase pushes it up. */}
                <span className={`shrink-0 tabular-nums ${r.payment ? 'text-growth-text' : 'text-ink-2'}`}>
                  {r.payment ? '−' : '+'}{fmt(r.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      <button
        onClick={onPay}
        className="w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover transition-colors"
      >
        Pay this card
      </button>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-line pt-3">
        <button
          onClick={onEdit}
          className="flex items-center gap-1.5 text-xs text-ink-3 hover:text-ink-2 transition-colors"
        >
          <PencilIcon className="h-3.5 w-3.5" /> Edit card
        </button>
        {confirming ? (
          <button
            onClick={archive}
            onBlur={() => setConfirming(false)}
            className="rounded-lg bg-danger-strong px-2.5 py-1.5 text-xs font-semibold text-white"
          >
            {summary.owedNow > 0 ? `Delete — ${fmt(summary.owedNow, currency)} still owed` : 'Sure?'}
          </button>
        ) : (
          <button
            onClick={() => setConfirming(true)}
            className="flex items-center gap-1.5 text-xs text-ink-4 hover:text-danger-text transition-colors"
          >
            <TrashIcon className="h-3.5 w-3.5" /> Delete card
          </button>
        )}
      </div>
      <p className="mt-2 text-[11px] text-ink-4">
        Deleting keeps this card's purchases and payments as history. The card
        itself leaves your lists.
      </p>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Write the pay sheet**

Create `src/components/PayCardSheet.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt, type CreditCard } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';
import type { CardSummary } from '@/lib/creditCard';

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onClose: () => void;
}

// Paying the bill moves your own money to the bank, so nothing here counts as
// spending — the purchases counted when they were made.
export default function PayCardSheet({ card, summary, currency, onClose }: Props) {
  const { payCreditCard } = useApp();
  const due = summary.status.kind === 'due' ? summary.status : null;

  // Only amounts there are to pay, and never the same amount twice — the
  // statement balance and everything owed are often the same figure.
  const shortcuts = [
    { label: 'Statement balance', amount: due ? due.unpaid : 0 },
    { label: 'Minimum', amount: due ? due.minimumLeft : 0 },
    { label: 'Everything owed', amount: Math.max(0, summary.owedNow) },
  ].filter((s, i, all) => s.amount > 0 && all.findIndex(o => o.amount === s.amount) === i);

  const [amount, setAmount] = useState(() => (shortcuts[0] ? String(shortcuts[0].amount) : ''));
  const [walletId, setWalletId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const value = parseFloat(amount);
  const canPay = value > 0 && walletId !== '' && !saving;

  const pay = async () => {
    if (!canPay) return;
    setSaving(true);
    const ok = await payCreditCard(card.id, value, walletId);
    setSaving(false);
    if (ok) onClose();
    else setError('Couldn’t record the payment. Check your connection and try again.');
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="mb-5 text-center font-semibold text-ink text-lg">Pay {card.name}</p>

      {shortcuts.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2">
          {shortcuts.map(s => (
            <button
              key={s.label}
              onClick={() => setAmount(String(s.amount))}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                value === s.amount
                  ? 'border-primary bg-primary-tint text-ink'
                  : 'border-line bg-raised text-ink-2 hover:text-ink'
              }`}
            >
              {s.label} · {fmt(s.amount, currency)}
            </button>
          ))}
        </div>
      )}

      <p className="mb-2 text-xs text-ink-3">Amount</p>
      <input
        type="text" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)}
        placeholder="0.00" autoFocus
        className="mb-4 w-full rounded-xl bg-canvas border border-line px-4 py-3 text-center text-2xl font-bold text-ink placeholder-ink-4 outline-none focus:border-primary"
      />

      <p className="mb-2 text-xs text-ink-3">Pay from</p>
      <WalletPicker value={walletId} onChange={setWalletId} />
      <p className="mt-2 text-[11px] text-ink-4">
        {value > 0
          ? `${fmt(value, currency)} leaves this wallet now.`
          : 'Choose the wallet the money comes from.'}
      </p>

      {error && <p className="mt-3 text-xs text-danger-text">{error}</p>}

      <button
        onClick={pay}
        disabled={!canPay}
        className="mt-5 w-full rounded-xl bg-primary py-3.5 font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-40 transition-colors"
      >
        {saving ? 'Saving…' : 'Record payment'}
      </button>
    </BottomSheet>
  );
}
```

- [ ] **Step 4: List the cards on the Wallets page**

The imports:

```tsx
import CreditCardForm from '@/components/CreditCardForm';
import CreditCardTile from '@/components/CreditCardTile';
import CreditCardSheet from '@/components/CreditCardSheet';
import PayCardSheet from '@/components/PayCardSheet';
```

what the page reads from the context:

```tsx
  const { wallets, addWallet, deleteWallet, settings, creditCards, cardSummaries, owedOnCards } = useApp();
```

the state, after `confirmDelete`:

```tsx
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  // Which card's details, pay sheet or edit form is open.
  const [openCardId, setOpenCardId] = useState<string | null>(null);
  const [payCardId, setPayCardId] = useState<string | null>(null);
  const [editCardId, setEditCardId] = useState<string | null>(null);
```

and the cards it works from, after `totalBalance`:

```tsx
  const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);

  // Archived cards are history only: they are gone from every list here.
  const activeCards = creditCards.filter(c => !c.archivedAt);
  const cardById = (id: string | null) => activeCards.find(c => c.id === id) ?? null;
  const openCard = cardById(openCardId);
  const payCard = cardById(payCardId);
  const editCard = cardById(editCardId);
  const owingCount = activeCards.filter(c => (cardSummaries[c.id]?.owedNow ?? 0) > 0).length;
```

the header, where the total balance is money in wallets and cards are named beside it:

```tsx
            <div>
              <p className="text-xs text-ink-3 uppercase tracking-widest">All Wallets</p>
              <p className="text-2xl font-bold text-ink mt-0.5">{fmt(totalBalance, settings.currency)}</p>
              {owedOnCards > 0 && (
                <p className="mt-1 text-xs text-ink-3">
                  <span className="tabular-nums">{fmt(owedOnCards, settings.currency)}</span>
                  {' '}owed on {owingCount} card{owingCount !== 1 ? 's' : ''}
                </p>
              )}
            </div>
```

and the section itself, after the wallets grid and its empty state:

```tsx
          )}

          {activeCards.length > 0 && (
            <section className="mt-8">
              <p className="mb-3 px-0.5 text-[11px] font-semibold uppercase tracking-widest text-ink-3">
                Credit cards
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4">
                {activeCards.map(card => cardSummaries[card.id] && (
                  <CreditCardTile
                    key={card.id}
                    card={card}
                    summary={cardSummaries[card.id]}
                    currency={settings.currency}
                    onOpen={() => setOpenCardId(card.id)}
                  />
                ))}
              </div>
            </section>
          )}

        </div>
      </div>

      <BottomNav />
```

- [ ] **Step 5: Open the sheets**

Immediately before the `{/* Confirm Delete */}` block:

```tsx
      {/* Details, pay and edit are one at a time: opening one closes the last,
          so no sheet ever sits on top of another here. */}
      {openCard && cardSummaries[openCard.id] && (
        <CreditCardSheet
          card={openCard}
          summary={cardSummaries[openCard.id]}
          currency={settings.currency}
          onClose={() => setOpenCardId(null)}
          onPay={() => { setPayCardId(openCard.id); setOpenCardId(null); }}
          onEdit={() => { setEditCardId(openCard.id); setOpenCardId(null); }}
        />
      )}

      {payCard && cardSummaries[payCard.id] && (
        <PayCardSheet
          card={payCard}
          summary={cardSummaries[payCard.id]}
          currency={settings.currency}
          onClose={() => setPayCardId(null)}
        />
      )}

      {editCard && (
        <BottomSheet onClose={() => setEditCardId(null)}>
          <p className="mb-5 text-center font-semibold text-ink text-lg">Edit card</p>
          <CreditCardForm card={editCard} onDone={() => setEditCardId(null)} />
        </BottomSheet>
      )}

      {/* Confirm Delete */}
```

- [ ] **Step 6: Check it builds**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/components/CreditCardTile.tsx src/components/CreditCardSheet.tsx src/components/PayCardSheet.tsx src/app/wallets/page.tsx` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

- [ ] **Step 7: Try it, once the migration has run**

On Wallets: the card added in Task 6 shows with what it owes (the opening balance), its available credit, and "No statement due" or a due line. Open it, pay part of it from a wallet, and check that wallet's balance drops by that amount and "Paid since it closed" rises. Edit the card's name, then delete it and confirm it leaves the list while the wallet's payment stays in Activity.

- [ ] **Step 8: Commit**

```bash
git add src/components/CreditCardTile.tsx src/components/CreditCardSheet.tsx src/components/PayCardSheet.tsx src/app/wallets/page.tsx
git commit -m "feat: credit cards on the wallets page" -m "Patch-note: See what each credit card owes, what is due, and pay it from a wallet."
```

---

### Task 8: Paying with a card

**Files:**
- Create: `src/components/FundingPicker.tsx`
- Modify: `src/app/expenses/new/page.tsx`
- Modify: `src/components/EditEntrySheet.tsx`

**Interfaces:**
- Consumes: `creditCards`, `cardSummaries` (Tasks 4–5); `addExpense`/`updateExpense` with `cardId` (Task 5).
- Produces: `FundingPicker({ walletId, cardId, onChange }: { walletId: string; cardId: string; onChange: (next: { walletId: string; cardId: string }) => void })`.

- [ ] **Step 1: Write the wallets-then-cards picker**

Create `src/components/FundingPicker.tsx`:

```tsx
'use client';

import { useApp } from './AppContext';
import AppIcon from './AppIcon';

interface Props {
  /** '' when a card paid, or nothing has been chosen yet. */
  walletId: string;
  /** '' when a wallet paid, or nothing has been chosen yet. */
  cardId: string;
  onChange: (next: { walletId: string; cardId: string }) => void;
}

// Where an expense was paid from: a wallet or a credit card, never both, so
// choosing one clears the other. Wallets first, as on the expense form.
export default function FundingPicker({ walletId, cardId, onChange }: Props) {
  const { wallets, creditCards } = useApp();

  // An archived card takes no new purchases, but one it already paid for has
  // to stay pickable, or editing that expense would silently move it.
  const cards = creditCards.filter(c => !c.archivedAt || c.id === cardId);

  const chip = (selected: boolean) =>
    `flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
      selected
        ? 'border-primary bg-primary-tint text-ink'
        : 'border-line bg-raised text-ink-2 hover:text-ink'
    }`;

  return (
    <div className="flex flex-wrap gap-2">
      {wallets.map(w => (
        <button
          key={w.id}
          onClick={() => onChange({ walletId: w.id, cardId: '' })}
          className={chip(walletId === w.id)}
        >
          <AppIcon icon={w.icon} fallback="wallet" className="h-4 w-4 shrink-0 text-primary-text" />
          <span className="truncate">{w.name}</span>
        </button>
      ))}
      {cards.map(c => (
        <button
          key={c.id}
          onClick={() => onChange({ walletId: '', cardId: c.id })}
          className={chip(cardId === c.id)}
        >
          <AppIcon icon={c.icon} fallback="credit-card" className="h-4 w-4 shrink-0 text-primary-text" />
          <span className="truncate">{c.name}</span>
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Offer cards on the expense form**

In `src/app/expenses/new/page.tsx`, what it reads from the context:

```tsx
  const { wallets, addExpense, settings, creditCards, cardSummaries } = useApp();
```

the state and the figures the form works from:

```tsx
  const [walletId, setWalletId] = useState(presetWalletId || defaultWalletId);
  // Paid from a wallet or a card, so choosing one clears the other.
  const [cardId,   setCardId]   = useState('');
  const [note,     setNote]     = useState('');
  const [split,     setSplit]     = useState<SplitResult | null>(null);

  // Archived cards take no new purchases.
  const activeCards = creditCards.filter(c => !c.archivedAt);
  const selectedCard = activeCards.find(c => c.id === cardId) ?? null;
  const typedAmount = parseFloat(input) || 0;
  // Banks do approve charges over the limit, so this warns rather than blocks.
  const overLimit = Boolean(selectedCard)
    && typedAmount > (cardSummaries[cardId]?.availableCredit ?? 0);
```

what the button needs before it will save — a card counts as funding, like a wallet:

```tsx
  const myShare = round2(typedAmount - owedTotal);
  const needsFunding = !split || split.mode === 'wallet';

  const canSubmit = typedAmount > 0 && category !== null
    && (!needsFunding || walletId !== '' || cardId !== '')
```

what it saves:

```tsx
    addExpense({
      amount: typedAmount,
      category,
      note: note.trim(),
      walletId: split?.mode === 'person' ? null : (walletId || null),
      cardId: split?.mode === 'person' ? null : (cardId || null),
      paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
```

the strip's empty state, which now also depends on there being no cards:

```tsx
          {wallets.length === 0 && activeCards.length === 0 ? (
            <p className="text-xs text-ink-3 text-center py-2">
              No wallets yet — add one in Wallets.
            </p>
          ) : (
```

each wallet chip, which clears any chosen card:

```tsx
                {wallets.map(w => {
                  const selected = walletId === w.id && split?.mode !== 'person';
                  return (
                    <button
                      key={w.id}
                      onClick={() => { setWalletId(w.id); setCardId(''); }}
```

and the cards, after the wallet chips close, with the over-limit note under the strip:

```tsx
                    </button>
                  );
                })}

                {/* Cards come after wallets in the same strip, showing what is
                    left to spend rather than a balance. */}
                {activeCards.map(c => {
                  const selected = cardId === c.id && split?.mode !== 'person';
                  return (
                    <button
                      key={c.id}
                      onClick={() => { setCardId(c.id); setWalletId(''); }}
                      className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                        selected
                          ? 'border-primary bg-primary-tint'
                          : 'border-line bg-raised'
                      }`}
                    >
                      <AppIcon icon={c.icon} fallback="credit-card" className="h-4 w-4 text-primary-text" />
                      <div className="text-left">
                        <p className={`text-xs font-medium leading-tight ${selected ? 'text-primary-hover' : 'text-ink'}`}>
                          {c.name}
                        </p>
                        <p className="text-[10px] text-ink-2 leading-tight">
                          {fmt(cardSummaries[c.id]?.availableCredit ?? 0, settings.currency)} left
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>

              {overLimit && (
                <p className="mt-2 text-[11px] text-warning-text">
                  That is more than {selectedCard?.name} has left. Banks often allow it
                  — the card would simply go over its limit.
                </p>
              )}
            </div>
          )}
        </div>
```

and the button's label, which names whichever paid:

```tsx
                  ? `Log · ${fmt(myShare, settings.currency)} of ${fmt(typedAmount, settings.currency)}`
                  : `Log · ${selectedWallet?.name ?? selectedCard?.name ?? ''}`}
```

- [ ] **Step 3: Offer cards when editing an expense**

In `src/components/EditEntrySheet.tsx`, the import:

```tsx
import WalletPicker from './WalletPicker';
import FundingPicker from './FundingPicker';
```

what it reads from the context:

```tsx
  const {
    expenses, moneyMoves, debtEntries, settings, creditCards,
    updateExpense, updateMoneyMove, updateDebtEntry,
  } = useApp();
```

the original total, which counts the split for a card purchase as it does for a wallet one:

```tsx
  const originalTotal = expense
    ? (expense.walletId || expense.cardId
        ? round2(expense.amount + owedRows.reduce((s, d) => s + d.amount, 0))
        : expense.amount)
    : (move?.amount ?? entry?.amount ?? 0);
```

the state:

```tsx
  const [walletId, setWalletId] = useState(expense?.walletId ?? move?.walletId ?? entry?.walletId ?? '');
  const [cardId,   setCardId]   = useState(expense?.cardId ?? '');
```

what it will accept, including the date rule:

```tsx
  const isTransfer = Boolean(move && move.toWalletId);
  const needsWallet = source.kind !== 'expense' || !split || split.mode === 'wallet';

  // What a card owed when it was added already covers anything before that day,
  // so a purchase dated earlier would be counted twice. updateExpense refuses
  // it; the button refuses first, with the reason on screen.
  const card = cardId ? creditCards.find(c => c.id === cardId) : undefined;
  const beforeCard = Boolean(card && date < toYmd(card.createdAt));

  const canSave =
    typed > 0
    && (!needsWallet || walletId !== '' || cardId !== '')
    && !beforeCard
```

what it saves:

```tsx
        walletId: split?.mode === 'person' ? null : (walletId || null),
        cardId: split?.mode === 'person' ? null : (cardId || null),
        paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
```

the picker itself, where the wallet one is today:

```tsx
      {/* ── Where it was paid from ── */}
      {needsWallet && (
        <div className="mb-4">
          <p className={label}>
            {source.kind === 'expense' ? 'Paid from' : isTransfer ? 'From wallet' : 'Wallet'}
          </p>
          {source.kind === 'expense' ? (
            <FundingPicker
              walletId={walletId}
              cardId={cardId}
              onChange={next => { setWalletId(next.walletId); setCardId(next.cardId); }}
            />
          ) : (
            <WalletPicker value={walletId} onChange={setWalletId} />
          )}
        </div>
      )}
```

and the reason, above the error line:

```tsx
      {beforeCard && card && (
        <p className="mb-3 text-xs text-warning-text">
          {card.name} was added on {toYmd(card.createdAt)}. What it owed then already
          covers anything bought before that day.
        </p>
      )}

      {error && <p className="mb-3 text-xs text-danger-text">{error}</p>}
```

- [ ] **Step 4: Check it builds**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/components/FundingPicker.tsx src/app/expenses/new/page.tsx src/components/EditEntrySheet.tsx` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

- [ ] **Step 5: Try it, once the migration has run**

Log an expense on the card: no wallet balance changes, the dashboard's spending for this cycle rises by it, and the card's owed amount on Wallets rises too. Split one with someone: the card is charged the whole amount while the expense keeps your share. Edit that expense onto a wallet and back, and check the wallet is debited then refunded. Set its date before the day the card was added and confirm Save is refused with the reason.

- [ ] **Step 6: Commit**

```bash
git add src/components/FundingPicker.tsx src/app/expenses/new/page.tsx src/components/EditEntrySheet.tsx
git commit -m "feat: pay for an expense with a credit card" -m "Patch-note: Pay for an expense with a credit card, and see what is left to spend on it."
```

---

### Task 9: Cards on the dashboard

**Files:**
- Create: `src/components/CardDueStrip.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `cardSummaries`, `owedOnCards` (Task 5); `shortDay` (Task 7); `PayCardSheet` (Task 7).
- Produces: `CardDueStrip({ card, summary, currency, onPay })`.

- [ ] **Step 1: Write the reminder strip**

Create `src/components/CardDueStrip.tsx`:

```tsx
'use client';

import { fmt, type CreditCard } from './AppContext';
import { ymdToDate, type CardSummary } from '@/lib/creditCard';
import { shortDay } from './CreditCardTile';
import { ChevronRightIcon } from './Icons';

const DAY_MS = 86_400_000;

// Whole days from today, so a due date is described the same whatever the time
// of day: "due today", "due tomorrow", "due in 4 days".
function dueWhen(dueOn: string): string {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = Math.round((ymdToDate(dueOn).getTime() - today.getTime()) / DAY_MS);
  if (days <= 0) return 'due today';
  if (days === 1) return 'due tomorrow';
  return `due in ${days} days`;
}

interface Props {
  card: CreditCard;
  summary: CardSummary;
  currency: string;
  onPay: () => void;
}

// One card's bill on the dashboard, while it is worth chasing: amber until the
// due date has passed, red after it. The same shape as the unconfirmed payday
// prompt, which is the pattern for "this needs you".
export default function CardDueStrip({ card, summary, currency, onPay }: Props) {
  const status = summary.status;
  if (status.kind !== 'due') return null;

  const tone = status.overdue
    ? 'border-danger-edge bg-danger-tint text-danger-text hover:border-danger/60'
    : 'border-warning-edge bg-warning-tint text-warning-text hover:border-warning/60';

  return (
    <button
      onClick={onPay}
      className={`flex w-full items-start gap-[9px] rounded-[11px] border px-3 py-2.5 text-left transition-colors md:col-span-2 ${tone}`}
    >
      <span className={`mt-[5px] h-[7px] w-[7px] shrink-0 rounded-full ${status.overdue ? 'bg-danger' : 'bg-warning'}`} />
      <span className="min-w-0 flex-1 text-[12.5px] font-medium leading-snug">
        {card.name} · <span className="tabular-nums">{fmt(status.unpaid, currency)}</span>
        {' '}
        {status.overdue ? `overdue — was due ${shortDay(status.dueOn)}` : dueWhen(status.dueOn)}
        {' · min '}
        <span className="tabular-nums">{fmt(status.minimumLeft, currency)}</span>
      </span>
      <ChevronRightIcon className="mt-px h-4 w-4 shrink-0 opacity-70" />
    </button>
  );
}
```

- [ ] **Step 2: Put the cards on the dashboard**

In `src/app/page.tsx`, the imports:

```tsx
import BottomNav from '@/components/BottomNav';
import CardDueStrip from '@/components/CardDueStrip';
import PayCardSheet from '@/components/PayCardSheet';
```

what the page reads from the context:

```tsx
  const {
    wallets, settings, totalBalance, projectedSavings,
    creditCards, cardSummaries, owedOnCards,
    optimisticSavings, unconfirmedIncome, pendingPaydays,
```

the state and the cards worth interrupting for:

```tsx
  const [paydayOpen, setPaydayOpen] = useState(false);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [payCardId, setPayCardId] = useState<string | null>(null);
  const nextPending = pendingPaydays[0];

  // A statement due within a week, or already past its date.
  const dueCards = creditCards.filter(c => !c.archivedAt && cardSummaries[c.id]?.remind);
  const payCard = creditCards.find(c => c.id === payCardId) ?? null;
```

the line under the balance, so the total stays money in wallets and cards are named beside it:

```tsx
                <p className="mt-[9px] flex items-center gap-[7px] text-[13px] leading-none text-teal-100">
                  <span className="h-1.5 w-1.5 rounded-full bg-teal-100" />
                  across {wallets.length} wallet{wallets.length !== 1 ? 's' : ''}
                </p>
                {owedOnCards > 0 && (
                  <p className="mt-[7px] flex items-center gap-[7px] text-[13px] leading-none text-teal-100/80">
                    <span className="h-1.5 w-1.5 rounded-full bg-teal-100/60" />
                    <span className="tabular-nums">{fmt(owedOnCards, currency)}</span> owed on cards
                  </p>
                )}
```

the strips, right after the balance card and before the Projected Savings one:

```tsx
            {/* A card due soon, or already late, gets a strip across the grid. */}
            {dueCards.map(card => (
              <CardDueStrip
                key={card.id}
                card={card}
                summary={cardSummaries[card.id]}
                currency={currency}
                onPay={() => setPayCardId(card.id)}
              />
            ))}

            {/* Projected Savings — the conservative end, on purpose. Every way
```

and the sheet it opens, before the payday one:

```tsx
      {payCard && cardSummaries[payCard.id] && (
        <PayCardSheet
          card={payCard}
          summary={cardSummaries[payCard.id]}
          currency={currency}
          onClose={() => setPayCardId(null)}
        />
      )}

      {paydayOpen && nextPending && (
```

- [ ] **Step 3: Check it builds**

Run: `npx tsc --noEmit` — expected: exit 0.
Run: `npx eslint src/components/CardDueStrip.tsx src/app/page.tsx` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

- [ ] **Step 4: Try it, once the migration has run**

With a card that owes something and a due date within the week, the dashboard shows its strip; tapping it opens the pay sheet, and paying in full makes the strip disappear. The balance card names what is owed on cards without changing the total balance.

- [ ] **Step 5: Commit**

```bash
git add src/components/CardDueStrip.tsx src/app/page.tsx
git commit -m "feat: card balance and due reminders on the dashboard" -m "Patch-note: The dashboard shows what you owe on cards and reminds you before a bill is due."
```

---

### Task 10: Cards in Activity

**Files:**
- Modify: `src/components/ActivityRow.tsx`
- Modify: `src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `cardSummaries`, `creditCards` (Tasks 4–5).
- Produces: `RowSource` gains `{ kind: 'cardPayment'; id: string }` and `{ kind: 'charge' }`.

- [ ] **Step 1: Teach the row about card payments and charges**

In `src/components/ActivityRow.tsx`, the source type:

```tsx
  | { kind: 'settle'; settleMoveId: string }
  // A movement into or out of the emergency fund, owned by its fund entry.
  | { kind: 'fund'; entryId: string }
  // Paying a credit card bill: deleted like any movement, but never edited on
  // its own, so it cannot drift from the card it paid.
  | { kind: 'cardPayment'; id: string }
  // A card's interest or fees. Calculated from its statements, so there is
  // nothing to edit and nothing to delete.
  | { kind: 'charge' };
```

what a row allows:

```tsx
  // A fund movement is changed through its fund entry and a card payment
  // through its card; a calculated charge is not changed at all.
  const kind = item.source.kind;
  const editable = kind !== 'settle' && kind !== 'fund' && kind !== 'cardPayment' && kind !== 'charge';
  // With nothing to do to it, a charge gets no action rail and no swipe.
  const actionable = kind !== 'charge';
  const destructive = kind === 'settle' ? 'Reverse' : 'Delete';
```

the action rail, wrapped so a charge has none — the opening:

```tsx
      {/* ── Action rail ──
          Below md it sits behind the row and the swipe uncovers it. At md and
          up there is no swipe, so it floats above the row's right edge and
          appears on hover or keyboard focus instead. */}
      {actionable && (
      <div
        className="absolute inset-y-0 right-0 z-0 flex md:z-20 md:opacity-0 md:transition-opacity
                   md:group-hover:opacity-100 md:group-focus-within:opacity-100"
        style={{ width: swipe.railWidth }}
      >
```

and its closing, the `</div>` just before the `{/* ── The row itself ── */}` comment:

```tsx
      </div>
      )}
```

then the row itself, which only swipes when there is something behind it:

```tsx
      <div
        className="relative z-10 flex items-center gap-3 bg-surface border border-line rounded-xl px-4 py-3"
        style={actionable ? swipe.style : undefined}
        {...(actionable ? swipe.handlers : {})}
      >
```

- [ ] **Step 2: Put card rows in the feed**

In `src/app/transactions/page.tsx`, the import:

```tsx
import { useApp, fmt, round2, INCOME_SOURCES } from '@/components/AppContext';
```

what the page reads from the context:

```tsx
    expenses, moneyMoves, wallets, settings, debtEntries, debtPeople, emergencyFund,
    creditCards, cardSummaries,
    deleteExpense, deleteMoneyMove, deleteDebtEntry, reverseSettleBatch, deleteEmergencyFundEntry,
  } = useApp();
```

what pays for an expense, which now includes a card:

```tsx
  // A wallet-less expense was paid by a card, or by someone else; name whichever
  // it was where the wallet name would otherwise go, so the subtitle is never blank.
  const fundedBy = (e: { id: string; walletId: string | null; cardId: string | null }) => {
    if (e.walletId) return walletName(e.walletId);
    if (e.cardId) return creditCards.find(c => c.id === e.cardId)?.name ?? 'card';
    const link = debtEntries.find(d => d.expenseId === e.id);
```

the card payment row, before the fund one:

```tsx
        if (mm.kind === 'card_payment') {
          // flow 'moved': the purchases counted as spending when they were made,
          // so paying the bill is your own money changing place, not spending again.
          return {
            id: mm.id, date: mm.date, flow: 'moved',
            icon: 'credit-card', label: 'Card payment',
            sub: subtitle(mm.note, walletName(mm.walletId)),
            amount: mm.amount,
            updatedAt: mm.updatedAt,
            source: { kind: 'cardPayment', id: mm.id },
          };
        }
        if (mm.kind === 'fund_deposit' || mm.kind === 'fund_withdrawal') {
```

and the charges, after the money movements close the `items` array — they are calculated rather than stored, so they are built here so that the month's spending in this page matches the dashboard's:

```tsx
      }),
      // Interest and fees are calculated from each card's statements, and dated
      // midday on the statement that charged them — the same instant the rest of
      // the app gives a hand-entered row, so they land on the right day locally.
      ...creditCards.flatMap(card => (cardSummaries[card.id]?.statements ?? [])
        .flatMap((s): FeedItem[] => {
          const total = round2(s.charges.interest + s.charges.lateFee + s.charges.annualFee);
          const date = new Date(`${s.closesOn}T12:00:00`).toISOString();
          if (total <= 0 || !inMonth(date)) return [];
          const parts = [
            s.charges.interest  > 0 ? `Interest ${fmt(s.charges.interest, currency)} (estimate)` : '',
            s.charges.lateFee   > 0 ? `Late fee ${fmt(s.charges.lateFee, currency)}` : '',
            s.charges.annualFee > 0 ? `Annual fee ${fmt(s.charges.annualFee, currency)}` : '',
          ].filter(Boolean);
          return [{
            id: `charge-${card.id}-${s.closesOn}`,
            date, flow: 'spent',
            icon: 'credit-card', label: `${card.name} charges`,
            sub: parts.join(' · '),
            amount: total,
            updatedAt: null,
            source: { kind: 'charge' },
          }];
        })),
    ];
```

with the cards added to that memo's dependencies:

```tsx
  }, [expenses, moneyMoves, wallets, settings.customCategories, debtEntries, debtPeople, emergencyFund.entries, creditCards, cardSummaries, viewCycle, cycleStartDay]);
```

and deleting, where a card payment goes through the movement and a charge has nothing to delete:

```tsx
    if (src.kind === 'move') return deleteMoneyMove(src.id);
    if (src.kind === 'cardPayment') return deleteMoneyMove(src.id);
    // A charge is calculated from the card's statements: there is no row to delete.
    if (src.kind === 'charge') return;
    if (src.kind === 'debt') return deleteDebtEntry(src.entryId);
```

- [ ] **Step 3: Check it builds**

Run: `npx tsc --noEmit` — expected: exit 0. TypeScript checks that every `RowSource` kind is handled in `remove`.
Run: `npx eslint src/components/ActivityRow.tsx src/app/transactions/page.tsx` — expected: exit 0.
Run: `npm run build` — expected: compiled, 13 static pages.

- [ ] **Step 4: Try it, once the migration has run**

In Activity: a card purchase names the card where a wallet would be; a payment reads "Card payment" and counts as neither spending nor income; deleting a payment puts the money back in its wallet. A statement carrying interest shows a charges row that offers no edit and no delete, and the month's spending total matches the dashboard's.

- [ ] **Step 5: Commit**

```bash
git add src/components/ActivityRow.tsx src/app/transactions/page.tsx
git commit -m "feat: card purchases, payments and charges in activity" -m "Patch-note: Card purchases, payments and card charges all show in Activity."
```

---

### Task 11: Finish the feature

**Files:**
- Modify: `src/lib/patchNotes.ts` (through `npm run patch-notes`)

**Interfaces:**
- Consumes: everything above.
- Produces: a released branch — verified, noted in "What's new", and merged.

- [ ] **Step 1: Run everything**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: every test passes (Tasks 2–4 added roughly 27), `tsc` exits 0, and the build compiles 13 static pages.

- [ ] **Step 2: Lint against what was already there**

```bash
npx eslint src/lib/creditCard.ts src/lib/creditCard.test.ts src/lib/walletDeltas.ts \
  src/components/CreditCardForm.tsx src/components/CreditCardTile.tsx \
  src/components/CreditCardSheet.tsx src/components/PayCardSheet.tsx \
  src/components/FundingPicker.tsx src/components/CardDueStrip.tsx \
  src/components/ActivityRow.tsx src/components/EditEntrySheet.tsx \
  src/components/WalletPresetPicker.tsx src/app/wallets/page.tsx \
  src/app/expenses/new/page.tsx src/app/page.tsx src/app/transactions/page.tsx
git show main:src/components/AppContext.tsx | npx eslint --stdin --stdin-filename src/components/AppContext.tsx
npx eslint src/components/AppContext.tsx
```

Expected: the first command exits 0. The last two must report the same counts as each other — `AppContext.tsx` already has 1 error and 1 warning on `main`, and this work must not add more.

- [ ] **Step 3: Walk through it by hand**

The migration from Task 1 must already have been run. In `npm run dev`:

1. **Add a card:** Wallets → Add Wallet → Credit card. Pick a bank, set the limit, statement and due days, 3% interest, 3% minimum with a ₱500 floor, and something owed now. It appears under Credit cards with that amount owed and its available credit.
2. **Buy with it:** log an expense and pick the card in "Pay from". No wallet balance moves, the dashboard's spending for this cycle rises, and the card owes more.
3. **Split a purchase on it:** the card is charged the whole amount while the expense keeps only your share, and the others appear on the debt board.
4. **Over the limit:** type an amount above the available credit and check the amber note appears and the purchase still saves.
5. **Pay it:** from the card's sheet, pay the minimum from a wallet. That wallet drops by exactly that amount, "Paid since it closed" rises, and Activity shows "Card payment" counting as neither spending nor income.
6. **Reminder:** with a statement due within 7 days, the dashboard shows its strip; tapping it opens the pay sheet. Paying the balance in full clears the strip.
7. **Dates:** edit a card purchase to a date before the card was added — Save is refused with the reason on screen.
8. **Archive:** delete the card. It leaves Wallets, the expense form and the dashboard, while its purchases and the wallet payment stay in Activity.
9. **Reset balances** (Settings, on a throwaway account): it deletes this cycle's expenses and movements by date, so the cycle's card purchases and payments go with them and each card's owed amount recalculates. The cards and their terms stay. No task changes this; the check is that it behaves as the spec says.

Any of these failing is a bug in the task that owns it: fix it there, then re-run Steps 1–2.

- [ ] **Step 4: Draft the patch note**

```bash
npm run patch-notes
```

It collects the `Patch-note:` lines from Tasks 7–10's commits. Replace the `TODO: name this release` title (something like "Credit cards"), tidy the wording, then:

```bash
npm test
git add src/lib/patchNotes.ts
git commit -m "docs: patch notes for credit cards"
```

`npm test` fails while the TODO title is still there, so it is also the check that the draft was edited.

- [ ] **Step 5: Finish the branch**

Ask the user before merging or pushing. With their go-ahead, and the whole suite green:

```bash
git checkout main
git merge --no-ff feat/credit-cards -m "Merge branch 'feat/credit-cards'"
git push origin main
```

Then tell them the migration must have been run against production data before the deploy is useful, since the app reads `credit_cards` on load.
