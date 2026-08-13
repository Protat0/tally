# Partial debt settlement

**Date:** 2026-08-13
**Status:** Approved, ready for planning

## Problem

The debt board settles all-or-nothing. A person's **Settle up** button clears every
open entry at once and moves the net through a wallet. Real repayment is rarely
that tidy — someone hands you half of what they owe, and the board has no way to
record it. Today the only workarounds are to leave the debt fully open (the
balance lies high) or settle it entirely (the balance lies low, and the wallet
gains money that never arrived).

## Scope

Partial payment applies to the **person-level Settle up** button only. The
per-row ✓ keeps its current behavior: it settles that one entry at its face
value. A person's net is the thing you pay down; an individual line item is not.

## Model: the payment row

A partial payment is an ordinary `debt_entries` row pointing the opposite way
from the net. No schema change.

Alice owes ₱500 across two entries (₱300 dinner, ₱200 taxi). She hands you ₱250.
We insert one `i_owe` row of ₱250. Both originals stay untouched.

```
Alice                    ₱250
                     owes you
[Settle up]

→  Dinner            +₱300
→  Taxi              +₱200
←  Alice paid you    -₱250   ✓ 🗑
```

`netOf` already derives a person's balance from their open entries, so the card
updates with no changes to the balance logic. The originals keep their true face
values permanently — the board can always answer "how much was dinner".

Nothing is marked settled by a partial payment. Entries settle only when the
user squares up in full, which keeps the settled-history batch model
(`settle_move_id`) exactly as it is.

**Direction.** Derived from the sign of the net, not chosen by the user:

| Net | Meaning | Payment row direction | Money |
|---|---|---|---|
| `> 0` | they owe you | `i_owe` | into your wallet |
| `< 0` | you owe them | `owed_to_me` | out of your wallet |

This falls out of the existing entry semantics. `addDebtEntry` already records
`i_owe` as `debt_in` (wallet balance up) and `owed_to_me` as `debt_out` (balance
down), which is precisely right for a payment received and a payment made.

**Undo** is the row's existing 🗑. `deleteDebtEntry` already reverses the row's
money move and restores the wallet balance. No new reversal path.

### Required change to `addDebtEntry`

The helper hardcodes its money-move note to `Spotted {name}` / `Borrowed from
{name}`. Those read wrong for a repayment in the transactions feed. Add an
optional `moveNote?: string` parameter; when absent the current strings are used,
so every existing caller is unaffected.

Payment notes, used for both the debt entry and its money move:

- receiving: `{name} paid you`
- paying: `Paid {name}`

They read correctly in the person's card and in the transactions feed, where the
person's name is otherwise absent. The note is not user-editable.

## Sheet behavior

`SettleUpSheet` gains an amount field prefilled to the full net, plus **Half**
and **Full** chips. Tapping straight through is identical to today's flow — pick
a wallet, confirm — so full settle-up does not cost extra taps.

| Amount entered | Confirm does | Button label | Helper text |
|---|---|---|---|
| `= net` | `settleUpPerson` — unchanged path, all entries settle | Mark settled | Clears everything with {name}. |
| `< net` | insert payment row, nothing settles | Record payment | ₱250 stays outstanding. |
| `> net` | insert payment row, net flips sign | Record payment | {name} will be owed ₱200 after this. |

The field holds an **absolute amount**, never a signed one. The sheet already
displays `Math.abs(net)` and states the direction in words; the user types how
much money changed hands, and the sign is the sheet's business.

**Comparison.** "Equals the net" means equal to `Math.abs(net)` after rounding
both to 2 decimals. A raw float comparison would send a ₱333.33 payment against a
₱333.33 net down the partial path and leave a phantom ₱0.00 balance open.

**Chips.** `Half` sets the amount to `Math.abs(net) / 2` rounded to 2 decimals;
`Full` resets to `Math.abs(net)`. Shown only when the net is non-zero. `Full` is
redundant on open but earns its place as a reset after editing.

**Overpayment is allowed.** ₱700 against a ₱500 net leaves the two originals
open plus a ₱700 payment row, netting to ₱200 in the other person's favor. The
card flips from "owes you" to "you owe". This is consistent with the model rather
than a special case — the user can hit Settle up again later to zero it out.

**Wallet** stays required whenever money moves, matching today's rule. Confirm is
disabled on an empty, zero, or non-numeric amount.

**Zero net is untouched.** When the entries cancel out exactly, no amount field
or chips render and the existing "these cancel out — nothing changes hands" copy
and wallet-free confirm stand.

**Per-row reuse.** `SettleUpSheet` also serves the per-row ✓. The amount field is
opt-in via a prop, so the row usage renders exactly as it does now.

## Summary tiles

`debtTotals` currently sums gross face values: `You're owed` adds every open
`owed_to_me`, `You owe` adds every open `i_owe`. After Alice's partial payment
those read ₱500 owed / ₱250 owe — both inflated, describing a position that does
not exist. (The `Net` tile is `owedToMe - iOwe` and stays correct either way.)

Change `debtTotals` to sum **per-person nets**: compute each person's net from
their open entries, then add positive nets to `totalOwedToMe` and the absolute
value of negative nets to `totalIOwe`. Alice contributes ₱250 to "You're owed"
and nothing to "You owe".

This also corrects a case that exists today, independent of this feature: a
person you both owe and are owed by currently inflates both tiles.

`DebtSummary` itself needs no change — it renders whatever the two numbers are.

## Files touched

| File | Change |
|---|---|
| `src/components/SettleUpSheet.tsx` | Amount field, Half/Full chips, mode-dependent copy and confirm, opt-in via prop |
| `src/components/DebtPersonSection.tsx` | Pass the new prop for the person-level sheet; route confirm to full settle or payment |
| `src/components/AppContext.tsx` | `moveNote` param on `addDebtEntry`; per-person-net `debtTotals` |

## Accepted limitations

- **✓ on a payment row.** A payment row is an open entry and shows the same ✓ and
  🗑 as any other. Pressing ✓ settles just that row and records a second wallet
  move, double-counting the money. This footgun applies equally to every row
  today, so it is not special-cased here. The 🗑 is the correct undo.
- **Overpayment leaves clutter.** A ₱700 payment against ₱500 leaves three open
  rows instead of collapsing to one. Honest and traceable, but not tidy. A later
  Settle up resolves it.

## Verification

The project has no test framework (`package.json` has `dev`, `build`, `start`,
`lint`). Verification is `npx tsc --noEmit`, `npm run lint`, and a manual pass on
the debts page covering:

1. Partial payment while they owe you — net drops, wallet gains, payment row appears
2. Partial payment while you owe them — net rises toward zero, wallet drops
3. Exact amount — behaves identically to today's Settle up, entries land in settled history as one batch
4. Overpayment — net flips sign, card label changes
5. Zero net — sheet renders the cancel-out copy, no amount field
6. Per-row ✓ — unchanged, no amount field
7. 🗑 on a payment row — wallet balance and net both return to their pre-payment values
8. Summary tiles agree with the sum of the person cards in every case above
