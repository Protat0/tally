# Budget Page Simplification — Design

**Date:** 2026-08-08
**Status:** Approved, not yet implemented
**Scope:** `src/app/expenses/page.tsx` and new components under `src/components/`

## Problem

The Budget page carries seven fully-expanded sections in a ~1000-line file:

| Column | Sections |
|---|---|
| Left | Budget Health · Recurring Bills · Shopee Pay Later · Savings Target · Emergency Fund |
| Right | Electric · Category Budgets |

Plus four bottom sheets (Confirm Delete Category, Edit Bill, Edit Category Budget, Add Category).

Two distinct problems:

1. **Everything is open and editable at all times.** On mobile the two-column grid stacks into one very long scroll; on desktop it reads as a wall of numbers and controls. Reported as equally bad on both.
2. **Shopee Pay Later and Emergency Fund are duplicated.** Full management UI lives here (~150 and ~117 lines respectively) *and* on the dedicated `/shopee` and `/emergency-fund` routes. Two places to change any behavior.

The page remains the user's single money hub. Nothing is being removed from the product — this is a density and layout change.

## Design

### Layout

Three bands, top to bottom.

**1. Hero — full width, always open.**

Month label, editable monthly income, Allocated / Unallocated, progress bar, and the `82% of ₱30,000` line.

Moved out of the hero into a hero detail sheet:
- the allocation breakdown chips (currently `allocationParts`)
- the "Received this month" block

Rationale: allocation is stated three times today (big number, progress bar, chips). The hero keeps the number and the bar; the chips become on-demand. "Received this month" is deliberately excluded from the allocation maths, so it is context rather than budget, and belongs behind the same tap.

**2. Tile grid — `grid-cols-2 md:grid-cols-3`.**

Five uniform tiles. Each shows a title, the single number the user came for, and a status line.

| Tile | Summary line | Status line | Tap target |
|---|---|---|---|
| Bills | `₱8,400/mo` | `2 of 5 unpaid` | Bills sheet |
| Electric | `₱842` | `1 running` / `no appliances running` | Electric sheet |
| Savings | `₱3,000/mo` | `not set` when zero | Savings sheet |
| Shopee | `₱1,200 due` | debt-free month, e.g. `Mar 2027` | navigate to `/shopee` |
| Emergency | `₱18,000 of ₱50,000` | `36%` | navigate to `/emergency-fund` |

Shopee and Emergency **navigate** rather than opening a sheet. Their full editors already exist as pages; delegating removes ~270 lines of duplicated UI from this page for zero lost capability. This is the "delegate" half of the chosen approach.

**3. Category cards — always visible, not collapsed.**

A responsive card grid replacing the current vertical row list. One card per category in `allCategories`, plus a trailing `+ Add` card that opens the existing Add Category sheet.

Card contents:
- icon in a rounded tile
- label
- spent amount (large)
- `spent / budget` and `₱X left` or `₱X over`
- mini progress bar, color by pace: green ≤ 80%, amber ≤ 100%, red above
- when no budget is set: `No budget set · ₱X spent this month`, no bar

Tap a card → existing Edit Category Budget sheet. Delete moves inside that sheet rather than sitting as a always-visible trash icon on every card.

The "Removed" restore strip (`hiddenBuiltIns`) moves inside the Add Category sheet as a "Restore removed" list, clearing it off the main page.

### Sheets

Tile sheets reuse the bottom-sheet pattern already used by Edit Bill and Add Category: `rounded-t-3xl` on mobile bottom, centered `md:rounded-3xl` on desktop, dimmed backdrop, drag handle, close on backdrop click.

| Sheet | Contents |
|---|---|
| Hero detail | allocation breakdown chips, Received this month |
| Bills | full bills list — paid toggle, edit, delete, add |
| Electric | existing `ElectricSection` verbatim |
| Savings | monthly savings target input |

### Components

`expenses/page.tsx` reduces to layout, state, and the derived budget totals. New files under `src/components/`, following the precedent set by `ElectricSection.tsx`:

```
BudgetHero.tsx       hero band + its detail sheet
BudgetTile.tsx       generic collapsed tile (title, value, status, onClick | href)
CategoryCard.tsx     one category card
CategoryGrid.tsx     card grid + Add card
BillsSheet.tsx       bills list, extracted from the current section
SavingsSheet.tsx     savings target input
ElectricSheet.tsx    thin wrapper around ElectricSection
```

Existing sheets (Confirm Delete Category, Edit Bill, Edit Category Budget, Add Category) stay where they are for now; only their trigger points move.

### Behavior notes

- **Electric ticker.** `ElectricSection` runs its own 10s interval. The page-level tick added alongside the electric budget row already keeps the tile's live figure current, so the sheet's interval only runs while the sheet is mounted.
- **No data model changes.** `updateSettings`, `Settings`, the `hiddenCategories` / `customCategories` / `categoryBudgets` logic, and all DB mapping are untouched. This is presentational only.
- **Derived totals unchanged.** `totalAllocated`, `unallocated`, `allocatedPct`, `spentFor`, `totalCategoryBudgets` keep their current definitions; they are only rendered in different places.

## Out of scope

- Any change to `/shopee`, `/emergency-fund`, or the Dashboard.
- Splitting the page into Plan/Spend tabs (considered and rejected — the user uses the page for both).
- Refactoring `AppContext.tsx`, including the pre-existing lint errors in its auth/load block.

## Success criteria

1. Budget page shows the hero, five tiles, and the category card grid, with no section other than the hero expanded on load.
2. Every capability available before is still reachable: bill add/edit/delete/paid-toggle, appliance management, electricity rate, savings target, category budget edit, category add/delete/restore, Shopee and Emergency Fund management.
3. `expenses/page.tsx` is materially smaller, with each extracted section in its own file.
4. `npm run build` passes and `npm run lint` introduces no new errors or warnings beyond those already present in `AppContext.tsx`, `auth/page.tsx`, and `app/page.tsx`.
