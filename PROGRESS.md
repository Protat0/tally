# Tally — Progress Log

_Last updated: 2026-08-09_

A running log of what's been built and what's next, so we can pick up where we left off.

---

## ⚠️ Migration status — one outstanding

| Object | Table | Status |
| --- | --- | --- |
| `custom_categories` (jsonb, default `[]`) | `settings` | ✅ Applied |
| `category_budgets` (jsonb, default `{}`) | `settings` | ✅ Applied 2026-08-08 |
| `hidden_categories` (jsonb, default `[]`) | `settings` | ✅ Applied 2026-08-08 |
| `money_moves` (table + index + RLS policy) | — | ✅ Applied 2026-08-08 |
| `debt_people` + `debt_entries` (tables + indexes + RLS) | — | ⏳ **Run it** — SQL in `debtplan.md` Task 1 Step 1 |

**The Debt Board code is all merged but `/debts` cannot work until that migration
runs.** Without the tables, `loadAll` gets a 404 from PostgREST for both queries;
the page renders its empty state rather than crashing, but nothing can be saved.

---

## Done 2026-08-09 — Debt Board (all 7 tasks) — ⏳ manual verification pending

Plan: `debtplan.md` (repo root). All 7 tasks implemented and committed; each
verified with `npm run build` + `npm run lint` at the 2-error/6-warning baseline.
**The end-to-end manual checks in the plan have not been run** — they all need the
migration above. Run it, then walk `debtplan.md` Task 6 Step 3 for the full flow.

A `/debts` page tracking mutual mini-debts with friends and coworkers: who owes you,
who you owe, and what each debt was for.

**New files:**

| File | Role |
| --- | --- |
| `src/app/debts/page.tsx` | Route shell: grouping/sorting, sheet state, delete-person confirm. Also **exports the `PersonGroup` type** |
| `src/components/DebtSummary.tsx` | Top band — you're owed / you owe / net |
| `src/components/DebtPersonSection.tsx` | One person: header, net, Settle up, open items, settled disclosure |
| `src/components/DebtEntryRow.tsx` | One entry — direction arrow, note, date, amount, settle tick, delete |
| `src/components/AddDebtSheet.tsx` | Add an entry; pick an existing person or create one inline |

**Design decisions (settled — don't relitigate):**

- **Standalone ledger** — settling a debt never touches a wallet balance or writes a
  `money_move`. Mini-debts are usually cash that never went through a tracked wallet.
- **Netting is derived, never stored** — `netOf()` in `AppContext` sums
  `Σ(owed_to_me) − Σ(i_owe)` over **open** entries only.
- **`settled_at` is a nullable timestamp, not a boolean** — it doubles as history,
  so un-settling is just clearing it.
- **Per-item settle plus "Settle up"**, which clears a person's open entries in one
  write (`.eq('person_id', …).is('settled_at', null)`).
- **Deleting an entry does not confirm; deleting a person does** — the latter
  cascades their whole history via the FK.
- **Out of scope for v1:** splitting one bill across several people, reminders,
  sharing a board with the other person.

**Notes worth remembering:**

- **`addDebtPerson` is deliberately not optimistic.** It awaits the insert and
  returns the real row id, because `AddDebtSheet` immediately inserts an entry
  using it as a foreign key — a temp UUID would violate the FK. Every other debt
  mutation *is* optimistic.
- **The date input is stored at midday** (`T12:00:00` → ISO). In PH (UTC+8) a
  midnight timestamp would slide back a day when read as UTC.
- **`PersonGroup` is exported from `src/app/debts/page.tsx`** and imported by
  `DebtPersonSection` as a type-only import. Next 16's page-export validation
  accepts this — verified at build — and being type-only there's no runtime cycle.
- **Nav changed:** Debts joined the bar and **Settings dropped off the mobile bar**
  (five items fit comfortably; Settings is the rarest destination). The desktop
  sidebar still lists all six. `PageHeader` now renders a Settings cog *beside* its
  `right` slot, not as a fallback — all three non-Settings pages using it already
  pass one. `/expenses` has no header since the simplification, so its cog sits in
  the Log Expense row; `/expenses/new` is deliberately excluded as a form sub-page.
  The Dashboard already had a cog before this work.

---

## Done 2026-08-08 — Category card refinements

Follow-on polish after the simplification plan, driven by review of the live page.

- **Half-circle gauges replace the linear bars on category cards.** New
  `HalfCircleProgress.tsx` — a 180° SVG arc using `pathLength={100}`, so the
  dash maths is exact and stays correct if the arc geometry is ever changed.
  Same `paceColor` thresholds as before (green ≤80%, amber ≤100%, red over).
  The gauge is size-agnostic; the caller passes the width.
  **The hero keeps its linear bar**, as do both bars on the home page.
- **The gauge sits beside the icon/label/spent stack**, not under it, bottom-
  aligned. Cards got noticeably shorter. Sized `88px` / `104px` at `sm` /
  `120px` at `lg`, stepped because card width varies a lot across the grid.
- **The card is no longer one big edit button.** A pencil in the top-right
  corner opens the budget editor; pressing the card body opens the new detail
  sheet. The pencil is a **sibling** of the card button, not a child — buttons
  cannot nest, and as siblings no `stopPropagation` is needed.
- **New `CategoryDetailSheet.tsx`** — hero (icon, label, this month's spend,
  budget, gauge) above every expense ever logged in that category, newest first,
  grouped by month with per-month totals and an all-time count/sum. Electric
  explains it is metered rather than logged; other empty categories link to
  Log Expense.

Month grouping uses **local** date parts, not `date.slice(0, 7)` — in PH
(UTC+8) an expense logged late evening on the last of the month would otherwise
sort into the next month.

**Decision — delete stays out of the card grid.** Deleting a category remains
inside the edit sheet (reached via the pencil). Putting a delete button next to
the pencil would mean two sub-44px touch targets side by side on mobile, one of
them destructive. If it ever needs to be reachable from the grid, the preferred
option is an explicit "Edit" toggle on the Categories header that reveals delete
badges — opting in, rather than a permanent mis-tap risk.

---

## Done 2026-08-08 — Budget page simplification (all 9 tasks)

Plan: `docs/superpowers/plans/2026-08-08-budget-page-simplification.md`.
Spec: `docs/superpowers/specs/2026-08-08-budget-page-simplification-design.md`.

The Budget page's seven always-open sections are now a hero band, a five-tile
grid, and a category card grid. **`src/app/expenses/page.tsx`: 933 → 496 lines.**
Presentational only — `AppContext` and the database were not touched, and every
derived total (`totalAllocated`, `unallocated`, `allocatedPct`) is unchanged.

**New components** (all under `src/components/`):

| File | Role |
| --- | --- |
| `BottomSheet.tsx` | The app's one sheet chrome; tall sheets now scroll (`max-h-[85vh]`) |
| `BudgetTile.tsx` | Collapsed tile — renders a `<button>` or a `<Link>` |
| `BudgetHero.tsx` | Hero band + "Breakdown →" detail sheet |
| `BillsSheet.tsx` | Full recurring-bills management |
| `ElectricSheet.tsx` | Wraps `ElectricSection` in a sheet |
| `SavingsSheet.tsx` | Monthly savings target input |
| `CategoryCard.tsx` / `CategoryGrid.tsx` | Category cards + trailing "Add" card |

**Behaviour changes worth remembering:**

- **Shopee and Emergency Fund no longer have editors on the Budget page.** Their
  tiles link to `/shopee` and `/emergency-fund`, deleting ~270 lines that were
  duplicated from those routes. Their figures still feed `totalAllocated`.
- **Category delete moved** from a per-row trash icon into the Edit Budget sheet
  ("Delete category" for custom, "Remove category" for built-ins).
- **The restore strip for removed built-ins moved** into the Add Category sheet.
- **The electric ticker only runs while its sheet is open**; the page-level 10s
  tick keeps the tile's live figure current.
- The page `<header>` is gone — the hero carries the month label, and Log Expense
  sits above it.

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
- **Restore or drop budget lines / allocation breakdown** — data layer is still there if we want them back.
- **Editing / deleting activity rows** — `deleteMoneyMove` exists in `AppContext` and correctly reverses wallet balances, but nothing in the UI calls it yet. Same for expenses (`deleteExpense`). A swipe or long-press on a Transactions row would wire both up — and the rows in the new Category Detail sheet are now a second natural home for it.
- **Income sources are fixed** — Salary/Freelance/Gift/Refund/Other are hardcoded in `INCOME_SOURCES`. Make them user-editable if the list starts chafing.
- **Bills double-count in Allocated** — a budget on the built-in Bills category adds on top of Recurring Bills. Options: exclude the `bills` category from `totalCategoryBudgets`, or count whichever of the two is larger.
- **Two arc implementations** — `src/components/HalfCircleProgress.tsx` (category cards) and a local `ArcProgress` inside `src/app/emergency-fund/page.tsx` do much the same job. Worth consolidating onto the shared one next time either is touched.

---

## Known pre-existing issues (not introduced this session)

- `src/components/AppContext.tsx` has 2 ESLint **errors** in the `useEffect`/`loadAll` block (`react-hooks/set-state-in-effect` and "accessed before it is declared") plus an unused `_bl` warning. These predate this session's work; left untouched. Worth cleaning up separately.

---

## Handy commands

- Dev server: `npm run dev`
- Type-check: `npx tsc --noEmit`
- Lint a file: `npx eslint src/app/expenses/page.tsx`
