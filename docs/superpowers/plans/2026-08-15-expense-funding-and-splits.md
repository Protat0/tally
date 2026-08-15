# Expense Funding and Splits Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let one expense record who actually funded it — your wallet, another person, or a split between you and several people — creating the matching debt rows in the same action.

**Architecture:** Funding is separated from consumption. The typed amount is what the payer paid out; the expense stores only your share, and the remainder becomes debt rows linked by `debt_entries.expense_id`. The debt rows carry their own `debt_out`/`debt_in` movements through the existing `addDebtEntry`, so no new movement logic is written. A wallet-less expense (someone else paid) books no movement at all.

**Tech Stack:** Next.js (see `AGENTS.md` — this is NOT the Next.js you know), React client components, TypeScript, Supabase, Tailwind.

**Spec:** `docs/superpowers/specs/2026-08-15-expense-funding-and-splits-design.md`

## Global Constraints

- **Read the spec first.** The plan argues from it; the case table in "Model" is the contract.
- **This is NOT the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code. Nothing here touches routing, server components, or data fetching — it is all client-component state inside existing `'use client'` files — so that lookup is likely unnecessary. Do it anyway if you reach for a framework API.
- **There is no test framework.** `package.json` has only `dev`, `build`, `start`, `lint`. Do not add one; do not write test files. Verification in every task is `npx tsc --noEmit`, `npm run lint`, and the scripted manual pass given in that task.
- **`npm run lint` is not clean and that is not yours to fix.** The baseline is `✖ 8 problems (2 errors, 6 warnings)`, all in `AppContext.tsx`'s `useEffect`/`loadAll` block. The bar is **no new problems** — the count must still read 8. Do not fix the pre-existing two; that is an unrelated change and will be rejected in review.
- **The migration is already applied** (2026-08-15, reported clean). Do not re-run it, and do not write migration code:
  ```sql
  alter table expenses      alter column wallet_id drop not null;
  alter table debt_entries  add column expense_id uuid references expenses(id) on delete set null;
  ```
- **Never reintroduce a loop of single reversals.** `reverseMoves` accumulates deltas per wallet *before* computing any balance because `balanceOf` reads React state that does not update between loop iterations. See `AppContext.tsx:743-776`.
- **Currency is never hardcoded.** Always format through `fmt(amount, currency)` from `AppContext`.
- **Money is rounded at 2 decimals.** Use `round2`. It does **not** currently live in `AppContext` — it is a module-private const in `SettleUpSheet.tsx:11`. Task 1 Step 5 moves it into `AppContext` and exports it. Do not add a second definition.

---

### Task 1: Widen the types so a wallet-less expense is representable

Nothing behaves differently after this task. It only makes `Expense.walletId` nullable and adds `DebtEntry.expenseId`, then repairs every site `tsc` flags. Splitting this out means later tasks never fight the compiler and a reviewer can confirm "no behaviour changed" in isolation.

**Files:**
- Modify: `src/components/AppContext.tsx` (interfaces ~22 and ~61, `fromDBExpense` ~352, `fromDBDebtEntry` ~371, `addExpense` ~610, `deleteExpense` ~633)
- Modify: `src/components/SettleUpSheet.tsx:4,11` (move `round2` out)
- Modify: `src/app/transactions/page.tsx:51`
- Modify: `src/components/CategoryDetailSheet.tsx:52`

**Interfaces:**
- Consumes: nothing.
- Produces: `Expense.walletId: string | null`; `DebtEntry.expenseId: string | null`; `export const round2 = (n: number) => number` from `AppContext`; `walletName(id: string | null) => string` in both display files.

- [ ] **Step 1: Widen the two interfaces**

In `src/components/AppContext.tsx`, change `Expense.walletId` to nullable and document why:

```ts
export interface Expense {
  id: string; amount: number; category: Category;
  // null means another person paid for this, so no wallet of yours moved.
  walletId: string | null; note: string; date: string;
}
```

Add `expenseId` to `DebtEntry` (keep the existing fields and their comments):

```ts
export interface DebtEntry {
  id: string; personId: string; direction: DebtDirection;
  amount: number; note: string; date: string;
  settledAt: string | null;      // null means open
  walletId: string | null;       // wallet the creation movement hit; null = none
  moveId: string | null;         // money_moves row created at creation
  settleMoveId: string | null;   // shared by every entry in one settle-up batch
  expenseId: string | null;      // the expense that produced this row; null = standalone debt
}
```

- [ ] **Step 2: Map the new column**

In `fromDBExpense`, make the wallet null-tolerant:

```ts
walletId: r.wallet_id ?? null, note: r.note || '', date: r.date,
```

In `fromDBDebtEntry`, add the last line:

```ts
  settleMoveId: r.settle_move_id ?? null,
  expenseId: r.expense_id ?? null,
});
```

- [ ] **Step 3: Guard the two balance patches against a null wallet**

In `addExpense`, the balance patch must not run when no wallet paid. Replace the body's opening through the optimistic block:

```ts
  const addExpense = async (e: Omit<Expense, 'id' | 'date'>) => {
    if (!userId) return;
    // A wallet-less expense (someone else paid) moves no balance of yours.
    const wallet = e.walletId ? wallets.find(w => w.id === e.walletId) : undefined;
    const newBalance = wallet ? wallet.balance - e.amount : null;
    const now = new Date().toISOString();
    const tempId = crypto.randomUUID();

    setExpenses(prev => [{ ...e, id: tempId, date: now }, ...prev]);
    if (newBalance !== null) {
      setWallets(prev => prev.map(w => w.id === e.walletId ? { ...w, balance: newBalance } : w));
    }

    const [expRes] = await Promise.all([
      supabase.from('expenses').insert({
        user_id: userId, wallet_id: e.walletId, amount: e.amount,
        category: e.category, note: e.note, date: now,
      }).select().single(),
      ...(newBalance !== null && e.walletId
        ? [supabase.from('wallets').update({ balance: newBalance }).eq('id', e.walletId)]
        : []),
    ]);
    if (expRes.data) {
      setExpenses(prev => prev.map(ex => ex.id === tempId ? fromDBExpense(expRes.data) : ex));
    }
  };
```

Apply the same shape to `deleteExpense` — Task 3 rewrites this function completely, so here just make it compile without changing behaviour:

```ts
  const deleteExpense = async (id: string) => {
    const found = expenses.find(e => e.id === id);
    if (!found) return;
    const wallet = found.walletId ? wallets.find(w => w.id === found.walletId) : undefined;
    const newBalance = wallet ? wallet.balance + found.amount : null;
    setExpenses(prev => prev.filter(e => e.id !== id));
    if (newBalance !== null) {
      setWallets(prev => prev.map(w => w.id === found.walletId ? { ...w, balance: newBalance } : w));
    }
    await Promise.all([
      supabase.from('expenses').delete().eq('id', id),
      ...(newBalance !== null && found.walletId
        ? [supabase.from('wallets').update({ balance: newBalance }).eq('id', found.walletId)]
        : []),
    ]);
  };
```

- [ ] **Step 4: Let both display helpers take a null id**

In `src/app/transactions/page.tsx:51` and `src/components/CategoryDetailSheet.tsx:52`, widen the parameter. Both call sites already drop empty strings via `.filter(Boolean)`, so a wallet-less expense simply shows no wallet until Task 6 gives it a person name:

```ts
  const walletName = (id: string | null) => wallets.find(w => w.id === id)?.name ?? '';
```

- [ ] **Step 5: Move `round2` into `AppContext` and export it**

Task 3 rounds money inside `AppContext`, and the helper it needs is currently a
module-private const in `SettleUpSheet.tsx:11`. Two definitions of how money
rounds is a real hazard, so move it rather than copy it.

In `src/components/AppContext.tsx`, beside the existing `fmt` export:

```ts
// One definition of how money rounds. Never compare raw floats for a
// "is this the full amount" decision.
export const round2 = (n: number) => Math.round(n * 100) / 100;
```

In `src/components/SettleUpSheet.tsx`, change the import on line 4 and delete the
local const on line 11 along with its comment — carry that comment over to the
`AppContext` definition, since the reasoning is worth keeping:

```ts
import { fmt, round2 } from './AppContext';
```

The comment to preserve: *"A raw float comparison would send a ₱333.33 payment
against a ₱333.33 balance down the partial path and leave a phantom ₱0.00 entry
open forever."*

- [ ] **Step 6: Verify nothing broke**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: `tsc` exits 0 with no output. Lint reads `✖ 8 problems (2 errors, 6 warnings)`. Build compiles and prerenders all 13 routes.

- [ ] **Step 7: Manual pass — the app is unchanged**

Run `npm run dev`, open `/expenses`, log an ordinary expense from a wallet, and confirm on `/transactions` that it appears with its wallet name and that the wallet balance dropped by the amount. Delete it and confirm the balance returns. Then open `/debts` and settle a person partially, to exercise the `round2` that moved — the partial path must behave exactly as before. **Nothing about this should look new** — that is the point of the task.

- [ ] **Step 8: Commit**

```bash
git add src/components/AppContext.tsx src/components/SettleUpSheet.tsx src/app/transactions/page.tsx src/components/CategoryDetailSheet.tsx
git commit -m "refactor: an expense can exist without a wallet"
```

---

### Task 2: `addDebtEntry` accepts an expense id

One-line capability that Task 3 depends on. Kept separate because it is the only change to a function the debt board already relies on, and a reviewer should be able to see it alone.

**Files:**
- Modify: `src/components/AppContext.tsx` (`addDebtEntry` ~809, its context-type entry ~222, the provider value ~1320)

**Interfaces:**
- Consumes: Task 1's `DebtEntry.expenseId`.
- Produces: `addDebtEntry` gains an optional `expenseId?: string | null` argument, written to `debt_entries.expense_id`.

- [ ] **Step 1: Add the parameter to the context type**

In the `AppContextValue` interface (~222), add the field to `addDebtEntry`'s argument object, after `moveNote`:

```ts
  addDebtEntry: (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
    moveNote?: string;
    expenseId?: string | null;
  }) => Promise<void>;
```

- [ ] **Step 2: Accept and persist it**

In the implementation (~809), mirror the same field in the parameter type, then add it to the insert:

```ts
    const { data } = await supabase.from('debt_entries').insert({
      user_id: userId, person_id: e.personId, direction: e.direction,
      amount: e.amount, note: e.note, date: e.date,
      wallet_id: walletId, move_id: moveId,
      expense_id: e.expenseId ?? null,
    }).select().single();
```

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`.

- [ ] **Step 4: Manual pass — the debt board still works**

Run `npm run dev`, open `/debts`, add a debt with a wallet, and confirm the wallet balance moves and the row appears. Delete it and confirm the balance returns. Existing behaviour must be identical.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: a debt row can point back at the expense that made it"
```

---

### Task 3: One expense creates its debt rows

This is where the model in the spec becomes code. `addExpense` grows a funding description; it inserts the expense first (so the debt rows can reference its id), then creates one debt row per person.

**Files:**
- Modify: `src/components/AppContext.tsx` (`addExpense` ~610, context type ~190)

**Interfaces:**
- Consumes: Task 2's `addDebtEntry({ ..., expenseId })`; Task 1's exported `round2`.
- Produces:
  ```ts
  addExpense: (e: {
    amount: number;                                   // what the payer paid out
    category: Category;
    note: string;
    walletId: string | null;                          // null = a person paid
    paidByPersonId?: string | null;                   // set when walletId is null
    owedToMe?: { personId: string; amount: number }[];// set when a wallet paid
  }) => Promise<void>;
  ```

- [ ] **Step 1: Replace `addExpense` with the funding-aware version**

The whole function, including the comments explaining the two orderings a reviewer will ask about:

```ts
  // An expense records what YOU consumed. The amount passed here is what the
  // payer handed over; anything owed back to you becomes debt rows instead.
  //
  //   wallet paid → your share is the amount minus what others owe you
  //   person paid → the total is irrelevant (you do not track their finances),
  //                 so the amount IS your share and you owe all of it
  const addExpense = async (e: {
    amount: number; category: Category; note: string;
    walletId: string | null;
    paidByPersonId?: string | null;
    owedToMe?: { personId: string; amount: number }[];
  }) => {
    if (!userId) return;
    const owed = e.walletId ? (e.owedToMe ?? []) : [];
    const myShare = round2(e.walletId
      ? e.amount - owed.reduce((s, o) => s + o.amount, 0)
      : e.amount);

    const now = new Date().toISOString();

    // Inserted first, and NOT optimistically: the debt rows below need the real
    // expense id as a foreign key. A share of zero (you spotted someone the
    // whole thing) writes no expense at all rather than a ₱0 row that would
    // clutter the feed and the category totals.
    let expenseId: string | null = null;
    if (myShare > 0) {
      const wallet = e.walletId ? wallets.find(w => w.id === e.walletId) : undefined;
      const newBalance = wallet ? round2(wallet.balance - myShare) : null;

      const [expRes] = await Promise.all([
        supabase.from('expenses').insert({
          user_id: userId, wallet_id: e.walletId, amount: myShare,
          category: e.category, note: e.note, date: now,
        }).select().single(),
        ...(newBalance !== null && e.walletId
          ? [supabase.from('wallets').update({ balance: newBalance }).eq('id', e.walletId)]
          : []),
      ]);

      if (expRes.data) {
        expenseId = expRes.data.id as string;
        setExpenses(prev => [fromDBExpense(expRes.data), ...prev]);
      }
      if (newBalance !== null) {
        setWallets(prev => prev.map(w => w.id === e.walletId ? { ...w, balance: newBalance } : w));
      }
    }

    // Sequential on purpose. Each addDebtEntry books its own movement off
    // balanceOf, which reads React state — firing them together would compute
    // every new balance from the same stale figure and the last write would win.
    if (e.walletId) {
      for (const o of owed) {
        await addDebtEntry({
          personId: o.personId, direction: 'owed_to_me',
          amount: o.amount, note: e.note, date: now,
          walletId: e.walletId, expenseId,
        });
      }
    } else if (e.paidByPersonId) {
      await addDebtEntry({
        personId: e.paidByPersonId, direction: 'i_owe',
        amount: e.amount, note: e.note, date: now,
        walletId: null, expenseId,
      });
    }
  };
```

- [ ] **Step 2: Update the context type**

In `AppContextValue` (~190), replace the `addExpense` entry with the signature from **Interfaces → Produces** above, verbatim.

- [ ] **Step 3: Fix the one existing caller**

`src/app/expenses/new/page.tsx:53` passes `{ amount, category, walletId, note }`. That still type-checks — `walletId: string` satisfies `string | null` and the two new fields are optional. Confirm it compiles unchanged; do not edit the file in this task.

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`.

- [ ] **Step 5: Manual pass — the arithmetic in the spec's table**

No UI reaches the new arguments yet, so verify the ordinary path is untouched: run `npm run dev`, log a ₱100 expense from a wallet, confirm the wallet drops exactly ₱100 and the expense reads ₱100 on `/transactions`.

- [ ] **Step 6: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: an expense records who funded it and who owes you back"
```

---

### Task 4: Delete a split expense without corrupting a balance

**This is the task most likely to silently lose money.** Deleting a split expense must undo the expense's own wallet credit *and* N `debt_out` movements. `deleteExpense` patches the wallet directly while debt movements go through `reverseMoves`, and running both computes the second balance from a stale first — the exact failure `AppContext.tsx:743-751` warns about. Everything here funnels into **one** balance computation per wallet.

**Files:**
- Modify: `src/components/AppContext.tsx` (`reverseMoves` ~752, `deleteExpense` ~633)

**Interfaces:**
- Consumes: Task 1's `Expense.walletId`, Task 2's `DebtEntry.expenseId`.
- Produces: `reverseMoves(moveIds: string[], seedDeltas?: Record<string, number>) => Promise<void>`; `deleteExpense` returns `Promise<boolean>` — `false` means it refused because a linked debt is batch-settled.

- [ ] **Step 1: Let `reverseMoves` start from a seed**

Change the signature and seed the accumulator. The existing per-wallet accumulation then covers the expense refund and every movement in one pass:

```ts
  // `seedDeltas` lets a caller fold in a balance change that is not itself a
  // money_move — an expense refund — so it lands in the SAME accumulation as the
  // movements. Patching the wallet separately would read a stale balanceOf.
  const reverseMoves = async (moveIds: string[], seedDeltas?: Record<string, number>) => {
    const ids = moveIds.filter(Boolean);
    const targets = moneyMoves.filter(m => ids.includes(m.id));
    if (targets.length === 0 && !seedDeltas) return;

    const deltas: Record<string, number> = { ...(seedDeltas ?? {}) };
    for (const mv of targets) {
      deltas[mv.walletId] = (deltas[mv.walletId] ?? 0)
        + (mv.kind === 'debt_in' ? -mv.amount : mv.amount);
    }
```

Leave the rest of the function exactly as it is, except guard the delete against an empty id list:

```ts
    await Promise.all([
      ...(ids.length > 0 ? [supabase.from('money_moves').delete().in('id', ids)] : []),
      ...Object.entries(newBalances).map(([wid, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', wid)
      ),
    ]);
```

Note the early return changed: it must no longer bail when `ids` is empty, because a wallet-less expense with no movements still needs its seed applied. The `targets.length === 0 && !seedDeltas` form handles both.

- [ ] **Step 2: Rewrite `deleteExpense` to take its debt rows with it**

```ts
  // Returns false when it refuses. The linked rows exist only because of this
  // expense, so they go with it — but a row settled through a wallet owns no
  // share of its batch's netted movement, so it cannot be handed back. The
  // caller reopens the settle-up first, exactly as the debt board's own trash
  // does, rather than refusing in silence.
  const deleteExpense = async (id: string): Promise<boolean> => {
    const found = expenses.find(e => e.id === id);
    if (!found) return false;

    const linked = debtEntries.filter(d => d.expenseId === id);
    if (linked.some(d => d.settleMoveId)) return false;

    const seed: Record<string, number> = {};
    if (found.walletId) seed[found.walletId] = found.amount;

    const linkedIds = linked.map(d => d.id);
    const moveIds = linked.map(d => d.moveId).filter((m): m is string => Boolean(m));

    setExpenses(prev => prev.filter(e => e.id !== id));
    setDebtEntries(prev => prev.filter(d => !linkedIds.includes(d.id)));

    await Promise.all([
      supabase.from('expenses').delete().eq('id', id),
      ...(linkedIds.length > 0
        ? [supabase.from('debt_entries').delete().in('id', linkedIds)]
        : []),
    ]);

    // One call, one balance computation per wallet — the refund and every
    // linked movement together.
    await reverseMoves(moveIds, seed);
    return true;
  };
```

- [ ] **Step 3: Update the context type**

In `AppContextValue`, change `deleteExpense` to `(id: string) => Promise<boolean>`.

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`.

- [ ] **Step 5: Manual pass — the balance arithmetic, written down before you start**

You cannot create a split from the UI yet, so verify the ordinary path and the trap separately.

Ordinary: note GCash's balance. Log a ₱100 expense from GCash → balance drops ₱100. Delete it → balance returns to exactly the starting figure, to the centavo.

The trap, via the debt board (two entries on **one** wallet, which is what makes a stale read visible): note GCash's balance `B`. On `/debts`, add two ₱200 "they owe me" entries against GCash. Balance must read `B − 400`, not `B − 200`. Delete the person. Balance must return to exactly `B`. **If it lands at `B − 200`, a stale `balanceOf` is being read and the fix is wrong — stop and re-read `AppContext.tsx:743-751`.**

- [ ] **Step 6: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "fix: deleting a split expense unwinds every balance in one pass"
```

---

### Task 5: The split sub-sheet

A self-contained component. It owns no persistence — it hands a funding description back to the caller and closes.

**Files:**
- Create: `src/components/SplitSheet.tsx`
- Reference (do not modify): `src/components/BottomSheet.tsx`, `src/components/AddDebtSheet.tsx` (person-picker markup to copy)

**Interfaces:**
- Consumes: `useApp()` for `debtPeople`, `addDebtPerson`, `settings`; `BottomSheet`; `fmt`.
- Produces:
  ```ts
  export interface SplitResult {
    mode: 'wallet' | 'person';
    paidByPersonId: string | null;                    // set when mode === 'person'
    owedToMe: { personId: string; amount: number }[]; // set when mode === 'wallet'
  }
  export default function SplitSheet(props: {
    total: number;
    currency: string;
    initial: SplitResult | null;
    onClose: () => void;
    onApply: (r: SplitResult) => void;
  }): JSX.Element
  ```

- [ ] **Step 1: Write the even-split helper**

Put this at the top of the new file. The remainder-cents handling is the reason it exists — `1000 / 3` must not produce three ₱333.33 shares that lose a centavo:

```ts
// Split `total` into `n` parts at 2 decimals. Remainder cents go to the earliest
// parts so the parts always sum back to exactly `total`.
export function splitEvenly(total: number, n: number): number[] {
  if (n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const extra = cents - base * n;
  return Array.from({ length: n }, (_, i) => (base + (i < extra ? 1 : 0)) / 100);
}
```

- [ ] **Step 2: Build the sheet**

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import BottomSheet from './BottomSheet';

export interface SplitResult {
  mode: 'wallet' | 'person';
  paidByPersonId: string | null;
  owedToMe: { personId: string; amount: number }[];
}

interface Props {
  total: number;
  currency: string;
  initial: SplitResult | null;
  onClose: () => void;
  onApply: (r: SplitResult) => void;
}

export default function SplitSheet({ total, currency, initial, onClose, onApply }: Props) {
  const { debtPeople } = useApp();

  const [mode, setMode] = useState<'wallet' | 'person'>(initial?.mode ?? 'wallet');
  const [paidBy, setPaidBy] = useState<string | null>(initial?.paidByPersonId ?? null);
  const [rows, setRows] = useState<{ personId: string; amount: string }[]>(
    initial?.owedToMe.map(o => ({ personId: o.personId, amount: String(o.amount) })) ?? [],
  );

  const owedTotal = rows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const myShare = mode === 'wallet' ? total - owedTotal : total;
  // Over-allocating is the only way to make this incoherent, so it is the only
  // thing blocked. A share of exactly zero is legitimate: you spotted them.
  const valid = mode === 'person'
    ? paidBy !== null
    : rows.length > 0 && rows.every(r => (parseFloat(r.amount) || 0) > 0) && myShare >= 0;

  const addRow = (personId: string) => {
    if (rows.some(r => r.personId === personId)) return;
    setRows(prev => [...prev, { personId, amount: '' }]);
  };

  const evenly = () => {
    const parts = splitEvenly(total, rows.length + 1); // +1 for you
    setRows(prev => prev.map((r, i) => ({ ...r, amount: String(parts[i + 1]) })));
  };

  const nameOf = (id: string) => debtPeople.find(p => p.id === id)?.name ?? 'someone';
  const emojiOf = (id: string) => debtPeople.find(p => p.id === id)?.emoji ?? '🧑';

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">Who&apos;s in on this?</p>
      <p className="text-xs text-slate-500 mb-4">{fmt(total, currency)} total</p>

      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setMode('wallet')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            mode === 'wallet'
              ? 'border-blue-500 bg-blue-500/15 text-white'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          I paid
        </button>
        <button
          onClick={() => setMode('person')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            mode === 'person'
              ? 'border-blue-500 bg-blue-500/15 text-white'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          Someone paid
        </button>
      </div>

      {mode === 'person' ? (
        <>
          <p className="text-xs text-slate-500 mb-2">Paid by</p>
          <div className="flex flex-wrap gap-2 mb-3">
            {debtPeople.map(p => (
              <button
                key={p.id}
                onClick={() => setPaidBy(p.id)}
                className={`flex max-w-full min-w-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  paidBy === p.id
                    ? 'border-blue-500 bg-blue-500/15 text-white'
                    : 'border-[#1e2d40] bg-white/5 text-slate-400'
                }`}
              >
                <span className="shrink-0">{p.emoji}</span>
                <span className="truncate">{p.name}</span>
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-600">
            No wallet moves. You owe {paidBy ? nameOf(paidBy) : 'them'} {fmt(total, currency)}.
          </p>
        </>
      ) : (
        <>
          <p className="text-xs text-slate-500 mb-2">Owes me</p>
          {rows.map((r, i) => (
            <div key={r.personId} className="flex items-center gap-2 mb-2">
              <span className="shrink-0">{emojiOf(r.personId)}</span>
              <span className="flex-1 min-w-0 truncate text-sm text-white">{nameOf(r.personId)}</span>
              <input
                type="number"
                inputMode="decimal"
                value={r.amount}
                onChange={ev => setRows(prev =>
                  prev.map((x, j) => j === i ? { ...x, amount: ev.target.value } : x))}
                placeholder="0.00"
                className="w-24 rounded-lg bg-white/5 border border-[#1e2d40] px-2.5 py-1.5 text-sm text-white text-right outline-none focus:border-blue-500/50"
              />
              <button
                onClick={() => setRows(prev => prev.filter((_, j) => j !== i))}
                className="text-slate-500 px-1"
                aria-label={`Remove ${nameOf(r.personId)}`}
              >
                ✕
              </button>
            </div>
          ))}

          <div className="flex flex-wrap gap-2 mt-3 mb-3">
            {debtPeople
              .filter(p => !rows.some(r => r.personId === p.id))
              .map(p => (
                <button
                  key={p.id}
                  onClick={() => addRow(p.id)}
                  className="flex items-center gap-1.5 rounded-lg border border-dashed border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-blue-400"
                >
                  <span>{p.emoji}</span>
                  <span className="truncate">+ {p.name}</span>
                </button>
              ))}
            {rows.length > 0 && (
              <button
                onClick={evenly}
                className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1.5 text-xs text-slate-300"
              >
                Split evenly
              </button>
            )}
          </div>

          <div className="flex justify-between border-t border-[#1e2d40] pt-3 text-sm">
            <span className="text-slate-400">Your share</span>
            <span className={`font-semibold tabular-nums ${myShare < 0 ? 'text-red-400' : 'text-white'}`}>
              {fmt(myShare, currency)}
            </span>
          </div>
          {myShare < 0 && (
            <p className="mt-1 text-[11px] text-red-400">
              That is more than the total.
            </p>
          )}
        </>
      )}

      <button
        onClick={() => onApply({
          mode,
          paidByPersonId: mode === 'person' ? paidBy : null,
          owedToMe: mode === 'wallet'
            ? rows.map(r => ({ personId: r.personId, amount: parseFloat(r.amount) || 0 }))
            : [],
        })}
        disabled={!valid}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        Done
      </button>
    </BottomSheet>
  );
}
```

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`.

- [ ] **Step 4: Commit**

```bash
git add src/components/SplitSheet.tsx
git commit -m "feat: a sheet for saying who else was in on an expense"
```

---

### Task 6: Wire the Split chip into the expense modal

**Files:**
- Modify: `src/app/expenses/new/page.tsx` (wallet strip ~86-120, `canSubmit` ~39, `handleSubmit` ~51, submit button ~174)

**Interfaces:**
- Consumes: Task 5's `SplitSheet` and `SplitResult`; Task 3's `addExpense`.
- Produces: nothing downstream.

- [ ] **Step 1: Add state and the import**

```tsx
import SplitSheet, { SplitResult } from '@/components/SplitSheet';
```

```tsx
  const [split,     setSplit]     = useState<SplitResult | null>(null);
  const [splitOpen, setSplitOpen] = useState(false);
```

- [ ] **Step 2: Add the chip to the wallet strip**

Immediately after the `{wallets.map(...)}` block inside the scrolling strip, add:

```tsx
                <button
                  onClick={() => setSplitOpen(true)}
                  className={`flex items-center gap-2 rounded-full shrink-0 pl-2.5 pr-3.5 py-2 border transition-colors ${
                    split
                      ? 'border-blue-500 bg-blue-500/15'
                      : 'border-dashed border-[#1e2d40] bg-white/5'
                  }`}
                >
                  <span className="text-base leading-none">🤝</span>
                  <div className="text-left">
                    <p className={`text-xs font-medium leading-tight ${split ? 'text-blue-300' : 'text-white'}`}>
                      Split
                    </p>
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {split
                        ? split.mode === 'person' ? 'someone paid' : `${split.owedToMe.length} owe you`
                        : 'with someone'}
                    </p>
                  </div>
                </button>
```

- [ ] **Step 3: Render the sheet**

Just before the closing `</div>` of the outermost `fixed inset-0` wrapper:

```tsx
        {splitOpen && (
          <SplitSheet
            total={parseFloat(input) || 0}
            currency={settings.currency}
            initial={split}
            onClose={() => setSplitOpen(false)}
            onApply={r => {
              // An empty wallet-mode result means "never mind" — clear it so the
              // chip goes back to its resting state rather than claiming a split
              // of nobody.
              setSplit(r.mode === 'wallet' && r.owedToMe.length === 0 ? null : r);
              setSplitOpen(false);
            }}
          />
        )}
```

- [ ] **Step 4: Teach `canSubmit` and `handleSubmit` about it**

When someone else paid, no wallet is needed:

```tsx
  const needsWallet = !split || split.mode === 'wallet';
  const canSubmit = parseFloat(input) > 0 && category !== null
    && (!needsWallet || walletId !== '');
```

```tsx
  const handleSubmit = () => {
    if (!canSubmit || !category) return;
    addExpense({
      amount: parseFloat(input),
      category,
      note: note.trim(),
      walletId: split?.mode === 'person' ? null : walletId,
      paidByPersonId: split?.mode === 'person' ? split.paidByPersonId : null,
      owedToMe: split?.mode === 'wallet' ? split.owedToMe : [],
    });
    router.back();
  };
```

- [ ] **Step 5: Make the button say what will happen**

Replace the button's label expression:

```tsx
            {!canSubmit
              ? 'Log Expense'
              : split?.mode === 'person'
                ? `Log · owe ${split.owedToMe.length === 0 ? 'them' : ''}`.trim()
                : split
                  ? `Log · ${fmt(
                      parseFloat(input) - split.owedToMe.reduce((s, o) => s + o.amount, 0),
                      settings.currency,
                    )} of ${fmt(parseFloat(input), settings.currency)}`
                  : `Log · ${selectedWallet ? selectedWallet.name : ''}`}
```

- [ ] **Step 6: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`. Build prerenders all 13 routes.

- [ ] **Step 7: Manual pass — the spec's case table, end to end**

Run `npm run dev`. You need at least two people on `/debts` first (add them there if the board is empty). Note GCash's balance as `B` before each case and check it after.

1. **Normal expense.** ₱1,000, Food, GCash, no split → wallet `B − 1000`, expense ₱1,000 on `/transactions`, no new debt row.
2. **Shared meal.** ₱1,500, Food, GCash, Split → I paid → John ₱500, Mia ₱500. "Your share" must read ₱500. Log it. Wallet must read `B − 1500`. `/transactions` shows a ₱500 Food expense. `/debts` shows John and Mia each owing ₱500.
3. **Someone paid.** ₱300, Food, Split → Someone paid → John. The wallet strip requirement must drop away. Log it. **Every wallet balance is unchanged.** `/transactions` shows a ₱300 Food expense. `/debts` shows you owing John ₱300.
4. **Spotted entirely.** ₱500, Food, GCash, Split → I paid → John ₱500. "Your share" reads ₱0. Log it. Wallet reads `B − 500`, `/debts` shows John owing ₱500, and **no ₱500 Food expense appears** on `/transactions`.
5. **Split evenly.** ₱1,000, add John and Mia, tap Split evenly → each reads ₱333.33 and your share reads ₱333.34 (the remainder cent is yours). The three must sum to exactly ₱1,000.
6. **Over-allocation is blocked.** ₱100 with John owed ₱200 → "Your share" turns red and Done is disabled.

- [ ] **Step 8: Commit**

```bash
git add src/app/expenses/new/page.tsx
git commit -m "feat: log an expense someone else paid for, or split it"
```

---

### Task 7: Show who paid, where the wallet name used to go

Without this, an expense someone else paid for reads with a blank subtitle and looks broken.

**Files:**
- Modify: `src/app/transactions/page.tsx` (~51-75)
- Modify: `src/components/CategoryDetailSheet.tsx` (~52, ~174)

**Interfaces:**
- Consumes: Task 1's `DebtEntry.expenseId`.
- Produces: nothing downstream.

- [ ] **Step 1: Add a funding-label helper to `transactions/page.tsx`**

Beside the existing `walletName` (~51), and pull `debtEntries`/`debtPeople` from `useApp()` at ~40:

```tsx
  // A wallet-less expense was paid by someone else; name them where the wallet
  // name would otherwise go, so the subtitle is never blank.
  const fundedBy = (e: { id: string; walletId: string | null }) => {
    if (e.walletId) return walletName(e.walletId);
    const link = debtEntries.find(d => d.expenseId === e.id);
    const person = link && debtPeople.find(p => p.id === link.personId);
    return person ? `paid by ${person.name}` : '';
  };
```

- [ ] **Step 2: Use it in the expense feed row**

At ~75, replace `walletName(e.walletId)`:

```tsx
        sub: subtitle(e.note, fundedBy(e)),
```

Add `debtEntries` and `debtPeople` to the `useMemo` dependency array at ~132.

- [ ] **Step 3: Do the same in `CategoryDetailSheet.tsx`**

Add the identical `fundedBy` helper beside `walletName` (~52), pulling `debtEntries`/`debtPeople` from `useApp()`, then at ~174 replace:

```tsx
                  const wallet = fundedBy(e);
```

- [ ] **Step 4: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`.

- [ ] **Step 5: Manual pass**

Run `npm run dev`. The ₱300 expense from Task 6 case 3 must read `paid by John` on `/transactions` where a wallet name would normally sit. Open the Food category card on the budget page and confirm the same row reads `<date> · paid by John`. Ordinary expenses must still show their wallet name.

- [ ] **Step 6: Commit**

```bash
git add src/app/transactions/page.tsx src/components/CategoryDetailSheet.tsx
git commit -m "feat: an expense a friend covered says so instead of showing nothing"
```

---

### Task 8: Give the debt sheet its optional wallet back

The last piece of the spec: a pre-existing debt is an opening balance, not a movement. The data model always allowed it; only `AddDebtSheet` closed it off.

**Files:**
- Modify: `src/components/AddDebtSheet.tsx` (~36, ~183-194)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing downstream.

- [ ] **Step 1: Drop the wallet from `canSave`**

```tsx
  const canSave = validPerson && !isNaN(amountValue) && amountValue > 0 && !saving;
```

- [ ] **Step 2: Add the "no wallet" choice**

Replace the wallet block's trailing hint (~188-194) with a clearable option and honest copy:

```tsx
      <WalletPicker value={walletId} onChange={setWalletId} />
      <button
        onClick={() => setWalletId('')}
        className={`mt-2 w-full rounded-xl border px-3 py-2.5 text-sm transition-colors ${
          walletId === ''
            ? 'border-blue-500 bg-blue-500/15 text-white'
            : 'border-[#1e2d40] bg-white/5 text-slate-400'
        }`}
      >
        No wallet — this already happened
      </button>
      <p className="mt-2 text-[11px] text-slate-600">
        {walletId === ''
          ? 'Records the debt only. No balance moves — use this for money that changed hands before you tracked it.'
          : direction === 'owed_to_me'
            ? `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} leaves this wallet now.`
            : `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} enters this wallet now.`}
      </p>
```

- [ ] **Step 3: Verify**

Run:
```bash
npx tsc --noEmit
npm run lint
npm run build
```
Expected: `tsc` exits 0. Lint reads `✖ 8 problems (2 errors, 6 warnings)`. Build prerenders all 13 routes.

- [ ] **Step 4: Manual pass**

Run `npm run dev`, open `/debts`. Note every wallet balance. Add a ₱5,000 "I owe them" entry with **No wallet** selected. The row must appear on the board and **every wallet balance must be unchanged**. Then add a ₱200 entry *with* a wallet and confirm that one still moves the balance as it always did.

- [ ] **Step 5: Commit**

```bash
git add src/components/AddDebtSheet.tsx
git commit -m "feat: record a debt that already happened without moving a balance"
```

---

## Plan self-review

**Spec coverage.** Model/formula → Task 3. Schema → Task 1 and 2 (migration pre-applied). UI layout B → Tasks 5 and 6. Even split with remainder cents → Task 5 Step 1, verified in Task 6 case 5. Zero-share creates no expense → Task 3 Step 1, verified in Task 6 case 4. Settling never touches the expense → no code needed; `setDebtEntrySettled` does not read `expenseId`, confirmed by inspection. Delete expense removes linked rows and refuses on batch-settled → Task 4. Deleting one debt row leaves the expense alone → no code needed; `deleteDebtEntry` does not touch expenses. The `reverseMoves` trap → Task 4, with a failure signature written into its manual pass. Display sites → Task 7. Debt-sheet boundary and optional wallet → Task 8.

**Known gap, deliberately left.** The spec's refusal path in Task 4 returns `false`, but no caller surfaces it yet — there is no delete-expense affordance on a split expense in this plan's UI. The refusal is in place so the data can never be corrupted; wiring a "Reopen this settle-up?" prompt to it belongs with whatever UI first offers that delete. Flagged here so it is a decision, not an oversight.

**Correction found during review.** An earlier draft told Task 3 to use "the `round2` helper already in `AppContext`". It is not there — it is a module-private const in `SettleUpSheet.tsx:11`, so that code would not have compiled. Task 1 Step 5 now moves and exports it, and Task 3 declares the dependency.

**Type consistency.** `SplitResult` is defined once in Task 5 and consumed unchanged in Task 6. `addExpense`'s object is identical in Task 3 Steps 1 and 2 and in Task 6 Step 4. `reverseMoves(moveIds, seedDeltas?)` is defined in Task 4 Step 1 and called in Step 2. `expenseId` is spelled the same in Tasks 1, 2, 3 and 7; the column is `expense_id` at every Supabase boundary.
