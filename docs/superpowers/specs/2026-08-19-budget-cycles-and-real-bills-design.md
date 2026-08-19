# Budget Cycles and Real Bills — Design

**Date:** 2026-08-19
**Status:** Approved, not yet implemented
**Scope:** New `src/lib/cycle.ts`; `src/components/AppContext.tsx`, `src/components/BillsSheet.tsx`, `src/app/expenses/page.tsx`, `src/app/transactions/page.tsx`, `src/app/settings/page.tsx`, `src/lib/categories.ts`, `src/app/expenses/new/page.tsx`, `src/components/ElectricSection.tsx`, `src/app/page.tsx`
**Schema:** one migration — `bills` gains `due_day` and `category`

## Problem

Four reported complaints turn out to be one modelling error.

**1. Electric expenses cannot be logged.** Reproduced on localhost: the Log Expense picker offers Food, Transport, Bills, Shopping, Health, Other and the user's custom Coffee. There is no Electric option. Nothing errors because nothing is attempted.

This is deliberate, from `34c2cca`:

```ts
// src/app/expenses/page.tsx:41-44
// Budgetable like the rest, but its spend is metered from appliance usage rather
// than logged expenses — so it's deliberately absent from the Log Expense picker.
const ELECTRIC_CATEGORY = { key: 'electric' as Category, label: 'Electric', icon: '⚡' };
```

The Electric budget card is a read-only meter. `spentFor('electric')` returns `calcElectric(settings)` — wattage × minutes × rate (`expenses/page.tsx:186`) — and can never contain a logged peso.

**2. The meter cannot be accurate.** It requires toggling every appliance on and off perfectly. Nobody does that. An imperfect meter is currently the sole source of truth for a real money figure.

**3. Bills have no due date.** `Bill` carries `{ id, name, amount, paidMonths, paidExpenseIds }`. Rent and electric are both due on the 15th and the app has nowhere to record that, so it cannot warn about either.

**4. Nothing shares a cycle.** Category spend filters on `d.getMonth() === now.getMonth()`; bill ticks and appliance resets key off `currentYYYYMM()`. Both are hard-wired to the 1st. A bill due on the 15th is measured against a window that closed two weeks earlier.

The unifying diagnosis: **electricity is modelled as a meter when the money is a bill**, and the app has no concept of a billing period other than the calendar month.

## Design

### 1. The cycle primitive

One new setting, `cycleStartDay: number` (1–31, default **1**). At 1 the behaviour is bit-for-bit today's, so this ships inert until the user opts in.

New pure module `src/lib/cycle.ts` — no React, no Supabase, testable in the `walletDeltas.ts` mould:

| Function | Purpose |
|---|---|
| `cycleKeyOf(date, startDay)` | Which cycle a date falls in |
| `currentCycleKey(startDay)` | Replaces `currentYYYYMM()` |
| `cycleRange(key, startDay)` | `{ start, end }`, half-open `[start, end)` |
| `cycleLabel(key, startDay)` | `"Aug 15 – Sep 14"`, or `"August 2026"` when `startDay` is 1 |
| `dueDateInCycle(dueDay, key, startDay)` | The concrete date a bill is due within a cycle |
| `paydaysInCycle(settings, key)` | Replaces `paydaysInMonth(settings, y, m)` |

**Keying.** A cycle is keyed by the `YYYY-MM` of its **start** date. With `startDay = 15`: Aug 20 → `'2026-08'`, Sep 3 → `'2026-08'`, Sep 15 → `'2026-09'`.

This is the same string shape already stored in `bills.paid_months`, `appliances.last_reset_month` and `instalments.month`, so those columns need no schema change. A bill ticked paid on Sep 3 correctly stays paid for the cycle that began Aug 15.

**Local, not UTC.** `currentYYYYMM()` uses `toISOString()`. `isoDay()` deliberately does not, with a comment explaining that UTC reports the previous day in PH before 08:00. Cycle boundaries follow `isoDay`: **local time**. Otherwise a bill paid at 00:30 on the 15th in Manila lands in the previous cycle. This is a deliberate change from the current UTC basis and supersedes the reasoning in the comment at `AppContext.tsx:303`.

**Clamping.** `startDay = 31` in a 30-day month clamps to the last day, mirroring `paydaysInMonth` (`AppContext.tsx:339-346`). Same for `dueDay`.

**Call sites replaced.** Four copies of `d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()` collapse to `cycleKeyOf(d, startDay) === currentKey`:

- `src/app/expenses/page.tsx:176` — category spend
- `src/components/AppContext.tsx:582, 589, 599` — month expenses, fees, received income
- `src/app/transactions/page.tsx:84` — activity feed grouping

Six `currentYYYYMM()` calls in `AppContext.tsx` (bill ticks, appliance resets, `resetBalances`) plus `BillsSheet.tsx:76` take the cycle key.

**Projection math** (`AppContext.tsx:604-660`): `daysInMonth` and `daysElapsed` become `daysInCycle` and `daysElapsedInCycle`, derived from `cycleRange`. The formulas are untouched; only the denominators are corrected.

**Paydays.** `paydaysInCycle` is a quiet correctness win. With `startDay = 15`, the cycle beginning Aug 15 contains both the Aug 15 and the Sep 1 payday — income and spending measured over the same window, which today they are not.

**Activity page.** The month stepper becomes a cycle stepper labelled by `cycleLabel`.

### 2. Switching the cycle: re-key on change

Setting `cycleStartDay = 15` on Aug 19 makes the current cycle Aug 15 – Sep 14. Expenses dated Aug 1–14 fall into the previous cycle (Jul 15 – Aug 14).

Category spend therefore re-buckets: Food drops to only what was logged from the 15th, with the earlier spending one step back on Activity. **Nothing is deleted.** Income re-buckets identically — the Aug 1 payday moves to the previous cycle alongside the Aug 1–14 spending — so both sides of the ledger move together and the projection stays coherent.

Two pieces of state are *stored* as month strings rather than derived, so switching would silently reinterpret them:

- **Bill ticks.** `paidMonths: ['2026-08']` was written meaning "August". After the switch `'2026-08'` means "Aug 15 – Sep 14". A bill paid on Aug 5 would read as already paid for a cycle it has not been paid for.
- **Appliance counters.** `lastResetMonth: '2026-08'` with minutes accrued since Aug 1 would carry into the Aug 15 cycle unreset, overstating it.

**Resolution — a one-time re-key when the setting changes.** `paidExpenseIds[month] → expenseId` already exists, and expenses carry a real date. For every tick, look up its expense, recompute `cycleKeyOf(expense.date, newStartDay)`, and rewrite `paidMonths` and `paidExpenseIds` under the corrected keys. Legacy ticks with no expense id stay where they are — there is no date to re-key them from, and inventing one would be worse than leaving them.

Appliance counters reset to zero against the new current cycle key. The meter is a forecast (§4) with no per-minute history, so there is nothing to re-bucket.

This ships as a **pure function** in the lib — `rekeyBillTicks(bills, expenses, newStartDay)` — not buried in `AppContext`. It is the riskiest code in the design and the easiest to test in isolation.

Rejected alternatives:

- **Effective-from date** (periods before the change keep calendar boundaries). Truthful about history, but `cycleKeyOf` stops being a pure function of `(date, startDay)` and becomes history-dependent, which is precisely the simplicity the rest of §1 rests on.
- **Stub period** (Aug 1–14 closes as a short partial cycle). Reads nicely, cycles are no longer uniform, and it carries the same history-dependence.

**Confirm step.** Changing the setting opens a confirmation naming the new period and warning that past totals re-bucket. It does not flip silently.

### 3. Bills gain a due date, a category, and a real amount

```ts
interface Bill {
  id: string; name: string; amount: number;
  dueDay: number | null;   // 1–31, clamped to the month's length. null = no due date
  category: Category;      // where the payment lands. Defaults to 'bills'
  paidMonths: string[];
  paidExpenseIds: Record<string, string>;
}
```

**The one schema change in this design:**

```sql
alter table bills add column due_day int;
alter table bills add column category text not null default 'bills';
```

Existing rows default cleanly — no due date, category `bills` — so nothing breaks before the fields are filled in. Run in the Supabase SQL editor; this project has no migration runner.

**Due dates resolve inside the cycle, not the calendar month.** With `startDay = 15` the cycle runs Aug 15 – Sep 14, so `dueDay = 15` resolves to Aug 15 (day one) and `dueDay = 5` resolves to Sep 5. Each day-of-month occurs exactly once per cycle, so this is unambiguous; clamping covers 31st-in-February.

`BillsSheet.tsx` gains:

- bills sorted by due date rather than insertion order
- a per-row status: `due in 3 days` · `due today` · `overdue by 2 days`
- the Bills tile (`expenses/page.tsx:275`) takes a `warn` tone when anything is overdue, instead of only counting unpaid

**The pay sheet gains an amount field.** `confirmPay` (`BillsSheet.tsx:36`) already collects a wallet; it now collects an amount too, pre-filled with the bill's stored figure. `markBillPaid(id, walletId, amount)` passes it to `addExpense` along with `bill.category`, replacing the hardcoded `'bills'` at `AppContext.tsx:1667`.

**Paying a different amount does not overwrite the estimate.** The stored `amount` remains the budgeting figure, changed deliberately in the bill edit sheet. A budget worth planning against should not lurch every time a bill does. The cost is that a variable estimate goes stale unless revisited; that is accepted.

`unmarkBillPaid` is unchanged — it deletes the expense it created, refunding the wallet for whatever amount was actually recorded.

### 4. Electric becomes a real category; the meter becomes a forecast

**`electric` moves into `BUILTIN_CATEGORIES`** in `src/lib/categories.ts`. It then appears everywhere every other category does: the Log Expense picker, `EditEntrySheet`, the budget grid. **This is what fixes the reported bug.**

The special cases die. `ELECTRIC_CATEGORY` and `BUDGETABLE_CATEGORIES` (`expenses/page.tsx:41-46`) are deleted, and so is the metered branch:

```ts
// expenses/page.tsx:186 — deleted
const spentFor = (key) => key === ELECTRIC_CATEGORY.key ? liveElectric : (spentByCategory[key] ?? 0);
```

Electric reads from logged expenses like everything else. The Electric bill, carrying `category: 'electric'`, is ticked paid for its real amount, lands in the Electric category card, on the app-wide cycle. All four reported problems close on that path.

`CategoryDetailSheet`'s `metered` prop and its "Electric is metered from your appliances" empty state (`CategoryDetailSheet.tsx:36, 151`) are removed.

**The meter keeps its machinery and changes its job.** Appliances, wattages, the rate field, the FAB's "Electric usage" action and `ElectricSection` all stay. What changes is the question they answer: not *how much have I spent* but *am I on track for a bigger bill than usual*. Wrong by 30% is useless as spend and acceptable as an early warning.

The ⚡ tile in the Budget page's top grid therefore stops presenting a bare peso total as spend and presents the estimate against the bill it predicts:

```
⚡ ELECTRIC
Est. ₱1,240
tracking under your ₱2,500 bill
```

It keeps opening the appliance sheet. The Electric **category card** in the categories grid shows real logged money against its budget, exactly like Food. Two tiles, answering visibly different questions, neither pretending to be the other — and `CategoryCard` stays free of bespoke rules.

`calcElectric()` and `electricBillEstimate` are unchanged; only their presentation moves. The Dashboard card at `page.tsx:259-266` currently labels an estimate "Electric Bill" and is relabelled to say estimate.

Appliance counters reset on the cycle key, so the meter's window matches the bill's.

## Testing

`cycle.ts` is pure, so it gets `src/lib/cycle.test.ts` following `walletDeltas.test.ts` (`node --test`, currently 8 passing).

- **`startDay = 1` is byte-identical to calendar-month behaviour** — the regression guard for anyone who never touches the setting
- `startDay = 15`: Aug 5 → `'2026-07'`, Aug 19 → `'2026-08'`, Sep 14 → `'2026-08'`, Sep 15 → `'2026-09'`
- boundary exactness at local midnight of the start day
- half-open ranges: every date belongs to exactly one cycle, never two, never zero
- clamping: `startDay = 31` in February; `dueDay = 31` in a 30-day cycle
- `dueDateInCycle`: `dueDay = 15` with `startDay = 15` lands on day one; `dueDay = 5` lands in the cycle's second calendar month
- `cycleLabel` formats in both the `startDay = 1` and `startDay ≠ 1` branches

`rekeyBillTicks` is unit-tested directly: ticks with expenses re-key by expense date, ticks without expense ids are left untouched, and re-keying is idempotent.

## Build order

Five steps, each independently shippable.

1. **`cycle.ts` + tests.** Nothing else touched; nothing observable changes.
2. **Swap every month call site to the cycle functions, with `cycleStartDay` hardcoded to 1.** Behaviour identical — the point of this step is that nothing visible changes. Load-bearing risk lands here, verifiable before any UI moves.
3. **Add the setting, the confirm sheet, and the re-key migration.**
4. **Bills:** schema, due date, category, editable amount on the pay sheet.
5. **Electric:** promote to a real category, delete the special cases, reframe the ⚡ tile. Closes the reported bug.

## Out of scope

- Per-bill cycles. One app-wide cycle was chosen deliberately over each bill running its own clock.
- Anchoring the cycle to payday or to a nominated bill. `cycleStartDay` is an explicit standalone setting so that editing a bill cannot silently reshape every figure in the app.
- A separate "billed but unpaid" state. Recording the amount and ticking paid stay one interaction.
- Auto-updating a bill's estimate to its last actual amount.
