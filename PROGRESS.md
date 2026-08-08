# Tally — Progress Log

_Last updated: 2026-08-08_

A running log of what's been built and what's next, so we can pick up where we left off.

---

## ⚠️ Run this migration

Category deletion needs one more column. Until it exists, removing a built-in
category won't survive a reload.

```sql
alter table settings
  add column if not exists hidden_categories jsonb not null default '[]'::jsonb;
```

---

## ⚠️ Do this first next session

**Two migrations are outstanding.** Run both in the Supabase SQL editor. Until they exist, category budgets won't persist and every wallet Add/Withdraw/Transfer will fail to record.

**1. Category budgets column** (carried over from last session):

```sql
alter table settings
  add column if not exists category_budgets jsonb not null default '{}'::jsonb;
```

**2. Money moves table** (new — powers earned/withdrawn/transfer records):

```sql
create table if not exists money_moves (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  kind         text not null check (kind in ('earned', 'withdrawn', 'moved')),
  amount       numeric not null check (amount > 0),
  wallet_id    uuid not null references wallets(id) on delete cascade,
  to_wallet_id uuid references wallets(id) on delete cascade,
  source       text,
  note         text not null default '',
  date         timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  -- transfers need a destination; the other kinds must not have one
  constraint money_moves_destination check (
    (kind = 'moved' and to_wallet_id is not null) or
    (kind <> 'moved' and to_wallet_id is null)
  )
);

create index if not exists money_moves_user_date_idx
  on money_moves (user_id, date desc);

alter table money_moves enable row level security;

create policy "own money_moves" on money_moves
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

(You'll see "Success. No rows returned" — that's normal for DDL.)

### Migration status
| Object | Table | Status |
| --- | --- | --- |
| `custom_categories` (jsonb, default `[]`) | `settings` | ✅ Applied |
| `category_budgets` (jsonb, default `{}`) | `settings` | ❌ **Not yet applied** |
| `money_moves` (table + RLS policy) | — | ❌ **Not yet applied** |

---

## Done 2026-08-08 — Earned / income transactions

The wallet **Add / Withdraw / Transfer** buttons existed but silently mutated the
balance via `updateWallet`, leaving no record. They now write to `money_moves`.

- **New `money_moves` table** — one row per non-expense balance change.
  `earned` (money in, has a `source`), `withdrawn` (money out), `moved`
  (wallet→wallet, uses `to_wallet_id`).
- **`AppContext`** — `MoneyMove` type, `INCOME_SOURCES` constant,
  `addIncome` / `addWithdrawal` / `addTransfer` / `deleteMoneyMove`, and a
  `receivedThisMonth` computed value. All balance writes go through the shared
  `recordMove` helper so the row and the balance update persist together.
- **`WalletCard`** — Add now asks for a source (Salary 💼 / Freelance 💻 /
  Gift 🎁 / Refund ↩️ / Other ✦); all three sheets take an optional note;
  Confirm is disabled until the input is valid (transfer requires a target).
- **Transactions page** — expenses and money moves merge into one feed.
  Calendar cells show `+earned` (green) above `-spent` (red); month header shows
  both. Transfers appear in the list in neutral grey but are **excluded from
  both totals** — they're net-zero across your own wallets.
- **Budget page** — new "Received this month" row: actual vs. `of ₱Y expected`.
  Existing allocation maths is untouched and still runs off the manual
  Monthly Income figure.
- **Reset balances** now also clears this month's money moves, matching how it
  already cleared this month's expenses.

Design decisions taken: all three actions recorded (transfers neutral); actual
income kept **separate** from the manual Monthly Income setting rather than
replacing it; income sources are a fixed hardcoded list, not user-editable.

---

## Done 2026-08-08 — Category deletion

Every Category Budgets row now has a delete button, not just custom ones.

- **Custom categories** are removed outright, as before.
- **Built-in categories** can't be truly deleted — expenses already logged
  against them must keep resolving their icon/label — so they're added to
  `settings.hiddenCategories` (needs `hidden_categories` column) and filtered
  out of the Budget page, the Allocated total, and the Log Expense picker.
- **Restorable:** a "Removed" strip below Category Budgets lists hidden
  built-ins; tap one to bring it back. Without this, deletion is a one-way door.
- **Confirm dialog** on both paths, with copy that states what's kept —
  previously custom deletion fired instantly with no confirmation.
- Deleting either kind drops that category's budget, so Allocated updates.

Expenses logged under a removed category are never touched. They keep showing
correctly on the Activity page via the built-in icon map.

---

## Done 2026-08-08 — Allocation reflects category budgets

"Allocated" on the Budget page was summing `budgetLines` — the dead data layer
behind the UI removed last session — so setting a Category Budget moved nothing.

- `totalAllocated` = Bills + **Category Budgets** + Shopee + Savings target.
- Stale budgets for deleted custom categories are excluded; only categories that
  currently exist are counted.
- Added a compact breakdown row under the progress bar so Allocated isn't an
  unexplainable aggregate of four sources.
- `budgetLines` is no longer read on the Budget page. The data layer in
  `AppContext.tsx` is still intact.

⚠️ **Known overlap:** a budget on the built-in **Bills** category is counted
*in addition to* Recurring Bills, so Allocated can overstate if you use both.
Left as-is deliberately — see "Ideas / not yet done" for the alternatives.

---

## Done previous session

- **Fixed startup issue** — Supabase project `Tally-db` had auto-paused (free tier pauses after 7 days idle), causing `NetworkError` in the browser. Resolved by resuming from the dashboard.
- **Reset balances** (Settings → Reset) — carousel (one wallet card at a time, swipe + arrows + dots) to re-enter each wallet's current balance; also clears **this month's** expenses and zeroes electric usage (keeps appliances). Context fn: `resetBalances` in `AppContext.tsx`.
- **Monthly Income moved** from Settings → the Budget page (top of Budget Health card). Settings "Income" section renamed "General" (currency only).
- **Custom number stepper** — `src/components/NumberField.tsx` with ▲▼ arrows; native spinners hidden globally in `globals.css`. Used by Monthly Income + Emergency Fund target.
- **Editable recurring bills** — pencil button + edit sheet on each bill. Context fn: `updateBill` in `AppContext.tsx`.
- **Transactions page** (`/transactions`, nav label "Activity") — month calendar with per-day spend totals + tap-to-filter, and a per-day grouped transaction list below. Recent Transactions removed from the Budget page.
- **Category Budgets** (Budget page, right column) — per expense-category budget with progress bar + "X left"/"over". Budget is read-only with a pencil **edit** button (edit sheet).
- **Removed** the old "Budget Categories" (budget lines) and "Allocation Breakdown" sections from the Budget page, plus their now-unused code. NOTE: the budget-lines **data layer in `AppContext.tsx` is intact** (types, load/save, add/update/delete fns) — only the UI was removed, so it's easy to restore.
- **Custom categories** — "Add" button in Category Budgets opens a New Category sheet (icon + name + optional budget). Custom categories:
  - persist in `settings.customCategories` (needs `custom_categories` column ✅),
  - appear in the **Log Expense** category picker (so spending tracks),
  - render in Category Budgets with edit + **delete** (delete only on custom rows),
  - resolve icon/label on the Transactions page.
  - `Category` type broadened to `'food' | … | 'other' | (string & {})` to allow custom keys.

---

## Ideas / not yet done

- **Rename custom categories** — currently you can edit a custom category's *budget* and *delete* it, but not rename it or change its icon. (Add name/icon editing to the category edit flow.)
- **Budget page right column** still has empty space above Category Budgets (from the removed sections) — decide what, if anything, fills it.
- **Restore or drop budget lines / allocation breakdown** — data layer is still there if we want them back.
- **Editing / deleting activity rows** — `deleteMoneyMove` exists in `AppContext` and correctly reverses wallet balances, but nothing in the UI calls it yet. Same for expenses (`deleteExpense`). A swipe or long-press on a Transactions row would wire both up.
- **Income sources are fixed** — Salary/Freelance/Gift/Refund/Other are hardcoded in `INCOME_SOURCES`. Make them user-editable if the list starts chafing.
- **Bills double-count in Allocated** — a budget on the built-in Bills category adds on top of Recurring Bills. Options: exclude the `bills` category from `totalCategoryBudgets`, or count whichever of the two is larger.

---

## Known pre-existing issues (not introduced this session)

- `src/components/AppContext.tsx` has 2 ESLint **errors** in the `useEffect`/`loadAll` block (`react-hooks/set-state-in-effect` and "accessed before it is declared") plus an unused `_bl` warning. These predate this session's work; left untouched. Worth cleaning up separately.

---

## Handy commands

- Dev server: `npm run dev`
- Type-check: `npx tsc --noEmit`
- Lint a file: `npx eslint src/app/expenses/page.tsx`
