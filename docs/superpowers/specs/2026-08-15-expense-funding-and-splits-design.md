# Expense funding and splits

**Date:** 2026-08-15
**Status:** Approved, ready for planning

## Problem

Every expense in the app assumes two things that are not always true: that one of
your wallets paid for it, and that all of it was yours to consume. Real spending
breaks both. A friend covers your lunch. You pay for a table of three and get
paid back later.

Today the app has no way to say either, and the workaround it does offer is
recorded **wrong**. `AddDebtSheet.tsx:36` makes the wallet mandatory, so "John
paid for my lunch" books a `debt_in` of ₱300 into your GCash — but John handed
you lunch, not ₱300. Your wallet inflates by ₱300 and the ₱300 of food never
reaches your spending totals or your food budget.

It does net out once you repay him (`debt_out` −₱300), so the end state is
right. But in between the balance is wrong, and the consumption is invisible
forever. **Money a friend fronts for you never appears as spending.** This is a
correctness fix, not only a convenience one.

## Model: funding is separate from consumption

Every expense answers two independent questions the app currently conflates:

1. **Who paid the vendor?** — one of my wallets, or another person.
2. **Whose consumption was it?** — mine, someone else's, or split.

Separating them collapses the problem further than expected. **When another
person pays, the total is irrelevant.** If John pays ₱1,000 for a table and your
share is ₱300, you do not track John's finances — the other ₱700 is his own
consumption and none of your business. You log ₱300, you owe ₱300. There is no
"split" concept in that mode at all.

So one formula covers every case:

```
typed amount = what the payer paid out, as it concerns me
expense      = typed − owed_to_me
debt         = owed_to_me    (payer = my wallet → they owe me)
             = typed         (payer = a person  → I owe them)
```

| Situation | Payer | Typed | Expense | Debt | Wallet |
|---|---|---|---|---|---|
| Normal expense | GCash | 1,000 | 1,000 | — | −1,000 |
| John paid my lunch | John | 300 | 300 | I owe 300 | — |
| Shared meal, I paid | GCash | 1,500 | 500 | John 500, Mia 500 | −1,500 |
| John paid, my share only | John | 300 | 300 | I owe 300 | — |
| I spotted John entirely | GCash | 500 | none | John owes 500 | −500 |

## Why this needs no new movement logic

The debt rows carry their own wallet movements, which `addDebtEntry` already
books. Working the ₱1,500 dinner through:

| Record | Amount | Wallet effect | Counts as spent? |
|---|---|---|---|
| Expense (Food, my share) | 500 | GCash −500 | yes |
| Debt row: John owes me | 500 | GCash −500 (`debt_out`) | no |
| Debt row: Mia owes me | 500 | GCash −500 (`debt_out`) | no |
| **Total** | | **−1,500** | **500** |

₱1,500 left GCash, which is what really happened, and only your ₱500 reaches the
food budget. Those `debt_out` moves are exactly what `addDebtEntry` books when
passed a `walletId` (`AppContext.tsx:823-834`), untouched. The "John paid my
lunch" direction is the same call with `walletId: null`, which the existing
`if (walletId)` branch already handles by booking no movement.

Three properties fall out rather than needing code:

- **Wallet-less expenses count as spending for free.** `monthSpent` filters on
  date only (`AppContext.tsx:475`), so it and the category budgets pick up an
  expense with no wallet with no changes.
- **No double-count on repayment.** Paying John back books `debt_out`, which
  `MoneyMoveKind` already excludes from spent totals (the comment at line 32).
  The lunch counts as spending once, at the meal; the cash leaves once, at
  repayment. **That existing exclusion is what makes this design safe — do not
  "fix" debt moves into spending.**
- **The reads barely move.** `expense.walletId` is read in only two display
  spots, `transactions/page.tsx:75` and `CategoryDetailSheet.tsx:174`, both
  `walletName(e.walletId)`.

## Schema

Two changes. **Both were applied on 2026-08-15** and reported clean.

```sql
alter table expenses      alter column wallet_id drop not null;
alter table debt_entries  add column expense_id uuid references expenses(id) on delete set null;
```

`expenses.wallet_id` null means another person paid, so no wallet of yours moved.
`debt_entries.expense_id` is the N side of a 1:N link — one expense, many debt
rows.

`on delete set null`, deliberately **not** cascade. Cascade would silently
destroy debt rows — money someone actually owes you — and would bypass the
batch-settled refusal in the rules below. The app deletes linked rows
explicitly; the FK is a safety net, not the mechanism.

## UI: a Split chip that opens a sub-sheet

The expense modal is the entry point, not the debt sheet, because logging an
expense is the most-used screen in the app. The wallet strip already asks the
right question — *what funded this?* — and "John" is simply another answer to it.

**The split UI does not exist until asked for.** A chip joins the existing
"Pay from" strip (`expenses/new/page.tsx:94`); tapping it opens a bottom sheet
over the modal, leaving the form underneath untouched.

```
Amount            ₱1,500

Pay from
[💳 GCash] [🏦 BPI] [🤝 Split]        ← one new chip

Category
[🍜] [🚗] [💡]

        ┌─ Who's in on this? ──────────┐
        │  🧑 John              [ 500 ] │
        │  👩 Mia               [ 500 ] │
        │  + person  ·  split evenly    │
        │  ─────────────────────────    │
        │  Your share            ₱500   │
        │            [ Done ]           │
        └───────────────────────────────┘
```

This was chosen over an always-visible inline panel and over replacing the wallet
strip with a general "funded by" ledger. Both alternatives can express the same
cases; they just make **every** ordinary expense pay for a feature used by a
minority of them. A plain grocery entry sees one extra chip and nothing else.

The sheet also covers the "someone else paid" direction: choosing a person as the
payer means no wallet is selected and your share is the whole typed amount.

**Split evenly** divides the typed total by headcount including you, assigning
remainder cents so the parts always sum exactly to the total.

## Lifecycle rules

**Settling a debt never touches the expense.** John pays you back ₱500 → the
receivable clears, the ₱500 food expense stands. You ate the dinner; the
consumption is permanent. This matches the principle already in the code — "the
originals keep their face values" (`AppContext.tsx:848`).

**Deleting the expense deletes its linked debt rows**, since they exist only
because of it — but it **refuses when any linked row is batch-settled**, routing
to the existing "Reopen this settle-up?" prompt. This is what `deleteDebtEntry`
already does (`AppContext.tsx:884`) and what commit `f44fd5a` established as the
pattern: never refuse in silence, send the person to the step they must do first.

**Deleting one linked debt row leaves the expense amount alone.** Forgiving
John's ₱500 does not retroactively make your dinner cost ₱1,000.

This last one is a judgment call, recorded so it is not relitigated as a bug. The
argument against is real: if you forgive the debt, you did in fact spend ₱1,000
of your own money. It is rejected because reclassifying silently rewrites a past
month's spending totals, budgets and pace — possibly a month already reviewed.
Predictability beats theoretical accuracy here.

**A zero share creates no expense row.** Spotting John entirely means your share
is ₱0; book the debt rows only, rather than a ₱0 expense cluttering the feed and
category totals.

## The dangerous part

Deleting a split expense must reverse the expense's own wallet credit **and** N
`debt_out` moves. These use two different mechanisms today: `deleteExpense`
patches the wallet directly (`AppContext.tsx:641`), while debt moves go through
`reverseMoves`.

`PROGRESS.md` already carries the hard-won warning — `reverseMoves` takes an
array and accumulates deltas per wallet *before* computing any balance, because
`balanceOf` reads React state that does not update between loop iterations.
Reversing one at a time computes every new balance from the same stale figure and
the last write wins.

**All of it must resolve to one balance computation per wallet.** This is the
single most likely way to silently corrupt a balance, and it gets explicit
verification steps in the implementation plan.

## Boundary with the debt sheet

Both entry points stay, with a clear division:

- **The expense modal** owns spending that creates debt.
- **The debt sheet** owns pure cash debts — "John lent me ₱5,000" — which are not
  expenses at all.

While there, `AddDebtSheet`'s wallet becomes optional again. The data model
always supported it (`wallet_id` is nullable, `addDebtEntry` takes
`walletId?: string | null` with a real `if (walletId)` branch); only the UI
closed it off. A pre-existing debt is an opening balance, not a movement — the
money already hit your wallets in the past, outside the app, so booking a
movement today double-counts it.

## Out of scope

**Backdating.** `addExpense` hardcodes `date: now` (`AppContext.tsx:614`) and its
signature is `Omit<Expense, 'id' | 'date'>`, so the UI cannot pass a date even if
it wanted to. "John paid for my lunch last week" still lands today. This is a
separate fix with its own question attached — whether backdated expenses should
retroactively affect past months' budgets and pace — and it is deliberately not
bundled here.

**Reclassifying a forgiven debt as consumption.** See the lifecycle rules above.

**Splitting a debt across wallets.** One expense draws from one wallet.

## Verification

There is no test framework and none is to be added. Every task verifies with
`npx tsc --noEmit`, `npm run lint`, and a scripted manual pass.

`npm run lint` is **not clean on this repo and that is not this feature's to
fix.** The baseline is `✖ 8 problems (2 errors, 6 warnings)`, all in
`AppContext.tsx`'s data-loading `useEffect`/`loadAll` block. The bar is **no new
problems** — the count must still read 8. Do not fix the pre-existing two.
