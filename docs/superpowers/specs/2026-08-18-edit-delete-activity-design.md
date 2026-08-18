# Editing and deleting logged activity

**Date:** 2026-08-18
**Status:** Approved, ready for planning

## Problem

Nothing logged in Tally can be corrected. `deleteExpense` and `deleteMoneyMove`
exist in `AppContext` (lines 783 and 897) and handle refunds and linked debt
rows properly, but **no UI calls either one** — the activity feed's rows are
plain `div`s. There is no update path of any kind: no `updateExpense`, no
`updateMoneyMove`, no `updateDebtEntry`. A mistyped amount is permanent.

This adds edit and delete to every row in the activity feed.

## Decisions

Seven decisions were settled during design. Do not re-open them.

1. **Editable fields: amount, wallet, category, note, date.** Not just the
   cosmetic ones. Amount and wallet edits move real balances, which is what
   makes the delta ledger below necessary.
2. **Split expenses get a full edit**, including the split itself. The linked
   `debt_entries` and their `money_moves` are rewritten on save.
3. **Every feed row is editable, debt rows included** — with one principled
   exception, the settle-up batch (see [Debt rows](#debt-rows)).
4. **Deleting a bill-created expense unticks that month on the bill.**
5. **Swipe a row to reveal edit and delete.** Hover/focus above `md`.
6. **`updated_at` lands now**, in the same migration trip.
7. **The current three-table schema stays.** A unified `transactions` table with
   derived balances was considered and deferred — see
   [The road not taken](#the-road-not-taken).

## Out of scope

Merging `expenses` / `money_moves` / `debt_entries` into one table, deriving
`wallets.balance` by summing the ledger, and a union view over the three tables
for the feed. None of the work below is wasted if those happen later: the delta
ledger is a prerequisite for derived balances either way.

## Relationship to the splits design

This builds directly on `2026-08-15-expense-funding-and-splits-design.md` and
does not revise its model. That spec's formula still holds:

```
typed amount = what the payer paid out, as it concerns me
expense      = typed − owed_to_me
debt         = owed_to_me    (payer = my wallet → they owe me)
             = typed         (payer = a person  → I owe them)
```

`expenseDeltas` below is that formula expressed as wallet arithmetic: the wallet
moves by `−(myShare + Σ owed_to_me)`, which is `−typed`. Nothing here changes
how a split is recorded; it only adds a way to record it *again* over the top of
an existing row.

## Migration — owned by the user, not by the implementation

Three nullable columns. **No default**, deliberately: `null` must mean "never
edited". A `default now()` would make every pre-existing row claim to have been
edited the moment the column lands.

```sql
alter table expenses     add column updated_at timestamptz;
alter table money_moves  add column updated_at timestamptz;
alter table debt_entries add column updated_at timestamptz;
```

`debt_entries` is included because a feed debt row edits an *entry*, not a move,
so that is where the timestamp has to live for the marker to be truthful.

`PROGRESS.md` tracks one outstanding migration (`settings.cash_wallet_id`).
These three are independent of it and can go in the same trip.

**The implementation must not run these.** It assumes they are applied.

## Architecture: one delta ledger

### The hazard this exists to remove

`recordMove` takes *absolute* new balances, so all six of its call sites write
the idiom `{ [id]: balanceOf(id) + n }`. `balanceOf` reads React state, which
does not update across an `await`. Any caller that records two movements
therefore computes both new balances from the same pre-await figure, and the
second write silently overwrites the first — losing the difference from a real
wallet balance.

The codebase currently works around this three separate ways: a comment-heavy
`running` variable threaded through `addExpense`, a `walletBalanceAfter`
parameter on `addDebtEntry` that exists for no other reason, and a
sum-the-deltas-before-computing rule inside `reverseMoves`.

**Editing an amount on the same wallet is a two-movement operation against one
wallet** — the exact shape that triggers this. It cannot be built on the current
primitive.

### The change

`recordMove` splits in two:

- `insertMove(move, date?): Promise<string | null>` — writes the row and the
  optimistic state, returns the id. Touches no balance.
- `commitDeltas(deltas: Record<string, number>)` — one computation and one write
  per wallet, `round2`-ed.
- `recordMove(move, deltas, date?)` becomes `insertMove` then `commitDeltas`,
  taking **deltas rather than absolute balances**.

`commitDeltas` is not new logic. `reverseMoves` already builds a delta map and
commits it; this is that back half lifted out and named. The six `recordMove`
call sites convert mechanically: `{ [id]: balanceOf(id) + n }` becomes
`{ [id]: n }`.

Callers that touch several rows — `addExpense`, `updateExpense`,
`deleteExpense`, `deleteDebtPerson` — build one map and commit once.

**`walletBalanceAfter` on `addDebtEntry` is deleted.** With a single
accumulation there is nothing to thread. The `running` variable in `addExpense`
goes with it. The money layer ends up smaller than it started.

### The pure module

`src/lib/walletDeltas.ts` — no React, no Supabase, no I/O:

- `mergeDeltas(...maps): Deltas` — sums, `round2`-ed
- `negate(d: Deltas): Deltas`
- `expenseDeltas({ walletId, myShare, owedToMe }): Deltas` — an expense's full
  wallet footprint: its own deduction plus each linked debt movement

This is where an arithmetic slip costs real money, so it is deliberately pure
and is the one thing under automated test.

## `updateExpense`

```ts
updateExpense(id, {
  amount, category, note, walletId, date,
  paidByPersonId, owedToMe,
}): Promise<boolean>
```

Refuses, returning `false`, in two cases:

- **Any linked debt entry carries a `settleMoveId`.** The same refusal
  `deleteExpense` already makes, for the same reason: a settle-up batch nets
  several rows into one amount that belongs to no single row, so a share of it
  cannot be handed back. The sheet tells the user to reverse the settle-up
  first, exactly as the debt board's own trash does.
- **The new share is `< 0` or `= 0`.** Negative is over-allocated — more owed
  back than was paid out. Zero is discussed below.

Otherwise, in order:

1. Build the old footprint via `expenseDeltas`.
2. Build the new footprint from the incoming values.
3. Delete the old linked `debt_entries` and their `money_moves` rows, in state
   and in the database.
4. Rewrite the expense row **in place — same id**, stamping `updated_at`. The id
   must survive because `bills.paidExpenseIds` points at it; a delete-and-
   recreate would strand the bill.
5. Insert the new debt entries and their moves, dated to the **new** expense
   date.
6. `commitDeltas(mergeDeltas(negate(old), next))` — **one call**. Editing an
   amount on one wallet nets to the difference instead of last-write-wins.

Steps 3–6 use `insertMove`, never `recordMove`, so no balance is committed until
step 6.

### Why a zero share is refused rather than dissolved

Under the splits model a zero share is legitimate — "I spotted John entirely"
writes no expense row at all, only debt. The model-consistent edit would
therefore *dissolve* the expense: delete the row, keep the debt entries.

This design refuses instead, and tells the user to delete the row and log the
debt directly. Dissolving means the row the user is editing vanishes from under
them while related rows they cannot see survive — surprising in a way that a
refusal with an explanation is not. The alternative is recorded here so the
choice is visible if it ever needs revisiting.

## Date propagation

A date edit is not local to the row.

- **Linked debt rows follow.** `addExpense` stamps linked entries and their moves
  with the expense's date. An edit rewrites `date` on both, or a split drifts
  away from its parent and lands on a different day in the feed.
- **Bill month keys are re-keyed.** `bills.paidMonths` is keyed `'YYYY-MM'`, with
  `paidExpenseIds` alongside it. If a bill-created expense's new date crosses a
  month boundary, both must move to the new key. Otherwise the bill claims
  August while its expense sits in July — and `unmarkBillPaid`, which always
  uses `currentYYYYMM()`, would delete the wrong row.

## Money moves

`earned`, `moved` and `withdrawn` get a full edit — amount, wallet(s), fee,
source, note, date — through the same reverse-and-reapply against
`commitDeltas`.

`withdrawn` keeps its existing two-shape handling: rows **with** a `toWalletId`
are net-zero, rows **without** predate the cash wallet and mean the money left.
An edit must preserve which shape a row is rather than normalising it, or past
months' spend totals move.

## Debt rows

A `debt_out` / `debt_in` move in the feed is always owned by a debt entry.
Resolve the owner at render:

- **Matches some entry's `moveId`** — a debt creation, one-to-one. Edit routes to
  that entry via a new `updateDebtEntry`; delete routes to the existing
  `deleteDebtEntry`.
- **Matches a `settleMoveId`** — a settlement. **No edit is offered.** The amount
  is a derived net that no single row owns, so there is no coherent per-row edit
  of it. The destructive action is "Reverse this settle-up", which is the
  existing `reverseSettleBatch` — it returns the money and reopens every row in
  the batch.

## Delete

`deleteExpense` keeps its current behaviour and gains one responsibility: if the
expense is some bill's `paidExpenseIds[month]`, that month is removed from both
`paidMonths` and `paidExpenseIds` in the same operation.

Without this the bill is stranded permanently paid — a later untick looks for an
expense that no longer exists, `deleteExpense` returns `false`, and
`unmarkBillPaid` silently does nothing, leaving that month unpayable forever.

A `false` return surfaces in the sheet as an explanation, never as a silent
no-op.

## UI

**`src/components/useSwipeActions.ts`** mirrors `useSwipeToClose`'s shape —
`{ handlers, style }`, the same 768px arming guard, no transition while the
finger is down. Drag left to reveal a fixed-width action rail; snap open or
closed past a threshold. The page owns the open row id, so only one row is ever
open.

Above `md` there is no swipe, so the rail reveals on hover and focus. Same
buttons, same handlers, keyboard reachable.

**`src/components/EditEntrySheet.tsx`** — a `BottomSheet`, pre-filled from the
row, embedding `SplitPanel` when the row is a split expense.

**Delete lives in the rail, not the sheet**, and confirms as a second tap on the
button. **No JS `confirm`** — a native dialog blocks the page and freezes the
browser tooling.

**`src/components/ActivityRow.tsx`** — the row markup extracted out of
`transactions/page.tsx`, which is already 350 lines and is about to gain gesture
state. The row renders a small "edited" tag beside the subtitle when `updatedAt`
is non-null.

## Files

| File | Change |
| --- | --- |
| `src/lib/walletDeltas.ts` | new, pure |
| `src/components/useSwipeActions.ts` | new |
| `src/components/EditEntrySheet.tsx` | new |
| `src/components/ActivityRow.tsx` | new, extracted |
| `src/components/AppContext.tsx` | `recordMove` split into `insertMove` + `commitDeltas`; `updateExpense` / `updateMoneyMove` / `updateDebtEntry` added; `walletBalanceAfter` and `running` removed; bill untick folded into `deleteExpense`; mappers carry `updatedAt` |
| `src/app/transactions/page.tsx` | rows become swipeable, sheet wired in |

## Verification

There is no test runner in this project. `package.json` has `dev`, `build`,
`start`, `lint` and no testing dependency, and `npm run lint` is red on a clean
tree, so it cannot be read as a regression signal.

- `npx tsc --noEmit` is the only trustworthy automated gate that exists today,
  and must be clean.
- `walletDeltas.ts` gets a minimal `node --test` suite — **zero new
  dependencies**. It is pure, and it is where arithmetic errors cost money.
- Everything else is manual verification against the running app.

Manual checks that must pass before this is called done:

1. Edit an expense's amount on the same wallet — the balance moves by the
   **difference**, not the full new amount.
2. Edit a split expense's amount — your share, every person's owed row, and each
   linked move all agree afterwards.
3. Edit a bill-created expense across a month boundary — the bill's tick follows
   it, and unticking afterwards removes the right expense.
4. Try to edit an expense whose split was settled through a wallet — refused,
   with an explanation.
5. Delete a bill-created expense — the bill becomes payable again.
6. Reverse a settle-up from the feed — the money returns and every row in the
   batch reopens.
7. Edit an income, a transfer, and a legacy `withdrawn` row with no
   `toWalletId` — the last one stays counted as spent.

## Risks

**The riskiest paths become user-reachable in an app with no test coverage.**
Decisions 2 and 3 together expose split rewriting and debt movement editing to
the UI. The mitigation is the pure, tested `walletDeltas.ts` plus the manual
checklist above. This was raised during design and accepted.

**Optimistic writes are not transactional.** A failure partway through
`updateExpense` can leave debt rows deleted and their replacements uninserted.
This exposure is pre-existing throughout the app — `addDebtEntry` documents the
same one and chooses the ordering that fails *visibly*. `updateExpense` follows
that principle: delete-then-insert leaves a missing split, which the feed shows,
rather than a doubled one, which it does not.

## The road not taken

Merging the three tables into one `transactions` table with a type discriminator
was considered on 2026-08-18. It was declined for now, and the reasoning is
worth keeping:

- It does **not** touch what makes this app complicated. `wallets.balance` is a
  stored scalar maintained by hand at every write site; that is the source of
  the hazard, and it is identical under any table shape.
- It costs ~18 columns of which a row uses seven or eight, loses per-type
  `not null` shape enforcement, and degrades `expense_id` / `move_id` from real
  foreign keys into untyped self-references.
- The migration's blast radius is the entire app, on live data with real money.

It **is** the right long-term direction, but as an *enabler* rather than a fix: a
single signed ledger table is what makes `balance = sum(amount)` feasible, and
that pairing is what would actually delete the hard code. Scope it as its own
project, together with derived balances — not as a step inside this feature.

A cheaper middle path exists if the feed specifically becomes the problem: a
database **view** unioning the three tables into the feed shape. Reads become one
paginable query — the feed currently loads every expense and every move into
memory and normalises them on every render — while writes stay on the typed
tables with their constraints intact.
