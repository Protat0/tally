# Tally — Progress Log

_Last updated: 2026-08-06_

A running log of what's been built and what's next, so we can pick up where we left off.

---

## ⚠️ Do this first next session

**Run the remaining DB migration.** The `category_budgets` column was never added — category budget amounts won't persist across reloads until it exists. In the Supabase SQL editor:

```sql
alter table settings
  add column if not exists category_budgets jsonb not null default '{}'::jsonb;
```

(You'll see "Success. No rows returned" — that's normal for `ALTER TABLE`.)

### Migration status
| Column | Table | Status |
| --- | --- | --- |
| `custom_categories` (jsonb, default `[]`) | `settings` | ✅ Applied |
| `category_budgets` (jsonb, default `{}`) | `settings` | ❌ **Not yet applied** |

---

## Done this session

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
- **"Earned" transactions** — the Transactions calendar/list only shows *spent* (expenses). There's no income/earned transaction record yet; wallet top-ups/transfers don't create transaction rows.
- **Restore or drop budget lines / allocation breakdown** — data layer is still there if we want them back.

---

## Known pre-existing issues (not introduced this session)

- `src/components/AppContext.tsx` has 2 ESLint **errors** in the `useEffect`/`loadAll` block (`react-hooks/set-state-in-effect` and "accessed before it is declared") plus an unused `_bl` warning. These predate this session's work; left untouched. Worth cleaning up separately.

---

## Handy commands

- Dev server: `npm run dev`
- Type-check: `npx tsc --noEmit`
- Lint a file: `npx eslint src/app/expenses/page.tsx`
