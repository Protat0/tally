# Projected Savings — realism over optimism

_2026-08-09_

## The problem

The dashboard's Projected Savings card was computed as:

```ts
projectedSpending = (totalExpensesThisMonth / daysElapsed) * daysInMonth;
projectedSavings  = settings.monthlyIncome - totalBills - projectedSpending;
```

and rendered as a bare hero number labelled "end-of-month estimate".

It is only accurate if the user records every expense and every peso of income.
Worse, **every way it can be wrong pushes the number up**:

| Error source | Direction |
| --- | --- |
| An expense never logged | ↑ savings |
| A day with no data counted as ₱0 spent | ↑ savings |
| Planned income assumed fully received | ↑ savings |
| A bill never entered in `settings.bills` | ↑ savings |
| Linear pace ignoring lumpy month-end costs | ↑ savings |

Nothing in the formula could make it come out pessimistic. That is a one-sided
error model, not a tuning problem, and it contradicts the app's purpose:
realistic budgeting.

### The cold-start case that exposed it

`daysElapsed` was treated as "days I have data for". Those diverge for anyone
who starts mid-month. Starting on Aug 9 with one day recorded:

```
projectedSpending = (₱500 / 9) × 31 = ₱1,722    ← shown
reality at that rate                = ₱15,500
```

Understated by exactly `daysElapsed ÷ daysObserved` = 9×, during the very month
a new user decides whether to trust the app. Every new user hits this once, and
the same maths misfires later for anyone who stops logging for a week.

### The income half never self-heals

Salary arriving automatically on the 1st and 15th will never be hand-recorded —
automatic is the point. So deriving income from recorded `earned` money-moves is
permanently broken for salaried users, not just at onboarding. But
`settings.paydayCycle` and `customPaydays` already encode the schedule, so
*when* money is due is derivable with no user input; only *whether it arrived*
needs a human.

## Design

### 1. Income — schedule-driven, never schedule-assumed

```
projectedIncome = receivedThisMonth            // real `earned` moves
                + futurePaydays × perPayday    // scheduled, not yet due
                + 0 × pastDueUnconfirmed       // EXCLUDED, and surfaced
```

`perPayday = monthlyIncome ÷ paydaysThisMonth`.

A payday that has come and gone unconfirmed is not counted: the money was due
and there is no evidence it landed. Future paydays *are* counted — dropping them
would be pessimistic rather than realistic.

`receivedThisMonth` already holds confirmed paydays (confirming writes a real
`earned` move), so `perPayday` is never added on top of it.

### 2. Spending — three segments, each priced honestly

```
budgetRate    = max(0, monthlyIncome − bills − savingsTarget) ÷ daysInMonth
blindSpend    = untrackedDays × budgetRate
observedRate  = totalExpensesThisMonth ÷ trackedDays
w             = min(trackedDays, 5) ÷ 5
rate          = w × observedRate + (1 − w) × budgetRate
assumed       = totalExpensesThisMonth + blindSpend + remainingDays × rate
```

- **Tracking start** is the earliest recorded expense. Deliberately derived, not
  stored — one less column and one less write path. If the oldest expense is
  deleted the window shifts, which is arguably the correct reading anyway.
- **Untracked days** are charged at the user's own budgeted rate rather than
  counted as zero. This is what kills the cold-start distortion.
- **The shrinkage weight `w`** is why one grocery run on day 2 no longer sets the
  pace for the month: with 1 tracked day the rate is 20% observed / 80% planned,
  reaching fully-observed by day 5. `RATE_RAMP_DAYS = 5`.

### 3. Two figures, conservative first

```
projectedSavings  = projectedIncome − bills − assumed
optimisticSavings = (projectedIncome + unconfirmedIncome) − bills
                  − (totalExpensesThisMonth + blindSpend)
```

The headline is `projectedSavings`, labelled "realistic — if your pace holds".
`optimisticSavings` (every payday lands, nothing more is spent) appears smaller
underneath as the stretch. Unconfirmed income is named in an amber, tappable
warning rather than silently folded in either direction.

The card also exposes its own working behind a "How is this worked out?"
toggle — a number this opinionated should show its arithmetic.

### 4. Payday confirmation

A pending payday opens `PaydaySheet`: amount (prefilled from `perPayday`,
editable — real pay varies), wallet (prefilled from the cashflow wallet), and
two answers.

- **Confirm** → writes an `earned` move via `addIncome` and logs
  `paydayLog[date] = 'received'`, so wallet balances stay true.
- **Dismiss** → `paydayLog[date] = 'dismissed'`. Covers both "it never came" and
  "I already logged it by hand", and stops the nagging.

Oldest unanswered payday is asked about first.

### 5. Cashflow wallet

`settings.cashflowWalletId` marks where salary lands, so the prompt is one tap
instead of a form. Settable in Settings → Payday Cycle, and also learned
implicitly the first time a payday is confirmed against a wallet. Cleared when
that wallet is deleted so the prompt can never prefill a dangling id.

### 6. Spending Pace, kept consistent

`spendingPacePercent` had the identical `daysElapsed` flaw. Its numerator now
includes `blindSpend`, so the two dashboard cards tell the same story instead of
contradicting each other.

## Worked example

₱30k income, ₱8k bills, ₱5k savings target, Aug 9, tracking started today, ₱500
logged, Aug 1 payday unconfirmed:

```
budgetRate    = (30,000 − 8,000 − 5,000) ÷ 31   = ₱548/day
blindSpend    = 8 × 548                          = ₱4,387
rate          = 0.2×500 + 0.8×548                = ₱538/day
assumed       = 500 + 4,387 + 22×538             = ₱16,731

projectedIncome   = 0 (Aug 1 unconfirmed) + 15,000 (Aug 15)
projectedSavings  = 15,000 − 8,000 − 16,731       = −₱9,731  ⚠

after confirming the Aug 1 payday:
                  = 30,000 − 8,000 − 16,731       = +₱5,269
```

The card is visibly wrong in a way only the user can fix, and one tap fixes it.
The old formula would have shown ≈₱20,000 and said nothing.

## Migration

```sql
alter table settings
  add column if not exists cashflow_wallet_id uuid references wallets(id) on delete set null,
  add column if not exists payday_log         jsonb not null default '{}'::jsonb;
```

Reads tolerate the columns being absent (`fromDBSettings` defaults to `null` and
`{}`), but writes fail until it is applied — `updateSettings` logs the rejection
to the console.

## Decisions deliberately not taken

- **No wallet reconciliation.** Comparing recorded balance against real balance
  would measure untracked spending directly, but needs a new habit from the
  user. `resetBalances` already covers the occasional correction.
- **No statistical confidence interval.** Variance of recorded daily spending is
  blind to unrecorded expenses — it would look most confident exactly when
  tracking is worst.
- **No backfill prompt.** Considered asking for a lump estimate of the untracked
  stretch; the budget rate gets close enough without adding an onboarding step.
