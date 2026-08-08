# Budget Page Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Collapse the Budget page's seven always-open sections into a hero band, a uniform tile grid whose tiles open bottom sheets, and a category card grid.

**Architecture:** Presentational refactor only. `src/app/expenses/page.tsx` (~1000 lines) keeps its state and derived totals but delegates rendering to focused components under `src/components/`. Two sections (Shopee, Emergency Fund) stop rendering inline and link to their existing dedicated routes instead. No data model, `AppContext`, or database changes.

**Tech Stack:** Next.js 16.2.4 (Turbopack, App Router), React, TypeScript, Tailwind CSS, Supabase.

**Spec:** `docs/superpowers/specs/2026-08-08-budget-page-simplification-design.md`

## Global Constraints

- **No test framework exists.** `package.json` defines only `build` (`next build`) and `lint` (`eslint`). Every task verifies with `npm run build`, `npm run lint`, and a named manual check in the dev server. Do not add a test framework — it is out of scope.
- **Lint baseline.** `npm run lint` currently reports **2 errors and 6 warnings**, all pre-existing: 2 errors + 2 warnings in `src/components/AppContext.tsx` (auth/load block), 2 warnings in `src/app/auth/page.tsx`, 2 warnings in `src/app/page.tsx`. A task passes if it introduces nothing beyond this baseline. Do not fix the baseline issues — out of scope.
- **This is NOT the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches framework APIs. This plan touches only client components and `next/link`, both already used throughout the page.
- **All new components are client components** — start every new file with `'use client';`.
- **Preserve the existing dark palette exactly:** surface `bg-[#111827]`, border `border-[#1e2d40]`, hover surface `bg-[#141d2e]`, accent `blue-600`/`blue-400`.
- **Commits are deferred.** The user has asked to commit the whole branch at the end. Treat the commit step in each task as an optional checkpoint; if skipping, leave changes in the working tree and continue.
- **Uncommitted baseline.** The branch already carries uncommitted work (the `ElectricSection` extraction, the `/electric` route removal, and the `settings` error-surfacing fix). Do not revert or restage it.

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/components/BottomSheet.tsx` | The app's one sheet chrome — backdrop, mobile/desktop anchoring, drag handle |
| `src/components/BudgetTile.tsx` | Generic collapsed tile; renders a `<button>` or a `<Link>` |
| `src/components/CategoryCard.tsx` | One category card — icon, label, spent, budget, progress bar |
| `src/components/CategoryGrid.tsx` | Card grid + trailing "Add" card |
| `src/components/BudgetHero.tsx` | Hero band + its detail sheet (allocation chips, Received this month) |
| `src/components/BillsSheet.tsx` | Full recurring-bills list: paid toggle, edit, delete, add |
| `src/components/SavingsSheet.tsx` | Monthly savings target input |
| `src/components/ElectricSheet.tsx` | Thin wrapper putting `ElectricSection` in a `BottomSheet` |

**Modify:**

- `src/app/expenses/page.tsx` — reduces to state, derived totals, and layout.

**Unchanged:** `src/components/AppContext.tsx`, `src/components/ElectricSection.tsx`, `src/app/shopee/page.tsx`, `src/app/emergency-fund/page.tsx`, `src/components/ProgressBar.tsx`.

---

### Task 1: `BottomSheet` primitive

Extract the sheet chrome duplicated across the page's three existing sheets. Pure refactor — no visual change except that tall sheets now scroll instead of overflowing.

**Files:**
- Create: `src/components/BottomSheet.tsx`
- Modify: `src/app/expenses/page.tsx` (Edit Bill sheet ~941-970, Edit Category Budget sheet ~972-992, Add Category sheet ~994-end)

**Interfaces:**
- Produces: `BottomSheet({ onClose, children }: { onClose: () => void; children: React.ReactNode })` — default export.

- [x] **Step 1: Create the component**

```tsx
'use client';

interface Props {
  onClose: () => void;
  children: React.ReactNode;
}

// The app's one sheet chrome: bottom-anchored on mobile, centered on desktop.
// Backdrop click closes; clicks inside do not bubble out to it.
export default function BottomSheet({ onClose, children }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end md:items-center justify-center"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-[430px] md:max-w-md md:rounded-3xl rounded-t-3xl bg-[#111827] border border-[#1e2d40] p-6 pb-8 md:pb-6 max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-white/20 md:hidden" />
        {children}
      </div>
    </div>
  );
}
```

`max-h-[85vh] overflow-y-auto` is new — later tasks put long lists (bills, appliances) in sheets.

- [x] **Step 2: Import it in the page**

Add to the import block at the top of `src/app/expenses/page.tsx`:

```tsx
import BottomSheet from '@/components/BottomSheet';
```

- [x] **Step 3: Convert the Edit Bill sheet**

Replace the outer wrapper (the `fixed inset-0` div, the backdrop div, the panel div, and the drag-handle div) with `BottomSheet`, keeping the inner content:

```tsx
{editBill && (
  <BottomSheet onClose={() => setEditBill(null)}>
    <div className="flex items-center gap-3 mb-5">
      <span className="text-2xl">💡</span>
      <p className="font-semibold text-white">Edit Bill</p>
    </div>
    <p className="text-xs text-slate-500 mb-1">Name</p>
    <input
      type="text"
      value={editBillName}
      onChange={e => setEditBillName(e.target.value)}
      placeholder="Bill name"
      className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
    />
    <InlineAmountInput label="Amount" value={editBillAmt} onChange={setEditBillAmt} />
    <button
      onClick={saveBillEdit}
      disabled={!editBillName.trim() || !editBillAmt}
      className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
    >
      Save
    </button>
  </BottomSheet>
)}
```

- [x] **Step 4: Convert the Edit Category Budget sheet the same way**

```tsx
{editCat && (() => {
  const meta = allCategories.find(c => c.key === editCat) ?? { icon: '✦', label: 'Category' };
  return (
    <BottomSheet onClose={() => setEditCat(null)}>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">{meta.icon}</span>
        <p className="font-semibold text-white">{meta.label} Budget</p>
      </div>
      <InlineAmountInput label="Monthly budget" value={editCatBudget} onChange={setEditCatBudget} />
      <button onClick={saveCatEdit} className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
        Save
      </button>
    </BottomSheet>
  );
})()}
```

- [x] **Step 5: Convert the Add Category sheet the same way**

Wrap its existing inner content (starting at `<p className="font-semibold text-white text-lg mb-5">New Category</p>`) in `<BottomSheet onClose={() => setAddCatOpen(false)}>`, dropping the wrapper/backdrop/handle divs.

- [x] **Step 6: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint shows exactly the 2 errors / 6 warnings baseline.

Manual check — run `npm run dev`, open `/expenses`, and confirm all three sheets still open, close on backdrop click, and save correctly: edit a bill, edit a category budget, add a category.

- [x] **Step 7: Commit (optional checkpoint)**

```bash
git add src/components/BottomSheet.tsx src/app/expenses/page.tsx
git commit -m "refactor: extract BottomSheet chrome from budget sheets"
```

---

### Task 2: `BudgetTile` primitive + Bills becomes a tile

**Files:**
- Create: `src/components/BudgetTile.tsx`, `src/components/BillsSheet.tsx`
- Modify: `src/app/expenses/page.tsx` (Recurring Bills section ~428-508)

**Interfaces:**
- Consumes: `BottomSheet` from Task 1.
- Produces:
  - `BudgetTile({ icon, label, value, status?, statusTone?, onClick?, href? })` — default export. `statusTone` is `'default' | 'good' | 'warn' | 'bad'`, defaulting to `'default'`. Exactly one of `onClick` / `href` is given.
  - `BillsSheet({ onClose })` — default export; reads bills from `useApp()` itself.

- [x] **Step 1: Create `BudgetTile`**

```tsx
'use client';

import Link from 'next/link';

type Tone = 'default' | 'good' | 'warn' | 'bad';

interface Props {
  icon: string;
  label: string;
  value: string;
  status?: string;
  statusTone?: Tone;
  onClick?: () => void;
  href?: string;
}

const toneClass: Record<Tone, string> = {
  default: 'text-slate-500',
  good:    'text-emerald-400',
  warn:    'text-amber-400',
  bad:     'text-red-400',
};

const shell =
  'block w-full rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 text-left ' +
  'hover:border-slate-600 hover:bg-[#141d2e] transition-colors';

// A collapsed section: the one number the user came for, plus a status line.
export default function BudgetTile({
  icon, label, value, status, statusTone = 'default', onClick, href,
}: Props) {
  const body = (
    <>
      <div className="flex items-center gap-2 mb-2">
        <span className="text-base shrink-0">{icon}</span>
        <p className="text-[11px] font-semibold uppercase tracking-widest text-slate-500 truncate">
          {label}
        </p>
      </div>
      <p className="text-lg font-bold text-white tabular-nums truncate">{value}</p>
      {status && <p className={`mt-0.5 text-xs truncate ${toneClass[statusTone]}`}>{status}</p>}
    </>
  );

  if (href) return <Link href={href} className={shell}>{body}</Link>;
  return <button onClick={onClick} className={shell}>{body}</button>;
}
```

- [x] **Step 2: Create `BillsSheet`**

This moves the bills list, the add form, and their state out of the page. `uid` and `InlineAmountInput` are currently private to the page — `BillsSheet` gets its own copies rather than exporting them from a page file.

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt, Bill, currentYYYYMM } from './AppContext';
import BottomSheet from './BottomSheet';
import { PlusIcon, TrashIcon, PencilIcon, CheckIcon } from './Icons';

function uid() { return crypto.randomUUID(); }

interface Props {
  onClose: () => void;
  onEditBill: (bill: Bill) => void;
}

// Full recurring-bills management, lifted out of the Budget page so the page
// only has to render a tile summarising it.
export default function BillsSheet({ onClose, onEditBill }: Props) {
  const { settings, updateSettings, toggleBillPaid } = useApp();
  const { bills, currency } = settings;

  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [amt, setAmt] = useState('');

  const total = bills.reduce((s, b) => s + b.amount, 0);

  const handleAdd = () => {
    if (!name.trim() || !amt) return;
    const bill: Bill = { id: uid(), name: name.trim(), amount: parseFloat(amt), paidMonths: [] };
    updateSettings({ bills: [...bills, bill] });
    setName(''); setAmt(''); setAddOpen(false);
  };

  const remove = (id: string) =>
    updateSettings({ bills: bills.filter(b => b.id !== id) });

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">💡</span>
          <p className="font-semibold text-white">Recurring Bills</p>
        </div>
        <p className="text-sm font-medium text-slate-400 tabular-nums">
          {fmt(total, currency)}/mo
        </p>
      </div>

      <div className="space-y-2">
        {bills.length === 0 && !addOpen && (
          <div className="rounded-xl border border-dashed border-[#1e2d40] px-4 py-5 text-center">
            <p className="text-sm text-slate-500">No recurring bills yet.</p>
          </div>
        )}

        {bills.map(b => {
          const isPaid = b.paidMonths.includes(currentYYYYMM());
          return (
            <div
              key={b.id}
              className={`flex items-center gap-2 rounded-xl border px-4 py-3 transition-colors ${
                isPaid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-white/5 border-[#1e2d40]'
              }`}
            >
              <p className={`flex-1 text-sm min-w-0 truncate ${isPaid ? 'text-slate-500' : 'text-white'}`}>
                {b.name}
              </p>
              <p className="text-sm font-medium text-slate-300 shrink-0">{fmt(b.amount, currency)}</p>
              <button
                onClick={() => toggleBillPaid(b.id)}
                title={isPaid ? 'Mark unpaid' : 'Mark as paid'}
                className={`flex h-7 w-7 items-center justify-center rounded-full transition-colors shrink-0 ${
                  isPaid
                    ? 'bg-emerald-500/20 text-emerald-400'
                    : 'bg-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10'
                }`}
              >
                <CheckIcon className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onEditBill(b)} title="Edit bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                <PencilIcon className="w-3.5 h-3.5 text-slate-500 hover:text-slate-200" />
              </button>
              <button onClick={() => remove(b.id)} title="Delete bill"
                className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors shrink-0">
                <TrashIcon className="w-3.5 h-3.5 text-red-400/60 hover:text-red-400" />
              </button>
            </div>
          );
        })}

        {addOpen ? (
          <div className="rounded-xl bg-[#1a2332] border border-blue-500/30 p-4 space-y-3">
            <div className="flex gap-2">
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Bill name" autoFocus
                className="flex-1 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
              <input
                type="number" value={amt} onChange={e => setAmt(e.target.value)}
                placeholder="Amount"
                className="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-500 outline-none focus:border-blue-500/50"
              />
            </div>
            <div className="flex gap-2">
              <button onClick={handleAdd} disabled={!name.trim() || !amt}
                className="flex-1 rounded-lg bg-blue-600 py-2 text-sm font-medium text-white disabled:opacity-40">
                Save
              </button>
              <button onClick={() => { setAddOpen(false); setName(''); setAmt(''); }}
                className="flex-1 rounded-lg bg-white/5 py-2 text-sm text-slate-400">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button onClick={() => setAddOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[#1e2d40] py-3 text-sm text-blue-400 hover:border-blue-500/40 transition-colors">
            <PlusIcon className="w-4 h-4" /> Add bill
          </button>
        )}
      </div>
    </BottomSheet>
  );
}
```

`onEditBill` hands the bill back to the page, which already owns the Edit Bill sheet — keeping one sheet open at a time is the page's job.

- [x] **Step 3: Wire it into the page**

In `src/app/expenses/page.tsx`:

1. Add imports:
```tsx
import BudgetTile from '@/components/BudgetTile';
import BillsSheet from '@/components/BillsSheet';
```
2. Add state: `const [billsOpen, setBillsOpen] = useState(false);`
3. Delete the whole Recurring Bills section (`{/* ── Recurring Bills ── */}` through its closing `</div>`, ~lines 428-508) and put the tile in its place:
```tsx
<BudgetTile
  icon="💡"
  label="Bills"
  value={`${fmt(totalBills, currency)}/mo`}
  status={
    bills.length === 0
      ? 'none yet'
      : `${bills.filter(b => !b.paidMonths.includes(currentYYYYMM())).length} of ${bills.length} unpaid`
  }
  statusTone={
    bills.length > 0 && bills.every(b => b.paidMonths.includes(currentYYYYMM())) ? 'good' : 'default'
  }
  onClick={() => setBillsOpen(true)}
/>
```
4. Render the sheet next to the other sheets at the bottom of the page:
```tsx
{billsOpen && (
  <BillsSheet
    onClose={() => setBillsOpen(false)}
    onEditBill={b => { setBillsOpen(false); openBillEdit(b); }}
  />
)}
```
5. Delete the page's now-unused bills state and handlers: `addBillOpen`/`setAddBillOpen`, `newBillName`, `newBillAmt` (~lines 227-229), `handleAddBill` (~282-288), `removeBill` (~290-291). **Keep** `editBill`, `editBillName`, `editBillAmt`, `openBillEdit`, `saveBillEdit` — the Edit Bill sheet stays on the page.
6. Remove any import left unused by the deletion (check `CheckIcon`).

- [x] **Step 4: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline, with no new `no-unused-vars` warnings — if one appears, an import or state variable was left behind in step 5.

Manual check — `/expenses` shows a Bills tile reading e.g. `₱8,400/mo · 2 of 5 unpaid`. Tapping opens the sheet. Inside: add a bill, toggle it paid (tile's status updates on close), edit it (bills sheet closes, edit sheet opens), delete it.

- [x] **Step 5: Commit (optional checkpoint)**

```bash
git add src/components/BudgetTile.tsx src/components/BillsSheet.tsx src/app/expenses/page.tsx
git commit -m "refactor: collapse recurring bills into a tile and sheet"
```

---

### Task 3: Electric becomes a tile

**Files:**
- Create: `src/components/ElectricSheet.tsx`
- Modify: `src/app/expenses/page.tsx`

**Interfaces:**
- Consumes: `BottomSheet` (Task 1), `BudgetTile` (Task 2), existing `ElectricSection`.
- Produces: `ElectricSheet({ onClose })` — default export.

- [x] **Step 1: Create the wrapper**

```tsx
'use client';

import BottomSheet from './BottomSheet';
import ElectricSection from './ElectricSection';

interface Props {
  onClose: () => void;
}

// ElectricSection carries its own hero, rate field and appliance list, plus its
// own ticker — which therefore only runs while this sheet is mounted.
export default function ElectricSheet({ onClose }: Props) {
  return (
    <BottomSheet onClose={onClose}>
      <ElectricSection />
    </BottomSheet>
  );
}
```

- [x] **Step 2: Replace the section with a tile**

In `src/app/expenses/page.tsx`:

1. Swap the import `ElectricSection` for `ElectricSheet`.
2. Add state: `const [electricOpen, setElectricOpen] = useState(false);`
3. Replace `<ElectricSection />` in the right column with:
```tsx
<BudgetTile
  icon="⚡"
  label="Electric"
  value={fmt(liveElectric, currency)}
  status={
    settings.appliances.filter(a => a.enabled).length > 0
      ? `${settings.appliances.filter(a => a.enabled).length} running`
      : 'nothing running'
  }
  statusTone={settings.appliances.filter(a => a.enabled).length > 0 ? 'warn' : 'default'}
  onClick={() => setElectricOpen(true)}
/>
```
4. Render the sheet with the others:
```tsx
{electricOpen && <ElectricSheet onClose={() => setElectricOpen(false)} />}
```

The page-level 10s tick added alongside `liveElectric` already keeps the tile's figure current; leave it in place.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline.

Manual check — the Electric tile shows the live cost and `1 running` when an appliance is on. Tap it: the full appliance UI opens in a sheet. Toggle an appliance, close the sheet, and confirm the tile's value keeps ticking up (wait ~10s).

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/components/ElectricSheet.tsx src/app/expenses/page.tsx
git commit -m "refactor: collapse electric into a tile and sheet"
```

---

### Task 4: Savings Target becomes a tile

**Files:**
- Create: `src/components/SavingsSheet.tsx`
- Modify: `src/app/expenses/page.tsx` (Savings Target section ~663-684)

**Interfaces:**
- Consumes: `BottomSheet` (Task 1), `BudgetTile` (Task 2).
- Produces: `SavingsSheet({ onClose })` — default export; reads and writes `monthlySavingsTarget` via `useApp()`.

- [x] **Step 1: Create the sheet**

```tsx
'use client';

import { useApp } from './AppContext';
import BottomSheet from './BottomSheet';

interface Props {
  onClose: () => void;
}

export default function SavingsSheet({ onClose }: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlySavingsTarget, currency } = settings;

  return (
    <BottomSheet onClose={onClose}>
      <div className="flex items-center gap-3 mb-5">
        <span className="text-2xl">🌱</span>
        <p className="font-semibold text-white">Monthly Savings</p>
      </div>
      <p className="text-xs text-slate-500 mb-1">Amount to set aside each month</p>
      <div className="flex items-center gap-2">
        <span className="text-sm text-slate-500">{currency}</span>
        <input
          type="number"
          value={monthlySavingsTarget || ''}
          onChange={e => updateSettings({ monthlySavingsTarget: parseFloat(e.target.value) || 0 })}
          placeholder="0.00"
          autoFocus
          className="flex-1 rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-emerald-500/50"
        />
      </div>
      <button onClick={onClose}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white">
        Done
      </button>
    </BottomSheet>
  );
}
```

- [x] **Step 2: Replace the section with a tile**

1. Import `SavingsSheet`; add `const [savingsOpen, setSavingsOpen] = useState(false);`
2. Delete the Savings Target section (~663-684) and put in its place:
```tsx
<BudgetTile
  icon="🌱"
  label="Savings"
  value={monthlySavingsTarget > 0 ? `${fmt(monthlySavingsTarget, currency)}/mo` : 'Not set'}
  status={monthlySavingsTarget > 0 ? 'set aside each month' : 'tap to set a target'}
  onClick={() => setSavingsOpen(true)}
/>
```
3. Render `{savingsOpen && <SavingsSheet onClose={() => setSavingsOpen(false)} />}` with the other sheets.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Manual check — the Savings tile reads `Not set` at zero. Tap, type `3000`, close. Tile reads `₱3,000.00/mo`, and the hero's Allocated total rises by 3000.

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/components/SavingsSheet.tsx src/app/expenses/page.tsx
git commit -m "refactor: collapse savings target into a tile and sheet"
```

---

### Task 5: Shopee becomes a tile linking to `/shopee`

Deletes ~150 lines of editor duplicated from `/shopee`.

**Files:**
- Modify: `src/app/expenses/page.tsx` (Shopee Pay Later section ~510-662)

**Interfaces:**
- Consumes: `BudgetTile` (Task 2).

- [x] **Step 1: Replace the section with a linking tile**

Delete the whole Shopee Pay Later section and put in its place:

```tsx
<BudgetTile
  icon="🛍️"
  label="Shopee"
  value={shopeeMonthly > 0 ? fmt(shopeeMonthly, currency) : 'Nothing due'}
  status={
    shopeeRemainingBalance > 0
      ? `${fmt(shopeeRemainingBalance, currency)} left${shopeeDebtFreeDate ? ` · ${formatMonth(shopeeDebtFreeDate)}` : ''}`
      : 'all paid off'
  }
  statusTone={shopeeRemainingBalance > 0 ? 'default' : 'good'}
  href="/shopee"
/>
```

- [x] **Step 2: Delete now-unused page state, handlers and imports**

Remove from the page anything only the deleted section used. Check and remove as applicable:

- `useApp()` destructured members: `addShopeePayment`, `updateShopeePayment`, `deleteShopeePayment`, `shopeeNewPurchaseLock`, `setShopeeNewPurchaseLock`
- the `STATUS_STYLE` constant (~33-37)
- the `BagIcon` / `AlertIcon` imports if unused elsewhere
- any `useState` holding Shopee add-payment form fields

**Keep:** `shopeeSchedule`, `shopeeRemainingBalance`, `shopeeDebtFreeDate`, `nextShopee`, `shopeeMonthly`, `formatMonth` — the tile and the allocation total still use them.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline, **no new unused-variable warnings** — any that appear name something step 2 missed.

Manual check — the Shopee tile shows the next payment and remaining balance, and tapping it navigates to `/shopee`. Confirm the hero's Allocated total is unchanged from before this task (the tile is display-only; `shopeeMonthly` still feeds `totalAllocated`).

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/app/expenses/page.tsx
git commit -m "refactor: link Shopee tile to its page instead of duplicating the editor"
```

---

### Task 6: Emergency Fund becomes a tile linking to `/emergency-fund`

Deletes ~117 lines duplicated from `/emergency-fund`.

**Files:**
- Modify: `src/app/expenses/page.tsx` (Emergency Fund section ~686-803)

**Interfaces:**
- Consumes: `BudgetTile` (Task 2).

- [x] **Step 1: Replace the section with a linking tile**

```tsx
<BudgetTile
  icon="🛡️"
  label="Emergency"
  value={`${fmt(emergencyFund.currentAmount, currency)} of ${fmt(settings.emergencyFundTarget, currency)}`}
  status={
    settings.emergencyFundTarget > 0
      ? `${Math.min(100, (emergencyFund.currentAmount / settings.emergencyFundTarget) * 100).toFixed(0)}% funded`
      : 'no target set'
  }
  statusTone={
    settings.emergencyFundTarget > 0 && emergencyFund.currentAmount >= settings.emergencyFundTarget
      ? 'good'
      : 'default'
  }
  href="/emergency-fund"
/>
```

Guard note: the percentage is only computed inside the `emergencyFundTarget > 0` branch, so there is no divide-by-zero.

- [x] **Step 2: Delete now-unused page state, handlers and imports**

Remove `addEmergencyFundEntry` from the `useApp()` destructure, any emergency-fund form state, and the `ShieldIcon` import if unused elsewhere. **Keep** `emergencyFund`.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Manual check — the Emergency tile shows `₱18,000.00 of ₱50,000.00 · 36% funded` and navigates to `/emergency-fund`. With the target at 0 it reads `no target set` and does not show `NaN` or `Infinity`.

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/app/expenses/page.tsx
git commit -m "refactor: link Emergency tile to its page instead of duplicating the editor"
```

---

### Task 7: `BudgetHero` + hero detail sheet

**Files:**
- Create: `src/components/BudgetHero.tsx`
- Modify: `src/app/expenses/page.tsx` (Budget Health section ~349-426)

**Interfaces:**
- Consumes: `BottomSheet` (Task 1).
- Produces:
```ts
BudgetHero({
  monthLabel: string;
  allocated: number;
  unallocated: number;
  allocatedPct: number;
  parts: { label: string; value: number }[];
  receivedThisMonth: number;
}) // default export
```
`parts` is the page's existing `allocationParts`. The component reads `monthlyIncome` and `currency` from `useApp()` and writes income back through `updateSettings`.

- [x] **Step 1: Create the component**

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import ProgressBar from './ProgressBar';
import NumberField from './NumberField';
import BottomSheet from './BottomSheet';

interface Props {
  monthLabel: string;
  allocated: number;
  unallocated: number;
  allocatedPct: number;
  parts: { label: string; value: number }[];
  receivedThisMonth: number;
}

// The one band that is never collapsed — it is why the page gets opened. The
// breakdown chips and actual-received figure sit behind a tap, since neither
// changes the headline number.
export default function BudgetHero({
  monthLabel, allocated, unallocated, allocatedPct, parts, receivedThisMonth,
}: Props) {
  const { settings, updateSettings } = useApp();
  const { monthlyIncome, currency } = settings;
  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
      <div className="flex items-start justify-between gap-4 mb-4">
        <div>
          <p className="text-xs text-slate-500 uppercase tracking-widest">Monthly Budget</p>
          <p className="text-2xl font-bold text-white mt-0.5">{monthLabel}</p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-lg text-slate-500">{currency}</span>
          <NumberField
            value={monthlyIncome}
            onChange={v => updateSettings({ monthlyIncome: v })}
            step={500}
            min={0}
            inputClassName="w-28 rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-1.5 text-right text-lg font-bold text-white outline-none focus:border-blue-500/50"
          />
        </div>
      </div>

      {monthlyIncome === 0 ? (
        <p className="text-sm text-slate-400 text-center py-1">
          Enter your monthly income above to start budgeting.
        </p>
      ) : (
        <>
          <div className="flex items-end justify-between mb-3">
            <div>
              <p className="text-xs text-slate-500 mb-0.5">Allocated</p>
              <p className="text-2xl font-bold text-white">{fmt(allocated, currency)}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-500 mb-0.5">
                {unallocated >= 0 ? 'Unallocated' : 'Over budget'}
              </p>
              <p className={`text-lg font-bold ${unallocated >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                {fmt(Math.abs(unallocated), currency)}
              </p>
            </div>
          </div>

          <ProgressBar
            value={allocated}
            max={monthlyIncome}
            color={allocatedPct <= 80 ? 'green' : allocatedPct <= 100 ? 'amber' : 'red'}
          />

          <div className="mt-2 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              {allocatedPct.toFixed(0)}% of {fmt(monthlyIncome, currency)} income
            </p>
            <button onClick={() => setDetailOpen(true)}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors shrink-0">
              Breakdown →
            </button>
          </div>
        </>
      )}

      {detailOpen && (
        <BottomSheet onClose={() => setDetailOpen(false)}>
          <p className="font-semibold text-white text-lg mb-5">Where it goes</p>

          <div className="space-y-2 mb-5">
            {parts.length === 0 && (
              <p className="text-sm text-slate-500">Nothing allocated yet.</p>
            )}
            {parts.map(p => (
              <div key={p.label} className="flex items-center justify-between gap-3">
                <p className="text-sm text-slate-400">{p.label}</p>
                <p className="text-sm font-medium text-white tabular-nums">{fmt(p.value, currency)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t border-[#1e2d40] pt-2 mt-2">
              <p className="text-sm font-medium text-white">Total allocated</p>
              <p className="text-sm font-bold text-white tabular-nums">{fmt(allocated, currency)}</p>
            </div>
          </div>

          <div className="rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-3">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-xs text-slate-500">Received this month</p>
                <p className="text-[11px] text-slate-600 mt-0.5">Actual top-ups logged to your wallets</p>
              </div>
              <p className="text-right shrink-0">
                <span className={`text-lg font-bold ${receivedThisMonth > 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
                  {fmt(receivedThisMonth, currency)}
                </span>
                {monthlyIncome > 0 && (
                  <span className="block text-[11px] text-slate-600">
                    of {fmt(monthlyIncome, currency)} expected
                  </span>
                )}
              </p>
            </div>
          </div>
        </BottomSheet>
      )}
    </div>
  );
}
```

- [x] **Step 2: Replace the section in the page**

1. Import `BudgetHero`.
2. Delete the Budget Health section (~349-426) **and** the page `<header>` block (~330-342) — the hero now carries the month label. Keep the "Log Expense" link by moving it above the hero:
```tsx
<div className="flex justify-end pt-14 pb-4 md:pt-10">
  <Link
    href="/expenses/new"
    className="flex items-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-500 transition-colors"
  >
    <PlusIcon className="w-4 h-4" />
    <span className="hidden sm:inline">Log Expense</span>
  </Link>
</div>

<BudgetHero
  monthLabel={monthLabel}
  allocated={totalAllocated}
  unallocated={unallocated}
  allocatedPct={allocatedPct}
  parts={allocationParts}
  receivedThisMonth={receivedThisMonth}
/>
```
3. Remove `NumberField` and `ProgressBar` imports from the page if nothing else there uses them (`ProgressBar` is still used by category rows until Task 8 — check before removing).

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Manual check — hero shows month, income field, Allocated/Unallocated, bar. Editing income updates the bar and persists across refresh. "Breakdown →" opens a sheet listing each allocation part, a total that equals the hero's Allocated figure, and the Received block. With income at 0 the hero shows the empty-state line and no Breakdown link.

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/components/BudgetHero.tsx src/app/expenses/page.tsx
git commit -m "refactor: extract budget hero and move breakdown behind a sheet"
```

---

### Task 8: Category cards

**Files:**
- Create: `src/components/CategoryCard.tsx`, `src/components/CategoryGrid.tsx`
- Modify: `src/app/expenses/page.tsx` (Category Budgets section ~810-897, Add Category sheet, Edit Category Budget sheet)

**Interfaces:**
- Consumes: `ProgressBar`, `BottomSheet` (Task 1).
- Produces:
```ts
type CatMeta = { key: string; label: string; icon: string };

CategoryCard({ icon, label, spent, budget, currency, onClick })
CategoryGrid({ categories, spentFor, budgets, currency, onSelect, onAdd })
// categories: CatMeta[]
// spentFor: (key: string) => number
// budgets: Partial<Record<string, number>>
```

- [x] **Step 1: Create `CategoryCard`**

```tsx
'use client';

import { fmt } from './AppContext';
import ProgressBar from './ProgressBar';

function paceColor(pct: number): 'green' | 'amber' | 'red' {
  if (pct <= 80) return 'green';
  if (pct <= 100) return 'amber';
  return 'red';
}

interface Props {
  icon: string;
  label: string;
  spent: number;
  budget: number;
  currency: string;
  onClick: () => void;
}

export default function CategoryCard({ icon, label, spent, budget, currency, onClick }: Props) {
  const hasBudget = budget > 0;
  const remaining = budget - spent;
  const pct = hasBudget ? (spent / budget) * 100 : 0;
  const over = hasBudget && spent > budget;

  return (
    <button
      onClick={onClick}
      className="flex flex-col rounded-2xl bg-[#111827] border border-[#1e2d40] p-4 text-left hover:border-slate-600 hover:bg-[#141d2e] transition-colors"
    >
      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5 text-lg mb-2.5 shrink-0">
        {icon}
      </div>
      <p className="w-full text-sm font-medium text-white truncate">{label}</p>
      <p className="mt-1 text-lg font-bold text-white tabular-nums">{fmt(spent, currency)}</p>

      {hasBudget ? (
        <>
          <p className="mt-0.5 mb-2.5 w-full text-[11px] text-slate-500 truncate">
            of {fmt(budget, currency)} ·{' '}
            <span className={over ? 'text-red-400' : 'text-slate-400'}>
              {over ? `${fmt(Math.abs(remaining), currency)} over` : `${fmt(remaining, currency)} left`}
            </span>
          </p>
          <ProgressBar value={spent} max={budget} color={paceColor(pct)} className="mt-auto" />
        </>
      ) : (
        <p className="mt-0.5 text-[11px] text-slate-600">No budget set</p>
      )}
    </button>
  );
}
```

- [x] **Step 2: Create `CategoryGrid`**

```tsx
'use client';

import CategoryCard from './CategoryCard';
import { PlusIcon } from './Icons';

interface CatMeta { key: string; label: string; icon: string }

interface Props {
  categories: CatMeta[];
  spentFor: (key: string) => number;
  budgets: Partial<Record<string, number>>;
  currency: string;
  onSelect: (key: string) => void;
  onAdd: () => void;
}

export default function CategoryGrid({
  categories, spentFor, budgets, currency, onSelect, onAdd,
}: Props) {
  return (
    <div>
      <p className="mb-3 px-1 text-xs font-semibold uppercase tracking-widest text-slate-500">
        Categories
      </p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {categories.map(c => (
          <CategoryCard
            key={c.key}
            icon={c.icon}
            label={c.label}
            spent={spentFor(c.key)}
            budget={budgets[c.key] ?? 0}
            currency={currency}
            onClick={() => onSelect(c.key)}
          />
        ))}
        <button
          onClick={onAdd}
          className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[#1e2d40] p-4 text-slate-500 hover:border-blue-500/40 hover:text-blue-400 transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          <span className="text-xs font-medium">Add</span>
        </button>
      </div>
    </div>
  );
}
```

- [x] **Step 3: Swap the section for the grid**

In `src/app/expenses/page.tsx`, delete the Category Budgets section (~810-897, including the "Removed" restore strip) and put in its place:

```tsx
<CategoryGrid
  categories={allCategories}
  spentFor={spentFor}
  budgets={categoryBudgets}
  currency={currency}
  onSelect={key => openCatEdit(key as Category)}
  onAdd={() => setAddCatOpen(true)}
/>
```

Import `CategoryGrid`. Delete the page's `paceColor` helper (~21-25) — `CategoryCard` owns it now and nothing else on the page uses it. Remove the `ProgressBar` import if now unused.

- [x] **Step 4: Move Delete into the Edit Category Budget sheet**

The per-card trash icon is gone, so the edit sheet becomes the only route to deletion. Add a delete button below Save inside that sheet:

```tsx
<button
  onClick={() => { const k = editCat; setEditCat(null); setConfirmDeleteCat(k); }}
  className="mt-3 w-full rounded-xl bg-white/5 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 transition-colors"
>
  {customCategories.some(c => c.key === editCat) ? 'Delete category' : 'Remove category'}
</button>
```

Closing the edit sheet before opening the confirm dialog keeps one overlay on screen at a time.

- [x] **Step 5: Move the restore list into the Add Category sheet**

Inside the Add Category sheet, below the existing form, add:

```tsx
{hiddenBuiltIns.length > 0 && (
  <div className="mt-6 border-t border-[#1e2d40] pt-4">
    <p className="mb-2 text-[11px] uppercase tracking-widest text-slate-600">Removed</p>
    <div className="flex flex-wrap gap-2">
      {hiddenBuiltIns.map(({ key, label, icon }) => (
        <button
          key={key}
          onClick={() => restoreCategory(key)}
          title={`Restore ${label}`}
          className="flex items-center gap-1.5 rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white hover:border-slate-600 transition-colors"
        >
          <span className="opacity-50">{icon}</span>
          {label}
          <span className="text-slate-600">· restore</span>
        </button>
      ))}
    </div>
  </div>
)}
```

- [x] **Step 6: Verify**

```bash
npm run build
npm run lint
```

Manual check, end to end:
1. Categories render as cards, 2-up on a phone width, 4-up on a wide window.
2. A category with a budget shows spent, `of ₱X · ₱Y left`, and a bar that is green under 80%, amber 80-100%, red over.
3. A category with no budget shows `No budget set` and no bar.
4. Electric's card reads the live meter figure, not a logged-expense total.
5. Tap a card → edit sheet → change the budget → Save. Card updates.
6. Tap a card → `Remove category` → confirm. The card disappears **and survives a refresh** (this is the path that was broken by the missing `hidden_categories` column).
7. Tap `Add` → the sheet shows the new-category form and, underneath, the removed built-ins. Restore one; it reappears as a card.

- [x] **Step 7: Commit (optional checkpoint)**

```bash
git add src/components/CategoryCard.tsx src/components/CategoryGrid.tsx src/app/expenses/page.tsx
git commit -m "feat: render category budgets as cards"
```

---

### Task 9: Final grid layout

Every section is now a tile, a hero, or the card grid. This task drops the two-column scaffold and lays them out as designed.

**Files:**
- Modify: `src/app/expenses/page.tsx`

- [x] **Step 1: Replace the two-column wrapper**

Delete the `<div className="md:grid md:grid-cols-2 md:gap-6">` wrapper and both `{/* ══ LEFT COLUMN ══ */}` / `{/* ══ RIGHT COLUMN ══ */}` `<div>`s. Lay the page out as three bands:

```tsx
<div className="space-y-6">

  {/* Hero — always open */}
  <BudgetHero
    monthLabel={monthLabel}
    allocated={totalAllocated}
    unallocated={unallocated}
    allocatedPct={allocatedPct}
    parts={allocationParts}
    receivedThisMonth={receivedThisMonth}
  />

  {/* Collapsed sections */}
  <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
    {/* Bills tile */}
    {/* Electric tile */}
    {/* Savings tile */}
    {/* Shopee tile */}
    {/* Emergency tile */}
  </div>

  {/* Categories */}
  <CategoryGrid
    categories={allCategories}
    spentFor={spentFor}
    budgets={categoryBudgets}
    currency={currency}
    onSelect={key => openCatEdit(key as Category)}
    onAdd={() => setAddCatOpen(true)}
  />

</div>
```

Move the five `<BudgetTile>` elements written in Tasks 2-6 into the tile grid in that order, replacing the comment placeholders above with the actual elements.

- [x] **Step 2: Check the page's remaining bottom padding**

The page ends with `<BottomNav />`; keep whatever bottom padding class the outer container already applies so the last card is not hidden behind the mobile nav bar.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline (2 errors, 6 warnings).

Manual check:
1. **Desktop (wide window):** hero full width; tiles 3-up in two rows (3 + 2); category cards 4-up below. No horizontal scroll.
2. **Mobile (narrow window / device toolbar):** hero full width; tiles 2-up; cards 2-up. Whole page is a short scroll — nothing below the fold but categories.
3. **Nothing expanded on load** other than the hero.
4. **Every capability still reachable:** bills add/edit/delete/paid-toggle; appliance add/edit/delete/toggle/pin and the kWh rate; savings target; category budget edit; category add/delete/restore; Shopee and Emergency Fund via their tiles.
5. The last category card is not obscured by the bottom nav.

- [x] **Step 4: Commit (optional checkpoint)**

```bash
git add src/app/expenses/page.tsx
git commit -m "refactor: lay out budget page as hero, tile grid and category cards"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| Hero always open, chips + Received behind a tap | 7 |
| Tile grid `grid-cols-2 md:grid-cols-3`, 5 tiles | 2, 3, 4, 5, 6, 9 |
| Bills / Electric / Savings open sheets | 2, 3, 4 |
| Shopee / Emergency navigate to their pages | 5, 6 |
| Category cards always visible, `+ Add` card | 8 |
| Card delete moves into Edit Budget sheet | 8 |
| Restore list moves into Add Category sheet | 8 |
| Sheets reuse the existing bottom-sheet pattern | 1 |
| Electric ticker only runs while the sheet is mounted | 3 |
| No data model / `AppContext` changes | all — none touch it |
| Derived totals unchanged | 5, 6 explicitly re-verify `totalAllocated` |
| Components extracted per the file table | 1-8 |

All eight planned files are created; all seven original sections are accounted for.

**Type consistency**

- `BudgetTile` prop names (`icon`, `label`, `value`, `status`, `statusTone`, `onClick`, `href`) are used identically in Tasks 2, 3, 4, 5, 6.
- `CategoryGrid` passes `spentFor` and `budgets`, matching the page's existing `spentFor` function and `categoryBudgets` object.
- `spentFor` on the page is typed `(key: Category) => number` while `CategoryGrid` declares `(key: string) => number`. `Category` is assignable to `string`, so passing the page's function is safe; `onSelect` casts back with `key as Category` at the call site, matching `openCatEdit`'s signature.
- `BottomSheet({ onClose, children })` is used with exactly those props in Tasks 1, 2, 3, 4, 7.
- `BillsSheet` takes `{ onClose, onEditBill }` in both its definition and its call site.

**Known risk**

Tasks 5 and 6 delete large blocks and their supporting state. The lint baseline is the guard: any variable or import left orphaned surfaces as a new `no-unused-vars` warning, which each task's verify step explicitly checks for.
