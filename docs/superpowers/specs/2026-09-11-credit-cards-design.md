# Credit Cards — Design

**Date:** 2026-09-11
**Status:** Approved in brainstorming, awaiting spec review

## Goal

Let a user hold credit cards in Tally, pay for expenses with them, see each
statement's balance, minimum and due date, and track how much of each card's
limit is used.

### In scope

1. Paying expenses with a card.
2. Statements: closing date, due date, balance, minimum due, and the interest
   and fees a card charges when it is not paid in full or on time.
3. Credit limit tracking: used and available credit.

### Out of scope

- Card instalment plans. The Instalments page stays as it is.
- Cash advances, foreign transaction fees, rewards and points.
- Matching any specific bank's interest method. Interest is an estimate from
  the rules below, and is labelled as one.
- Push notifications. Reminders are in-app only.

## Decisions

| Question | Decision |
|---|---|
| When does a card purchase count against the budget? | When you swipe. Paying the card later is moving your own money, not spending again. |
| Where do statement figures come from? | Calculated from the card's terms, entered when the card is added, plus its purchases and payments. |
| Which terms are asked for? | Required: credit limit, statement day, due day, monthly interest rate, minimum payment rule, amount owed when added. Optional: late fee, annual fee (with its month). |
| How does card debt relate to total balance? | Total balance stays the money in wallets. What is owed on cards is shown as its own line beside it. |
| How is a card stored? | As its own record (approach A), not as a kind of wallet. Wallets and everything that reads them are untouched. |
| What does deleting a card do? | Archives it. Its purchases and payments are real history and stay. |

## Data

A migration the user runs in the Supabase SQL editor before the code lands.

### `credit_cards` (new)

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, primary key | |
| `user_id` | uuid, not null | Owner. Row level security on, owner-only policies like the other tables. |
| `name` | text, not null | |
| `icon` | text, not null | A logo (`logo:bpi`) or drawn icon key, as wallets store. |
| `credit_limit` | numeric, not null | > 0 |
| `statement_day` | int, not null | 1–31 |
| `due_day` | int, not null | 1–31 |
| `monthly_interest_rate` | numeric, not null | Percent per month, 0–100 |
| `min_payment_percent` | numeric, not null | Percent of the statement balance, 0–100 |
| `min_payment_floor` | numeric, not null | Pesos, ≥ 0 |
| `late_fee` | numeric, null | Pesos, ≥ 0. Null means none. |
| `annual_fee` | numeric, null | Pesos, ≥ 0. Null means none. |
| `annual_fee_month` | int, null | 1–12. Required when `annual_fee` is set. |
| `opening_balance` | numeric, not null, default 0 | Owed on the day the card was added. |
| `created_at` | timestamptz, not null, default now() | |
| `archived_at` | timestamptz, null | Set instead of deleting. |

### `expenses.card_id` (new column)

`uuid null references credit_cards(id)`. A card purchase has `card_id` set and
`wallet_id` null. A check constraint forbids both being set. With `wallet_id`
null, no wallet balance moves — the path "someone else paid" already takes;
`card_id` tells the two apart.

### `money_moves.card_id` and the `card_payment` kind

`money_moves` gains `card_id uuid null references credit_cards(id)`, and its
kind check gains `card_payment`. A card payment has `wallet_id` set to the
wallet paid from and `card_id` set to the card. It takes the amount out of the
wallet and, like fund and debt movements, is neither spending nor income.

Cards are never deleted, only archived, so these references never dangle.

### Nothing else is stored

Statements, due dates, minimum due, interest, fees, what is owed and available
credit are all calculated. Editing a card's terms therefore recalculates its
past statements as well; terms rarely change, and this keeps a single source of
truth.

## Calculation: `src/lib/creditCard.ts`

Pure: no React, no Supabase. All dates are local calendar days, as budget cycles
are. All money is rounded to the centavo. Rates stored as percents are divided
by 100 where they are applied.

### Inputs

- The card's terms, `opening_balance`, and the day it was added.
- Purchases: `{ date, amount }`. A purchase's amount is what was charged to the
  card: the expense's own amount plus the owed-to-me debt rows linked to it,
  exactly as a wallet-funded split takes the whole amount out of the wallet.
- Payments: `{ date, amount }` from the card's `card_payment` movements.
- Today.

### Statement dates

- A statement closes on `statement_day` each month. A day past the end of a
  month becomes that month's last day, as bill due days do.
- A statement is due on the first `due_day` (clamped the same way) strictly
  after it closes. Around short months this can land after the next statement
  closes; the rules below allow for that.
- A statement's period runs from the day after the previous close up to and
  including its own close.

### The opening statement

The first statement is the latest close on or before the day the card was
added. Its balance is `opening_balance`, it has no purchases or charges of its
own, and it is due on its due date like any other. Purchases and payments dated
before the day the card was added are refused (see Edge cases), because
`opening_balance` already reflects them.

### Each later statement

```
balance = previous balance
        − payments dated in this period
        + purchases dated in this period
        + charges posted on this statement
```

A negative balance is a credit that carries forward.

**Paid by due** for a statement: payments dated after it closes, up to and
including its due date.

**Charges.** Once a statement's due date has passed, its charges post on the
first statement that closes on or after that due date:

- **Interest:** (`monthly_interest_rate` ÷ 100) × (its balance − paid by due),
  when that is above zero. Paying in full means no interest.
- **Late fee:** when `late_fee` is set, its minimum due was above zero, and paid
  by due is below it.

Separately, the **annual fee** posts on each statement that closes in
`annual_fee_month`, when `annual_fee` is set — never on the opening statement.

**Minimum due:** the larger of (`min_payment_percent` ÷ 100) × balance and
`min_payment_floor`, never more than the balance, and 0 when the balance is 0 or
less.

### Derived figures

- **Owed now:** the last closed statement's balance, minus payments since it
  closed, plus purchases since it closed. Interest or fees not yet posted are
  not included until their statement closes.
- **Available credit:** limit − owed now, never below 0.
- **Owed on cards:** the sum of owed now over active cards, counting only cards
  that owe (a credit on one card does not reduce another's debt).
- **Charges in a budget cycle:** the charges of every statement that closes
  inside that cycle.
- **Due reminder:** for the last closed statement, unpaid = balance − payments
  since it closed. When unpaid is above zero and today is on or after 7 days
  before its due date, the card has a reminder: the unpaid amount, the due date,
  the minimum still to pay (minimum due − payments since close, not below 0),
  and whether today is past the due date (overdue).

## Budget

- Card purchases are expenses, so they count on the day bought, as today.
- Interest and fees are money gone. They count as spending in the budget cycle
  their statement closes in, alongside bank fees in `totalSpentThisMonth`. They
  have no category, as bank fees have none.
- Card payments are not spending. Total balance is unchanged by cards.
- A new computed value, owed on cards, is shown beside total balance.

## App state: `AppContext`

- Loads `credit_cards` (archived included, so history can name them).
- `addCreditCard`, `updateCreditCard`, `archiveCreditCard`.
- `payCreditCard(cardId, amount, walletId)` records a `card_payment` movement
  dated now and takes the amount out of the wallet.
- `addExpense` and `updateExpense` accept `cardId`. The split rule changes from
  "keep owed-to-me rows only when there is a wallet" to "when there is a wallet
  or a card".
- `moveDeltas` handles `card_payment` (the wallet loses the amount), so deleting
  a payment through `deleteMoneyMove` puts the money back.
- `updateMoneyMove` refuses `card_payment`: a payment is deleted and made again.
- `resetAccount` deletes `credit_cards` after expenses and money movements,
  alongside wallets.

## Screens

### Adding a card

The Add Wallet sheet gets a **Wallet / Credit card** switch at the top. The
card form has:

- Quick pick: the Banks and Digital banks preset groups, with logos. E-wallets
  are left out.
- Name, credit limit, owed right now, statement day, due day, monthly interest
  %, minimum payment % and ₱ floor.
- **Optional fees**, folded away: late fee; annual fee and its month.

The same form edits a card.

### Wallets page

- A line under the total balance: "₱8,400 owed on 2 cards", when anything is
  owed.
- A **Credit cards** section below the wallets. Each card shows its logo, name,
  owed now, and a bar of limit used — amber from 80% used, red when over the
  limit — then "₱5,200 due Sep 25 · min ₱500", "Paid" when the last statement
  is paid in full, or "No statement due" when its balance was zero or less.
- Tapping a card opens its details: unbilled so far, the last statement
  (balance, due date, minimum, paid so far, charges — interest labelled as an
  estimate), recent purchases and payments, and **Pay**, **Edit**, **Delete**.

### Paying a card

A sheet with amount shortcuts — statement balance, minimum, everything owed, or
another amount — and a required "Pay from" wallet. Paying more than is owed is
allowed.

### Logging and editing expenses

- "Pay from" lists wallets, then cards; a card shows its available credit.
- A purchase above a card's available credit shows an amber warning but still
  saves.
- "Someone paid" clears the card, as it clears the wallet today.
- The edit sheet offers the same wallets-then-cards choice.

### Dashboard

- The balance card gains the owed-on-cards line under "across N wallets".
- Below the balance card, a strip per card with a reminder: "BPI · ₱5,200 due
  in 4 days · min ₱500", amber, or red and "overdue" once past the due date.
  Tapping it opens the pay sheet.

### Activity

- Purchases show like other expenses, naming the card where a wallet would be.
- Payments show as "Card payment", flow moved, deletable, not editable.
- Interest and fees show as rows on their statement's close date, flow spent,
  so Activity's spending total matches the dashboard. They are calculated, so
  they can be neither edited nor deleted.

## Edge cases

- **Deleting a card** archives it. An archived card leaves pickers, the cards
  list, reminders and owed on cards; its history still shows its name. If it
  still owes, the confirmation says how much.
- **Purchases dated before the day the card was added** are refused with a
  message: what was owed when the card was added already covers them.
- **Deleting or editing a purchase** moves no wallet; statements recalculate.
  Moving a purchase between a wallet and a card refunds or charges the wallet
  through the existing funding-edit path.
- **Deleting a payment** puts the money back in its wallet.
- **Statement or due days 29–31** clamp to shorter months' last day.
- **Reset balances** deletes the cycle's expenses and money movements by date,
  so it removes that cycle's card purchases and payments too, and each card's
  owed amount recalculates. Cards and their terms are untouched.
- **Reset account** deletes cards along with everything else.

## Testing

Test first, in `src/lib`:

- `creditCard.ts`
  - Statement close and due dates, including day 31, February, and due days in
    the following month.
  - A due date that lands after the next close: its charges post on the first
    statement closing on or after it.
  - A purchase on the closing day belongs to that statement; the day after, to
    the next.
  - Balances roll forward; overpayment leaves a credit; available credit never
    goes below 0; the opening balance acts as the first statement.
  - No interest when paid in full by the due date; interest on the unpaid part
    otherwise.
  - Late fee only below the minimum and only when set; annual fee only in its
    month and never on the opening statement.
  - Minimum due: percent against floor, capped at the balance, 0 when nothing
    is owed.
  - Charges fall in the budget cycle their statement closes in.
  - Due reminders: from 7 days before, overdue, and none once paid.
- `walletDeltas.ts`: a card payment takes money out of its wallet and reverses
  cleanly; an expense on a card moves no wallet.

Then the full suite, type check, lint against the existing count, build, and a
manual pass after the migration: add a card, buy with it, split a purchase,
pay it, see the reminder and Activity rows, edit and archive it.
