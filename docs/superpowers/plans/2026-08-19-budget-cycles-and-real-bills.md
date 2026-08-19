# Budget Cycles and Real Bills Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the budget run on a cycle that starts on any day of the month, turn bills into real dated obligations with editable amounts, and make Electric an ordinary loggable category again.

**Architecture:** All period arithmetic moves into one pure module, `src/lib/cycle.ts`, keyed so that existing `YYYY-MM` columns keep working. Every "this month" call site is then swapped to ask that module, with the start day pinned to 1 so nothing observable changes. Only after that does the setting become reachable, bills gain due dates and categories, and Electric's metered special case get deleted.

**Tech Stack:** Next.js 16.2.4 (Turbopack), React 19.2.4, TypeScript, Tailwind 4, Supabase JS 2.x. Tests are `node --test --experimental-strip-types` via `npm test`.

**Spec:** `docs/superpowers/specs/2026-08-19-budget-cycles-and-real-bills-design.md`

## Global Constraints

- **Cycle boundaries are LOCAL time, never UTC.** `toISOString()` is banned in `cycle.ts`. In PH (UTC+8) it reports the previous day for anything before 08:00.
- **A cycle is keyed by the `YYYY-MM` of the calendar month its START date falls in.** With `startDay = 15`, Aug 20 → `'2026-08'`, Sep 3 → `'2026-08'`, Sep 15 → `'2026-09'`.
- **`cycleStartDay` defaults to `1`, and at 1 every behaviour must be byte-identical to today's calendar-month behaviour.** This is the regression guard.
- **Day numbers clamp to the month's length** (31 in February → 28/29), matching `paydaysInMonth` at `src/components/AppContext.tsx:339-346`.
- `src/lib/cycle.ts` is pure: no React, no Supabase, no I/O — the same rule `src/lib/walletDeltas.ts` states in its header comment.
- Money is rounded at the centavo via the existing `round2`. Never introduce a second rounding helper.
- Currency is always rendered through the existing `fmt(n, currency)`; never hardcode `₱`.
- `npm run lint` exits 1 on a clean tree (2 errors, 6 warnings, both errors pre-existing in `AppContext.tsx`). Only a problem count **above 8** is a regression.

## Prerequisites

Two SQL migrations, run in the Supabase SQL editor (this project has no migration runner).

**Already run by the user:**

```sql
alter table bills add column due_day int;
alter table bills add column category text not null default 'bills';
```

**Still required — run before Task 3:**

```sql
alter table settings add column cycle_start_day int not null default 1;
```

## File Structure

| File | Responsibility |
|---|---|
| `src/lib/cycle.ts` | **New.** All cycle arithmetic. Pure. |
| `src/lib/cycle.test.ts` | **New.** Unit tests for the above. |
| `src/components/AppContext.tsx` | Swap month filters for cycle keys; `cycleStartDay` in `Settings`; `dueDay`/`category` on `Bill`; `markBillPaid` takes an amount. |
| `src/app/expenses/page.tsx` | Category spend by cycle; delete the Electric special case; reframe the ⚡ tile. |
| `src/app/transactions/page.tsx` | Month stepper becomes a cycle stepper. |
| `src/components/BillsSheet.tsx` | Due-date sorting and status; amount field on the pay sheet. |
| `src/app/settings/page.tsx` | The `cycleStartDay` control and its confirm sheet. |
| `src/lib/categories.ts` | `electric` joins `BUILTIN_CATEGORIES`. |
| `src/app/expenses/new/page.tsx` | Local `CATEGORIES` array deleted in favour of the shared list. |
| `src/components/CategoryDetailSheet.tsx` | `metered` prop and its empty state removed. |
| `src/components/ElectricSection.tsx` | Appliance resets keyed by cycle. |
| `src/app/page.tsx` | Dashboard Electric card relabelled as an estimate. |

---

### Task 1: The cycle primitive

**Files:**
- Create: `src/lib/cycle.ts`
- Test: `src/lib/cycle.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `type CycleKey = string`; `clampDay(year: number, month: number, day: number): number`; `cycleKeyOf(date: Date, startDay: number): CycleKey`; `currentCycleKey(startDay: number): CycleKey`; `cycleRange(key: CycleKey, startDay: number): { start: Date; end: Date }`; `cycleLabel(key: CycleKey, startDay: number): string`; `dueDateInCycle(dueDay: number, key: CycleKey, startDay: number): Date`; `datesInCycle(days: number[], key: CycleKey, startDay: number): Date[]`; `daysInCycle(key: CycleKey, startDay: number): number`; `daysElapsedInCycle(key: CycleKey, startDay: number, now?: Date): number`; `shiftCycleKey(key: CycleKey, by: number): CycleKey`.

Note: `month` in `clampDay` is **zero-based**, matching the `Date` constructor. `CycleKey` strings are one-based (`'2026-08'` is August).

- [ ] **Step 1: Write the failing test**

Create `src/lib/cycle.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleKeyOf, cycleRange, cycleLabel, dueDateInCycle,
  datesInCycle, daysInCycle, daysElapsedInCycle, shiftCycleKey, clampDay,
} from './cycle.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// The regression guard for everyone who never touches the setting: at a start
// day of 1 a cycle IS the calendar month.
test('a start day of 1 is the calendar month', () => {
  assert.equal(cycleKeyOf(at(2026, 8, 1), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 19), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 31), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 1), 1), '2026-09');
});

// A cycle is named for the month it STARTS in, so Sep 3 still belongs to the
// cycle that opened on Aug 15.
test('a mid-month start day names the cycle for the month it opens in', () => {
  assert.equal(cycleKeyOf(at(2026, 8, 5), 15), '2026-07');
  assert.equal(cycleKeyOf(at(2026, 8, 14), 15), '2026-07');
  assert.equal(cycleKeyOf(at(2026, 8, 15), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 19), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 3), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 14), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 15), 15), '2026-09');
});

test('a January date before the start day belongs to the previous December', () => {
  assert.equal(cycleKeyOf(at(2026, 1, 3), 15), '2025-12');
});

// The boundary is local midnight. A bill paid at 00:30 on the 15th in Manila
// must land in the cycle that just opened, not the one that just closed.
test('the boundary is local midnight of the start day', () => {
  assert.equal(cycleKeyOf(new Date(2026, 7, 15, 0, 30), 15), '2026-08');
  assert.equal(cycleKeyOf(new Date(2026, 7, 14, 23, 59), 15), '2026-07');
});

test('a cycle range is half-open and covers the gap to the next one', () => {
  const aug = cycleRange('2026-08', 15);

  assert.deepEqual(aug.start, new Date(2026, 7, 15));
  assert.deepEqual(aug.end, new Date(2026, 8, 15));
  assert.deepEqual(cycleRange('2026-09', 15).start, aug.end);
});

// No date may fall in two cycles or in none.
test('every day of a year belongs to exactly one cycle', () => {
  for (const startDay of [1, 15, 28, 31]) {
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i);
      const { start, end } = cycleRange(cycleKeyOf(d, startDay), startDay);
      const stamp = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      assert.ok(stamp >= start && stamp < end, `${d.toDateString()} @ ${startDay}`);
    }
  }
});

test('a day past the end of a short month clamps to its last day', () => {
  assert.equal(clampDay(2026, 1, 31), 28);   // February 2026
  assert.equal(clampDay(2024, 1, 31), 29);   // February 2024, a leap year
  assert.equal(clampDay(2026, 3, 31), 30);   // April
  assert.deepEqual(cycleRange('2026-01', 31).end, new Date(2026, 1, 28));
});

test('a cycle is labelled by its span unless it is a whole calendar month', () => {
  assert.equal(cycleLabel('2026-08', 1), 'August 2026');
  assert.equal(cycleLabel('2026-08', 15), 'Aug 15 – Sep 14');
});

// A due day lands in whichever of the cycle's two calendar months contains it.
test('a due day resolves to its one occurrence inside the cycle', () => {
  assert.deepEqual(dueDateInCycle(15, '2026-08', 15), new Date(2026, 7, 15));
  assert.deepEqual(dueDateInCycle(20, '2026-08', 15), new Date(2026, 7, 20));
  assert.deepEqual(dueDateInCycle(5, '2026-08', 15), new Date(2026, 8, 5));
  assert.deepEqual(dueDateInCycle(31, '2026-01', 15), new Date(2026, 0, 31));
  assert.deepEqual(dueDateInCycle(31, '2026-02', 15), new Date(2026, 1, 28));
});

// The reason paydays move to cycles: a 1st-and-15th cycle starting on the 15th
// contains BOTH paydays, so income and spending finally share a window.
test('both paydays fall inside a cycle that starts on the 15th', () => {
  assert.deepEqual(datesInCycle([1, 15], '2026-08', 15), [
    new Date(2026, 7, 15),
    new Date(2026, 8, 1),
  ]);
});

test('days that clamp onto the same date are not counted twice', () => {
  assert.deepEqual(datesInCycle([30, 31], '2026-02', 1), [new Date(2026, 1, 28)]);
});

test('cycle length and elapsed days match the calendar month at a start day of 1', () => {
  assert.equal(daysInCycle('2026-08', 1), 31);
  assert.equal(daysElapsedInCycle('2026-08', 1, at(2026, 8, 19)), 19);
});

test('elapsed days count from the cycle start, not the month start', () => {
  assert.equal(daysInCycle('2026-08', 15), 31);
  assert.equal(daysElapsedInCycle('2026-08', 15, at(2026, 8, 19)), 5);
  assert.equal(daysElapsedInCycle('2026-08', 15, at(2026, 9, 3)), 20);
});

test('stepping a cycle key moves whole cycles and rolls the year', () => {
  assert.equal(shiftCycleKey('2026-08', -1), '2026-07');
  assert.equal(shiftCycleKey('2026-12', 1), '2027-01');
  assert.equal(shiftCycleKey('2026-01', -1), '2025-12');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './cycle.ts'`.

- [ ] **Step 3: Write the implementation**

Create `src/lib/cycle.ts`:

```ts
// Budget cycle arithmetic, kept pure: no React, no Supabase, no I/O.
//
// A cycle is a budgeting period that need not start on the 1st. It is keyed by
// the YYYY-MM of the calendar month its START date falls in — the same string
// shape already stored in bills.paid_months, appliances.last_reset_month and
// instalments.month, so moving the app onto cycles needs no schema change on
// any of them. With a start day of 15, the cycle keyed '2026-08' runs from
// Aug 15 up to but not including Sep 15.
//
// Every boundary is LOCAL time. isoDay in AppContext explains why: toISOString()
// converts to UTC first, which in PH (UTC+8) reports the previous day for
// anything before 08:00. A bill paid at 00:30 on the 15th belongs to the cycle
// that just opened, not the one that just closed.

export type CycleKey = string; // 'YYYY-MM', one-based month

// `month` is zero-based here, as in the Date constructor.
//
// A start day of 31 still has to land in a 30-day month, so it clamps to that
// month's end — the same rule paydaysInMonth already applies to paydays.
export function clampDay(year: number, month: number, day: number): number {
  const lastDay = new Date(year, month + 1, 0).getDate();
  return Math.min(Math.max(day, 1), lastDay);
}

// Midnight local on the day the cycle opening in this calendar month begins.
function startOfCycleIn(year: number, month: number, startDay: number): Date {
  return new Date(year, month, clampDay(year, month, startDay));
}

function keyOf(year: number, month: number): CycleKey {
  const norm = new Date(year, month, 1); // normalises month -1 and 12
  return `${norm.getFullYear()}-${String(norm.getMonth() + 1).padStart(2, '0')}`;
}

function partsOf(key: CycleKey): { year: number; month: number } {
  const [y, m] = key.split('-').map(Number);
  return { year: y, month: m - 1 };
}

export function cycleKeyOf(date: Date, startDay: number): CycleKey {
  const y = date.getFullYear();
  const m = date.getMonth();
  // Compared at day resolution so the time of day cannot straddle the boundary.
  const day = new Date(y, m, date.getDate());
  return day < startOfCycleIn(y, m, startDay) ? keyOf(y, m - 1) : keyOf(y, m);
}

export function currentCycleKey(startDay: number): CycleKey {
  return cycleKeyOf(new Date(), startDay);
}

// Half-open: [start, end). The end is the next cycle's start, so consecutive
// cycles tile the calendar with no gap and no overlap.
export function cycleRange(key: CycleKey, startDay: number): { start: Date; end: Date } {
  const { year, month } = partsOf(key);
  return {
    start: startOfCycleIn(year, month, startDay),
    end: startOfCycleIn(year, month + 1, startDay),
  };
}

export function shiftCycleKey(key: CycleKey, by: number): CycleKey {
  const { year, month } = partsOf(key);
  return keyOf(year, month + by);
}

export function cycleLabel(key: CycleKey, startDay: number): string {
  const { start, end } = cycleRange(key, startDay);
  if (startDay === 1) {
    return start.toLocaleDateString('en-PH', { month: 'long', year: 'numeric' });
  }
  // The range is half-open, so the last day the user sees is the day before it ends.
  const last = new Date(end.getFullYear(), end.getMonth(), end.getDate() - 1);
  const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  return `${start.toLocaleDateString('en-PH', opts)} – ${last.toLocaleDateString('en-PH', opts)}`;
}

// A cycle spans at most two calendar months, and a given day-of-month falls in
// exactly one of them: if it has already passed when the cycle opens, it must
// be the occurrence in the following month.
export function dueDateInCycle(dueDay: number, key: CycleKey, startDay: number): Date {
  const { start, end } = cycleRange(key, startDay);
  const first = new Date(
    start.getFullYear(), start.getMonth(),
    clampDay(start.getFullYear(), start.getMonth(), dueDay),
  );
  if (first >= start) return first;
  return new Date(
    end.getFullYear(), end.getMonth(),
    clampDay(end.getFullYear(), end.getMonth(), dueDay),
  );
}

// Every one of these days-of-month, as concrete dates inside the cycle,
// ascending. Deduped: 30 and 31 collapse onto the same date in a short month.
export function datesInCycle(days: number[], key: CycleKey, startDay: number): Date[] {
  const seen = new Map<number, Date>();
  for (const d of days) {
    const date = dueDateInCycle(d, key, startDay);
    seen.set(date.getTime(), date);
  }
  return [...seen.values()].sort((a, b) => a.getTime() - b.getTime());
}

const DAY_MS = 86_400_000;

export function daysInCycle(key: CycleKey, startDay: number): number {
  const { start, end } = cycleRange(key, startDay);
  return Math.round((end.getTime() - start.getTime()) / DAY_MS);
}

// Inclusive of today, matching the `today.getDate()` this replaces: on the
// cycle's opening day, one day has elapsed.
export function daysElapsedInCycle(key: CycleKey, startDay: number, now: Date = new Date()): number {
  const { start } = cycleRange(key, startDay);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.floor((today.getTime() - start.getTime()) / DAY_MS) + 1;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 8 pre-existing `walletDeltas` tests plus 14 new ones.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/cycle.ts src/lib/cycle.test.ts
git commit -m "feat: a budget cycle that need not start on the 1st"
```

---

### Task 2: Re-keying bill ticks when the cycle changes

**Files:**
- Modify: `src/lib/cycle.ts` (append)
- Test: `src/lib/cycle.test.ts` (append)

**Interfaces:**
- Consumes: `cycleKeyOf` from Task 1.
- Produces: `interface TickedBill { id: string; paidMonths: string[]; paidExpenseIds: Record<string, string> }` and `rekeyBillTicks<T extends TickedBill>(bills: T[], expenseDates: Record<string, string>, newStartDay: number): T[]`.

`expenseDates` maps expense id → ISO date string. Passing a plain map rather than `Expense[]` keeps `cycle.ts` free of app types.

- [ ] **Step 1: Write the failing test**

Append to `src/lib/cycle.test.ts`:

```ts
import { rekeyBillTicks } from './cycle.ts';

// A bill paid on Aug 5 was stored under '2026-08' meaning "August". Once the
// cycle starts on the 15th, '2026-08' means Aug 15 – Sep 14 — a period that
// payment does NOT belong to. Left alone the bill would read as already paid.
test('a tick moves to the cycle its payment actually falls in', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 5).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-07']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-07': 'e1' });
});

test('a tick already in the right cycle is left where it is', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 20).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-08']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-08': 'e1' });
});

// Months ticked before payments recorded an expense have no date to re-key
// from. Inventing one would be worse than leaving them.
test('a legacy tick with no expense is left untouched', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-06', '2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 5).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths.sort(), ['2026-06', '2026-07']);
});

// An expense id pointing at a row that no longer exists must not silently drop
// the tick — the bill would become payable twice.
test('a tick whose expense is missing keeps its original key', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'gone' } }],
    {},
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-08']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-08': 'gone' });
});

// The confirm sheet may be re-run, and a failed write may be retried.
test('re-keying twice changes nothing the second time', () => {
  const bills = [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }];
  const dates = { e1: new Date(2026, 7, 5).toISOString() };

  const once = rekeyBillTicks(bills, dates, 15);

  assert.deepEqual(rekeyBillTicks(once, dates, 15), once);
});

test('fields other than the ticks survive re-keying', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', name: 'Electric', amount: 2500, paidMonths: [], paidExpenseIds: {} }],
    {},
    15,
  );

  assert.equal(out[0].name, 'Electric');
  assert.equal(out[0].amount, 2500);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test`
Expected: FAIL — `rekeyBillTicks` is not exported from `./cycle.ts`.

- [ ] **Step 3: Write the implementation**

Append to `src/lib/cycle.ts`:

```ts
export interface TickedBill {
  id: string;
  paidMonths: string[];
  paidExpenseIds: Record<string, string>;
}

// Changing the cycle start day silently reinterprets every stored tick: the
// string '2026-08' stops meaning "August" and starts meaning "Aug 15 – Sep 14".
// The payment's own date is the only reliable evidence of which cycle it
// belongs to, so each tick is re-keyed from the expense it created.
//
// Ticks with no usable expense date keep their original key. Two ticks landing
// on the same new key is possible in principle; the later month wins, which is
// deterministic and matches "the most recent payment for this period".
export function rekeyBillTicks<T extends TickedBill>(
  bills: T[],
  expenseDates: Record<string, string>,
  newStartDay: number,
): T[] {
  return bills.map(bill => {
    const paidExpenseIds: Record<string, string> = {};
    const keys = new Set<string>();

    for (const month of [...bill.paidMonths].sort()) {
      const expenseId = bill.paidExpenseIds[month];
      const iso = expenseId ? expenseDates[expenseId] : undefined;
      const key = iso ? cycleKeyOf(new Date(iso), newStartDay) : month;

      keys.add(key);
      if (expenseId) paidExpenseIds[key] = expenseId;
    }

    // A tick recorded in paidExpenseIds but absent from paidMonths would be
    // dropped by the loop above, stranding the expense it points at.
    for (const [month, expenseId] of Object.entries(bill.paidExpenseIds)) {
      if (bill.paidMonths.includes(month)) continue;
      const iso = expenseDates[expenseId];
      const key = iso ? cycleKeyOf(new Date(iso), newStartDay) : month;
      keys.add(key);
      paidExpenseIds[key] = expenseId;
    }

    return { ...bill, paidMonths: [...keys].sort(), paidExpenseIds };
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS — 28 tests total.

- [ ] **Step 5: Typecheck and commit**

```bash
npx tsc --noEmit
git add src/lib/cycle.ts src/lib/cycle.test.ts
git commit -m "feat: re-key bill ticks from the date their payment landed"
```

---

### Task 3: Wire the cycle through AppContext, pinned to day 1

Nothing observable changes in this task. That is the point: it isolates the risky swap from any UI movement.

**Prerequisite:** the `settings.cycle_start_day` migration above must be run first.

**Files:**
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Consumes: `cycleKeyOf`, `currentCycleKey`, `cycleRange`, `datesInCycle`, `daysInCycle`, `daysElapsedInCycle` from Task 1.
- Produces: `Settings.cycleStartDay: number`; `paydaysInCycle(settings: Settings, key: CycleKey): Date[]` exported from `AppContext`; `Computed.currentCycle: CycleKey`.

- [ ] **Step 1: Add the setting to the type, the defaults and both DB mappers**

In `src/components/AppContext.tsx`, add to `interface Settings` (after `customPaydays`, around line 134):

```ts
  // The day of the month the budget period begins. 1 is the calendar month and
  // the default; 15 means a period running the 15th to the 14th.
  cycleStartDay: number;
```

In `fromDBSettings` (around line 371):

```ts
    cycleStartDay:      Number(r.cycle_start_day)      || 1,
```

In `toDBSettings` (around line 393):

```ts
  if ('cycleStartDay'       in s) m.cycle_start_day        = s.cycleStartDay;
```

In `defaultSettings` (around line 459) and in the reset block at line ~1786, add `cycleStartDay: 1,` alongside `customPaydays`.

- [ ] **Step 2: Replace `currentYYYYMM` and add the cycle-aware payday helper**

Add the import at the top of the file:

```ts
import {
  CycleKey, cycleKeyOf, currentCycleKey, cycleRange,
  datesInCycle, daysInCycle, daysElapsedInCycle,
} from '@/lib/cycle';
```

Replace the body of `currentYYYYMM` (line 299) so every existing caller keeps compiling while the swap proceeds file by file. Its signature does **not** change — callers are migrated to `currentCycleKey(settings.cycleStartDay)` individually in Step 5 and in Task 4, and the shim is deleted once none remain:

```ts
// Superseded by currentCycleKey. Kept only as the zero-argument default for
// code paths that genuinely mean "the calendar month", of which there are none
// left — delete once the last caller is gone.
export function currentYYYYMM(): string {
  return currentCycleKey(1);
}
```

Add beneath `paydaysInMonth` (line 339), keeping `paydaysInMonth` in place for now:

```ts
// Every payday falling inside a cycle. This is why paydays moved off calendar
// months: with a 1st-and-15th schedule and a cycle starting on the 15th, one
// cycle contains BOTH paydays, so income and spending finally share a window.
export function paydaysInCycle(settings: Settings, key: CycleKey): Date[] {
  const days =
    settings.paydayCycle === '1st-15th' ? [1, 15]
    : settings.paydayCycle === 'monthly' ? [1]
    : settings.customPaydays;
  return datesInCycle(days, key, settings.cycleStartDay);
}
```

- [ ] **Step 3: Swap the three month filters in `computed`**

In the `computed` `useMemo` (from line 576), replace the three `d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear()` checks at lines 582, 589 and 599 with a single shared predicate:

```ts
    const today = new Date();
    const startDay = settings.cycleStartDay;
    const currentCycle = currentCycleKey(startDay);
    const inCycle = (iso: string) => cycleKeyOf(new Date(iso), startDay) === currentCycle;

    const totalBalance = wallets.reduce((s, w) => s + w.balance, 0);
    const monthExpenses = expenses.filter(e => inCycle(e.date));
    // Bank fees are not categorised expenses, but the money is gone all the same,
    // so every spending figure below counts them alongside what you bought.
    const feesThisMonth = moneyMoves
      .filter(mm => inCycle(mm.date))
      .reduce((s, mm) => s + mm.fee, 0);
    const totalSpentThisMonth = monthExpenses.reduce((s, e) => s + e.amount, 0) + feesThisMonth;
    const receivedThisMonth = moneyMoves
      .filter(mm => mm.kind === 'earned' && inCycle(mm.date))
      .reduce((s, mm) => s + mm.amount, 0);
```

- [ ] **Step 4: Move the projection denominators onto the cycle**

Replace lines 603-610 and 630-634. `daysElapsed`/`daysInMonth` become cycle-relative, and `startedThisMonth` compares cycle keys rather than calendar months:

```ts
    const daysElapsed = daysElapsedInCycle(currentCycle, startDay, today);
    const daysInMonth = daysInCycle(currentCycle, startDay);

    const paydays = paydaysInCycle(settings, currentCycle);
```

```ts
    const startedThisMonth = cycleKeyOf(trackingStart, startDay) === currentCycle;
    const untrackedDays = startedThisMonth
      ? Math.max(0, daysElapsedInCycle(currentCycle, startDay, trackingStart) - 1)
      : 0;
```

`pendingPaydays` and `futureIncome` currently compare `d.getDate() <= daysElapsed`, which is wrong once a cycle spans two months (Sep 1 has a smaller `getDate()` than Aug 15). Replace both with a date comparison:

```ts
    const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const pendingPaydays: PendingPayday[] = paydays
      .filter(d => d <= startOfToday && !settings.paydayLog[isoDay(d)])
      .map(d => ({ date: isoDay(d), amount: perPayday }));
    const unconfirmedIncome = pendingPaydays.reduce((s, p) => s + p.amount, 0);
    const futureIncome = paydays.filter(d => d > startOfToday).length * perPayday;
```

- [ ] **Step 5: Expose the current cycle and swap the remaining `currentYYYYMM()` calls**

Add `currentCycle` to the object `computed` returns (around line 664) and to `interface Computed`:

```ts
  /** The cycle key everything on screen is currently reporting on. */
  currentCycle: CycleKey;
```

Replace the six `const month = currentYYYYMM();` calls — in `toggleAppliance` (1631), `markBillPaid` (1662), `unmarkBillPaid` (1685), `logApplianceUsage` (1715), `resetBalances` (1734) and `refundApplianceUsage` (1822) — with:

```ts
    const month = currentCycleKey(settings.cycleStartDay);
```

In `resetBalances` (lines 1734-1740), the month-start and next-month boundaries are computed by string surgery on the key. Replace them with the range:

```ts
    const month = currentCycleKey(settings.cycleStartDay);
    const { start, end } = cycleRange(month, settings.cycleStartDay);
    const monthStart = start.toISOString();
    const nextStart = end.toISOString();
```

- [ ] **Step 6: Verify nothing changed**

Run: `npm test && npx tsc --noEmit && npm run build`
Expected: tests PASS, typecheck clean, build `✓ Compiled` with 13 static pages / 11 routes.

Then run `npm run dev` and confirm on `/` and `/expenses` that every figure is identical to before this task. `cycleStartDay` is 1 everywhere, so any change at all is a bug in this task.

- [ ] **Step 7: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "refactor: AppContext measures the month as a cycle starting on day 1"
```

---

### Task 4: Wire the cycle through the pages, still pinned to day 1

Also observably a no-op.

**Files:**
- Modify: `src/app/expenses/page.tsx:160-190, 275-285`
- Modify: `src/app/transactions/page.tsx:39-90`
- Modify: `src/components/BillsSheet.tsx:4, 76`
- Modify: `src/components/ElectricSection.tsx:6, 48`

**Interfaces:**
- Consumes: `Settings.cycleStartDay`, `currentCycle` from Task 3; `cycleKeyOf`, `currentCycleKey`, `cycleLabel`, `shiftCycleKey`, `cycleRange` from Task 1.
- Produces: no new exports.

- [ ] **Step 1: Budget page category spend by cycle**

In `src/app/expenses/page.tsx`, replace the `spentByCategory` memo (lines 170-181) and the `monthLabel` line:

```ts
  const { cycleStartDay } = settings;
  const currentCycle = currentCycleKey(cycleStartDay);
  const monthLabel = cycleLabel(currentCycle, cycleStartDay);

  const spentByCategory = useMemo(() => {
    const acc: Partial<Record<Category, number>> = {};
    expenses.forEach(e => {
      if (cycleKeyOf(new Date(e.date), cycleStartDay) === currentCycle) {
        acc[e.category] = (acc[e.category] ?? 0) + e.amount;
      }
    });
    return acc;
  }, [expenses, cycleStartDay, currentCycle]);
```

The `// eslint-disable-next-line react-hooks/exhaustive-deps` above the old closing brace is deleted — the dependency list is now honest.

Replace both `currentYYYYMM()` calls in the Bills tile (lines 280, 283) with `currentCycle`, and add `currentCycleKey, cycleKeyOf, cycleLabel` to the imports from `@/lib/cycle`. Remove `currentYYYYMM` from the `@/components/AppContext` import.

- [ ] **Step 2: Activity page steps by cycle**

In `src/app/transactions/page.tsx`, replace the `viewMonth` state and its derived values (lines 39, 47-49):

```ts
  const { cycleStartDay } = settings;
  const [viewCycle, setViewCycle] = useState(() => currentCycleKey(cycleStartDay));
  const monthLabel = cycleLabel(viewCycle, cycleStartDay);
```

Replace `inMonth` (lines 83-86):

```ts
    const inMonth = (iso: string) => cycleKeyOf(new Date(iso), cycleStartDay) === viewCycle;
```

Update the memo's dependency array (line 175) to swap `y, m` for `viewCycle, cycleStartDay`. Find the two stepper buttons that call `setViewMonth` and change them to `setViewCycle(shiftCycleKey(viewCycle, -1))` and `setViewCycle(shiftCycleKey(viewCycle, 1))`. Import `currentCycleKey, cycleKeyOf, cycleLabel, shiftCycleKey` from `@/lib/cycle`.

- [ ] **Step 3: BillsSheet and ElectricSection**

In `src/components/BillsSheet.tsx`, drop `currentYYYYMM` from the AppContext import and take the cycle from the hook instead:

```ts
  const { settings, updateSettings, markBillPaid, unmarkBillPaid, wallets, currentCycle } = useApp();
```

Replace line 76 with `const isPaid = b.paidMonths.includes(currentCycle);`.

In `src/components/ElectricSection.tsx`, replace `currentYYYYMM()` at line 48 with `currentCycleKey(settings.cycleStartDay)`, importing from `@/lib/cycle`.

- [ ] **Step 4: Verify nothing changed, then delete the shim**

Run: `npm test && npx tsc --noEmit && npm run build`

Confirm in `npm run dev` that `/`, `/expenses` and `/transactions` are pixel-identical to before. Then `grep -rn "currentYYYYMM" src` — if it returns only the definition, delete it and `paydaysInMonth` along with it, and re-run the checks.

- [ ] **Step 5: Commit**

```bash
git add src/app/expenses/page.tsx src/app/transactions/page.tsx src/components/BillsSheet.tsx src/components/ElectricSection.tsx
git commit -m "refactor: every page reads its period from the cycle, not the calendar"
```

---

### Task 5: The cycle start day becomes a setting

**Files:**
- Modify: `src/app/settings/page.tsx`
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Consumes: `rekeyBillTicks` from Task 2; `cycleLabel`, `currentCycleKey` from Task 1.
- Produces: `setCycleStartDay(day: number): Promise<void>` on the app context.

- [ ] **Step 1: Add the re-keying setter to AppContext**

Add to `interface AppContextValue` beside `updateSettings`:

```ts
  /** Changes the budget cycle and re-keys every bill tick onto the new periods. */
  setCycleStartDay: (day: number) => Promise<void>;
```

Implement it beside `updateBill`, and add `setCycleStartDay` to the provider's value object:

```ts
  // Changing the cycle reinterprets every stored 'YYYY-MM' tick, so the ticks
  // are rewritten from the dates their payments actually landed on. Appliance
  // counters have no per-minute history to re-bucket and the meter is only a
  // forecast, so they simply start the new cycle at zero.
  const setCycleStartDay = async (day: number) => {
    if (!userId) return;
    const expenseDates = Object.fromEntries(expenses.map(e => [e.id, e.date]));
    const bills = rekeyBillTicks(settings.bills, expenseDates, day);
    const month = currentCycleKey(day);
    const appliances = settings.appliances.map(a => ({
      ...a, totalMinutesThisMonth: 0, lastResetMonth: month,
      enabled: false, startedAt: null,
    }));

    setSettings(prev => ({ ...prev, cycleStartDay: day, bills, appliances }));

    await supabase.from('settings').update({ cycle_start_day: day }).eq('user_id', userId);
    for (const b of bills) {
      await supabase.from('bills')
        .update({ paid_months: b.paidMonths, paid_expense_ids: b.paidExpenseIds })
        .eq('id', b.id);
    }
    for (const a of appliances) {
      await supabase.from('appliances').update({
        total_minutes_this_month: 0, last_reset_month: month,
        enabled: false, started_at: null,
      }).eq('id', a.id);
    }
  };
```

- [ ] **Step 2: Add the Settings control and its confirm sheet**

In `src/app/settings/page.tsx`, add a `Section` directly after the existing `Payday Cycle` section (line 331). It sets local state only; nothing is written until the confirm sheet is accepted:

```tsx
          {/* Budget cycle */}
          <Section title="Budget Cycle">
            <SettingRow
              label="Cycle starts on day"
              sub={cycleLabel(currentCycleKey(settings.cycleStartDay), settings.cycleStartDay)}
            >
              <NumInput
                value={settings.cycleStartDay}
                onChange={v => setPendingCycleDay(Math.min(Math.max(Math.round(v), 1), 31))}
              />
            </SettingRow>
            <p className="mt-2 px-1 text-xs text-slate-500">
              Set this to the day your bills land. Day 1 is the plain calendar month.
            </p>
          </Section>
```

With this state and handler in `SettingsPage`:

```tsx
  const [pendingCycleDay, setPendingCycleDay] = useState<number | null>(null);
```

And the confirm sheet, rendered alongside the page's existing modals. It states the new period and the one consequence the user cannot undo by looking:

```tsx
      {pendingCycleDay !== null && pendingCycleDay !== settings.cycleStartDay && (
        <BottomSheet onClose={() => setPendingCycleDay(null)}>
          <p className="font-semibold text-white mb-2">Change your budget cycle?</p>
          <p className="text-sm text-slate-400 mb-3">
            Your current period becomes{' '}
            <span className="text-white">
              {cycleLabel(currentCycleKey(pendingCycleDay), pendingCycleDay)}
            </span>.
          </p>
          <p className="text-sm text-slate-400 mb-5">
            Nothing is deleted, but spending and income already logged move into whichever
            period now contains them — so this month&apos;s totals will change. Bills you have
            ticked paid follow the date you actually paid them.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => { await setCycleStartDay(pendingCycleDay); setPendingCycleDay(null); }}
              className="flex-1 rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white"
            >
              Change cycle
            </button>
            <button
              onClick={() => setPendingCycleDay(null)}
              className="flex-1 rounded-lg bg-white/5 py-2.5 text-sm text-slate-400"
            >
              Cancel
            </button>
          </div>
        </BottomSheet>
      )}
```

Import `BottomSheet` from `@/components/BottomSheet`, `cycleLabel`/`currentCycleKey` from `@/lib/cycle`, and pull `setCycleStartDay` from `useApp()`.

- [ ] **Step 3: Verify by hand**

Run `npm run dev`. Note the Food total on `/expenses`. Set the cycle to 15, confirm, and check that:
- the Budget page header reads `Aug 15 – Sep 14`
- Food's total now counts only from the 15th
- `/transactions` steps between cycles with the same labels
- setting it back to 1 restores the original totals

- [ ] **Step 4: Commit**

```bash
npm test && npx tsc --noEmit && npm run build
git add src/app/settings/page.tsx src/components/AppContext.tsx
git commit -m "feat: choose the day your budget cycle starts"
```

---

### Task 6: Bills carry a due day and a category

**Files:**
- Modify: `src/components/AppContext.tsx`
- Modify: `src/components/BillsSheet.tsx`
- Modify: `src/app/expenses/page.tsx` (the bill edit sheet)

**Interfaces:**
- Consumes: nothing new.
- Produces: `Bill.dueDay: number | null`; `Bill.category: Category`; `updateBill(id, updates: { name?: string; amount?: number; dueDay?: number | null; category?: Category })`.

The `bills.due_day` and `bills.category` columns already exist (see Prerequisites).

- [ ] **Step 1: Extend the type and the DB mapping**

In `src/components/AppContext.tsx`, extend `interface Bill` (line 100):

```ts
export interface Bill {
  id: string; name: string; amount: number;
  // Day of the month the bill is due, clamped to the month's length. null when
  // the user has not said. Resolved to a date inside the cycle by dueDateInCycle.
  dueDay: number | null;
  // Which category the payment is logged under. Defaults to 'bills'; setting it
  // to 'electric' is what makes the Electric card show the real bill.
  category: Category;
  paidMonths: string[];
  paidExpenseIds: Record<string, string>;
}
```

Extend `fromDBBill` (line 403):

```ts
const fromDBBill       = (r: Row): Bill       => ({
  id: r.id, name: r.name, amount: Number(r.amount),
  dueDay: r.due_day ?? null,
  category: (r.category || 'bills') as Category,
  paidMonths: (r.paid_months as string[]) || [],
  paidExpenseIds: (r.paid_expense_ids as Record<string, string>) || {},
});
```

Extend the insert in `updateSettings` (line 1511) so a new bill persists both fields:

```ts
          await supabase.from('bills').insert({
            id: b.id, user_id: userId, name: b.name, amount: b.amount,
            due_day: b.dueDay, category: b.category,
            paid_months: b.paidMonths ?? [],
          });
```

Extend `updateBill` (line 1703):

```ts
  const updateBill = async (
    id: string,
    updates: { name?: string; amount?: number; dueDay?: number | null; category?: Category },
  ) => {
    setSettings(prev => ({
      ...prev,
      bills: prev.bills.map(b => b.id === id ? { ...b, ...updates } : b),
    }));
    const db: Row = {};
    if ('name'     in updates) db.name     = updates.name;
    if ('amount'   in updates) db.amount   = updates.amount;
    if ('dueDay'   in updates) db.due_day  = updates.dueDay;
    if ('category' in updates) db.category = updates.category;
    await supabase.from('bills').update(db).eq('id', id);
  };
```

Update the matching signature in `interface AppContextValue` (line 267).

- [ ] **Step 2: Collect both fields when adding a bill**

In `src/components/BillsSheet.tsx`, extend the add form's state and `handleAdd`:

```ts
  const [dueDay, setDueDay] = useState('');
  const [category, setCategory] = useState<Category>('bills');

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const bill: Bill = {
      id: uid(), name: name.trim(), amount: parseFloat(amt),
      dueDay: dueDay ? Math.min(Math.max(parseInt(dueDay), 1), 31) : null,
      category,
      paidMonths: [], paidExpenseIds: {},
    };
    updateSettings({ bills: [...bills, bill] });
    setName(''); setAmt(''); setDueDay(''); setCategory('bills'); setAddOpen(false);
  };
```

Add to the add form, beneath the existing name/amount row:

```tsx
            <div className="flex gap-2">
              <input
                type="number" inputMode="numeric" value={dueDay}
                onChange={e => setDueDay(e.target.value)}
                placeholder="Due day (e.g. 15)" min="1" max="31"
                className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
              <select
                value={category}
                onChange={e => setCategory(e.target.value as Category)}
                className="w-32 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
              >
                {visibleCategories(settings.customCategories, settings.hiddenCategories).map(c => (
                  <option key={c.key} value={c.key} className="bg-[#111827]">{c.icon} {c.label}</option>
                ))}
              </select>
            </div>
```

Import `visibleCategories` from `@/lib/categories` and `Category` from `@/components/AppContext`.

- [ ] **Step 3: Edit both fields on an existing bill**

In `src/app/expenses/page.tsx`, the bill edit sheet currently tracks `editBillName` and `editBillAmt`. Add two more pieces of state, populate them in `openBillEdit`, and pass them through `saveBillEdit`:

```ts
  const [editBillDue, setEditBillDue] = useState('');
  const [editBillCat, setEditBillCat] = useState<Category>('bills');

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
```

Add a due-day `InlineAmountInput` (the page's existing helper, already suited to a bare number) labelled `Due day of month`, and the same `<select>` markup as Step 2, into the edit sheet's body.

- [ ] **Step 4: Verify and commit**

Run `npm run dev`. Add a bill with a due day of 15 and category Bills; reload the page and confirm both survive the round-trip to Supabase. Edit them and reload again.

```bash
npm test && npx tsc --noEmit && npm run build
git add src/components/AppContext.tsx src/components/BillsSheet.tsx src/app/expenses/page.tsx
git commit -m "feat: a bill knows when it is due and where it is logged"
```

---

### Task 7: Show when bills are due

**Files:**
- Modify: `src/components/BillsSheet.tsx`
- Modify: `src/app/expenses/page.tsx:275-285`

**Interfaces:**
- Consumes: `dueDateInCycle` from Task 1; `Bill.dueDay` from Task 6.
- Produces: no new exports.

- [ ] **Step 1: Sort bills by when they are due and label each one**

In `src/components/BillsSheet.tsx`, add above the `return`:

```ts
  const { cycleStartDay } = settings;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  // Bills without a due day sort last: they cannot be chased, so they should
  // not sit above the ones that can.
  const dueOf = (b: Bill) =>
    b.dueDay === null ? null : dueDateInCycle(b.dueDay, currentCycle, cycleStartDay);

  const sorted = [...bills].sort((a, b) => {
    const da = dueOf(a), db = dueOf(b);
    if (!da && !db) return 0;
    if (!da) return 1;
    if (!db) return -1;
    return da.getTime() - db.getTime();
  });

  const dueLabel = (b: Bill): { text: string; overdue: boolean } | null => {
    const due = dueOf(b);
    if (!due) return null;
    const days = Math.round((due.getTime() - startOfToday.getTime()) / 86_400_000);
    if (days === 0) return { text: 'due today', overdue: false };
    if (days < 0) return { text: `overdue by ${-days} day${days === -1 ? '' : 's'}`, overdue: true };
    return { text: `due in ${days} day${days === 1 ? '' : 's'}`, overdue: false };
  };

  const anyOverdue = bills.some(b => !b.paidMonths.includes(currentCycle) && dueLabel(b)?.overdue);
```

Change `bills.map(b => {` to `sorted.map(b => {`, and render the label under the bill's name — muted when paid, rose when overdue:

```tsx
              <div className="flex-1 min-w-0">
                <p className={`text-sm truncate ${isPaid ? 'text-slate-500' : 'text-white'}`}>{b.name}</p>
                {dueLabel(b) && (
                  <p className={`text-xs ${
                    isPaid ? 'text-slate-600' : dueLabel(b)!.overdue ? 'text-rose-400' : 'text-slate-500'
                  }`}>
                    {dueLabel(b)!.text}
                  </p>
                )}
              </div>
```

Import `dueDateInCycle` from `@/lib/cycle`.

- [ ] **Step 2: Warn on the Bills tile**

`anyOverdue` needs to be visible on the Budget page too, so compute it there rather than lifting it out of the sheet. In `src/app/expenses/page.tsx`, above the `return`:

```ts
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const overdueCount = bills.filter(b =>
    b.dueDay !== null
    && !b.paidMonths.includes(currentCycle)
    && dueDateInCycle(b.dueDay, currentCycle, cycleStartDay) < startOfToday
  ).length;
```

Change the Bills tile's `status` and `statusTone` (lines 278-285):

```tsx
                status={
                  bills.length === 0
                    ? 'none yet'
                    : overdueCount > 0
                      ? `${overdueCount} overdue`
                      : `${bills.filter(b => !b.paidMonths.includes(currentCycle)).length} of ${bills.length} unpaid`
                }
                statusTone={
                  overdueCount > 0 ? 'warn'
                    : bills.length > 0 && bills.every(b => b.paidMonths.includes(currentCycle)) ? 'good'
                      : 'default'
                }
```

- [ ] **Step 3: Verify and commit**

Run `npm run dev`. With today at Aug 19 and the cycle on day 1, a bill due on the 15th should read `overdue by 4 days` and the tile should show `1 overdue` in the warn tone. Set the cycle to 15 and the same bill should read `due in 27 days` — it belongs to the cycle that opens on Sep 15.

```bash
npm test && npx tsc --noEmit && npm run build
git add src/components/BillsSheet.tsx src/app/expenses/page.tsx
git commit -m "feat: bills say when they are due and shout when they are late"
```

---

### Task 8: Pay a bill for what it actually cost

**Files:**
- Modify: `src/components/AppContext.tsx:1659-1681`
- Modify: `src/components/BillsSheet.tsx:27-41`

**Interfaces:**
- Consumes: `Bill.category` from Task 6.
- Produces: `markBillPaid(id: string, walletId: string, amount: number): Promise<void>`.

- [ ] **Step 1: Take the amount and the category through `markBillPaid`**

In `src/components/AppContext.tsx`, change the signature in `interface AppContextValue` and the implementation at line 1661:

```ts
  // Paying a bill is spending, so ticking one writes a real expense against the
  // wallet the money came from rather than only flipping a flag. The amount is
  // what was actually paid, which for a variable bill is not what was budgeted —
  // the bill's own amount stays the estimate and is edited deliberately.
  const markBillPaid = async (id: string, walletId: string, amount: number) => {
    const month = currentCycleKey(settings.cycleStartDay);
    const bill = settings.bills.find(b => b.id === id);
    if (!bill || bill.paidMonths.includes(month) || !(amount > 0)) return;

    const expenseId = await addExpense({
      amount, category: bill.category, note: bill.name, walletId,
    });
    if (!expenseId) return;
```

The rest of the function is unchanged.

- [ ] **Step 2: Add the amount field to the pay sheet**

In `src/components/BillsSheet.tsx`, extend the paying state and `confirmPay`:

```ts
  const [payAmt, setPayAmt] = useState('');

  const startPaying = (billId: string) => {
    const bill = bills.find(b => b.id === billId);
    setPayingId(billId);
    setPayWalletId(settings.cashWalletId ?? '');
    // Pre-filled with the estimate, because most bills are what you expected.
    setPayAmt(bill ? String(bill.amount) : '');
  };

  const confirmPay = async () => {
    const amount = parseFloat(payAmt);
    if (!payingId || !payWalletId || paying || !(amount > 0)) return;
    setPaying(true);
    await markBillPaid(payingId, payWalletId, amount);
    setPaying(false);
    setPayingId(null);
    setPayAmt('');
  };
```

In the `isPaying` block, add the amount field above the wallet picker and drive the button's label from it:

```tsx
                    <p className="text-xs text-slate-500 mb-2">Amount paid</p>
                    <div className="flex items-center gap-1.5 mb-3">
                      <span className="text-sm text-slate-500">{currency}</span>
                      <input
                        type="number" inputMode="decimal" value={payAmt}
                        onChange={e => setPayAmt(e.target.value)}
                        step="0.01" min="0" autoFocus
                        className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white outline-none focus:border-blue-500/50"
                      />
                    </div>
                    <p className="text-xs text-slate-500 mb-2">Paid from</p>
                    <WalletPicker value={payWalletId} onChange={setPayWalletId} />
                    <button
                      onClick={confirmPay}
                      disabled={!payWalletId || paying || !(parseFloat(payAmt) > 0)}
                      className="mt-3 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-medium text-white disabled:opacity-40"
                    >
                      Log {fmt(parseFloat(payAmt) || 0, currency)} as paid
                    </button>
```

Also reset `setPayAmt('')` wherever `setPayingId(null)` is called to cancel (the tick button's `isPaying` branch).

- [ ] **Step 3: Verify and commit**

Run `npm run dev`. Tick a ₱500 bill paid for ₱612 from Cash. Confirm: Cash drops by ₱612, the Activity feed shows ₱612 under the bill's category, and the Bills tile still shows the bill's stored ₱500 estimate. Untick it and confirm Cash is restored by ₱612.

```bash
npm test && npx tsc --noEmit && npm run build
git add src/components/AppContext.tsx src/components/BillsSheet.tsx
git commit -m "feat: log a bill for what it actually cost, not what you budgeted"
```

---

### Task 9: Electric becomes an ordinary category

This is the task that closes the reported bug.

**Files:**
- Modify: `src/lib/categories.ts:14-22`
- Modify: `src/app/expenses/new/page.tsx:9-28`
- Modify: `src/app/expenses/page.tsx:38-46, 184-186, 286-300, 440-450`
- Modify: `src/components/CategoryDetailSheet.tsx:33-37, 145-155`
- Modify: `src/app/page.tsx:259-270`

**Interfaces:**
- Consumes: `visibleCategories` from `@/lib/categories`; `calcElectric` from `AppContext`.
- Produces: no new exports. `CategoryDetailSheet`'s `metered` prop is **removed**.

- [ ] **Step 1: Promote `electric` to a built-in category**

In `src/lib/categories.ts`, add to `BUILTIN_CATEGORIES` after `bills`:

```ts
  { key: 'electric',  label: 'Electric',  icon: '⚡', color: 'bg-amber-500/15  border-amber-500/40' },
```

- [ ] **Step 2: Delete the expense form's duplicate list**

In `src/app/expenses/new/page.tsx`, delete the local `CATEGORIES` array (lines 9-16) and replace the `categories` computation (lines 21-28) with the shared helper — the third copy of this list, and the reason `electric` could be missed:

```ts
  const categories = visibleCategories(settings.customCategories, settings.hiddenCategories);
```

Import `visibleCategories` from `@/lib/categories`. The JSX already reads `c.key`, `c.icon`, `c.label` and `c.color`, all of which `CategoryMeta` provides.

- [ ] **Step 3: Delete the metered special case on the Budget page**

In `src/app/expenses/page.tsx`:

- delete `ELECTRIC_CATEGORY` and `BUDGETABLE_CATEGORIES` (lines 43-46); replace every use of `BUDGETABLE_CATEGORIES` with `BUILTIN_CATEGORIES` imported from `@/lib/categories`
- replace `EXPENSE_CATEGORIES` (line 38) with the same import, deleting the fourth copy of the list
- delete `spentFor` (lines 184-186) and call `spentByCategory[key] ?? 0` directly at its call sites
- delete `metered={detailCat === ELECTRIC_CATEGORY.key}` from the `CategoryDetailSheet` usage (line 445)

`liveElectric` stays — it now feeds only the ⚡ tile.

- [ ] **Step 4: Reframe the ⚡ tile as a forecast**

Replace the Electric `BudgetTile` (lines 286-300). It no longer claims to be spend; it predicts the bill:

```tsx
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
```

With, above the `return`:

```ts
  // The bill the meter is trying to predict, if the user has one.
  const electricBill = bills.find(b => b.category === 'electric') ?? null;
```

- [ ] **Step 5: Remove the metered empty state**

In `src/components/CategoryDetailSheet.tsx`, delete the `metered` prop from `Props` (line 36), from the destructured parameters (line 46), and collapse the `groups.length === 0` branch (lines 145-155) to its non-metered half:

```tsx
        <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-8 text-center">
          <p className="text-sm text-slate-500 mb-1">Nothing logged here yet.</p>
          <Link href="/expenses/new" className="text-xs text-blue-400 underline underline-offset-2">
            Log an expense
          </Link>
        </div>
```

- [ ] **Step 6: Relabel the Dashboard card**

In `src/app/page.tsx` (lines 259-270), the card labelled `Electric Bill` renders `electricBillEstimate`. Change the label to `Electric Estimate` and its subtitle to `from your appliances this cycle`, so the Dashboard stops presenting a forecast as a bill.

- [ ] **Step 7: Verify the reported bug is fixed**

Run `npm run dev` and confirm:
- `/expenses/new` shows **Electric** in the category picker; logging ₱200 to it succeeds
- the Electric card on `/expenses` shows ₱200 and opens a detail sheet listing that expense
- a bill with category `electric`, ticked paid for ₱2,847, adds ₱2,847 to that same card
- the ⚡ tile reads `Est. ₱x · tracking under your ₱2,500 bill`
- `grep -rn "ELECTRIC_CATEGORY\|metered" src` returns nothing

- [ ] **Step 8: Commit**

```bash
npm test && npx tsc --noEmit && npm run build
git add src/lib/categories.ts src/app/expenses/new/page.tsx src/app/expenses/page.tsx src/components/CategoryDetailSheet.tsx src/app/page.tsx
git commit -m "feat: electric is a category you can log against again"
```

---

## Verification

Full check after Task 9:

```bash
npm test              # 28 tests, all passing
npx tsc --noEmit      # clean
npm run build         # ✓ Compiled, 13 static pages / 11 routes
npm run lint          # 2 errors + 6 warnings — pre-existing, NOT a regression
```

`npm run lint` is red on a clean tree; only a problem count above 8 is new.
