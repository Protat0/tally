# Debt–Wallet Linkage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a debt entry optionally carry a wallet, so a wallet balance moves when the money actually moves — on creation, on settle-up, and in reverse when any of it is undone.

**Architecture:** Two new `MoneyMoveKind` values (`debt_out`, `debt_in`) record the movement as a normal `money_moves` row, excluded from every spent/earned total the way `moved` already is. Three nullable columns on `debt_entries` (`wallet_id`, `move_id`, `settle_move_id`) tie a debt to the rows it caused, which is what makes full reversal possible. A settle-up nets its entries into **one** movement shared by the whole batch, so the batch is the unit of reversal.

**Tech Stack:** Next.js 16.2.4 (Turbopack, App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (`@supabase/supabase-js`).

**Spec:** `docs/superpowers/specs/2026-08-09-debt-wallet-linkage-design.md`

---

## Global Constraints

- **No test framework exists.** `package.json` defines only `build` (`next build`) and `lint` (`eslint`). Every task verifies with `npm run build`, `npm run lint`, and a named manual check. **Do not add a test framework — it is out of scope.**
- **Lint baseline.** `npm run lint` reports **2 errors and 6 warnings**, all pre-existing in `src/components/AppContext.tsx` and `src/app/auth/page.tsx` / `src/app/page.tsx`. A task passes if it introduces nothing beyond this baseline. **Do not fix the baseline issues — out of scope.**
- **This is NOT the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches framework APIs. This plan touches only client components, already used throughout.
- **All new components are client components** — start every new file with `'use client';`.
- **Preserve the existing dark palette exactly:** surface `bg-[#111827]`, border `border-[#1e2d40]`, page background `bg-[#0b0f1a]`, accent `blue-600`/`blue-400`, positive `emerald-400`, negative `red-400`.
- **Money is always rendered with `fmt(amount, currency)`** from `AppContext`, where `currency` comes from `settings.currency`. Never hardcode `₱`.
- **The migration in Task 1 must be run by the user in the Supabase SQL editor before any later task can be manually verified.** Ask them to run it; do not attempt to apply it programmatically.
- **Kind values are exactly `'debt_out'` and `'debt_in'`** — used in the DB check constraint, the TypeScript union, the reversal sign logic and the Activity page. Do not invent variants.
- **A blank wallet stays valid everywhere and is the default.** Never make the wallet picker required.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/components/SettleUpSheet.tsx` | Settle-up confirmation: shows the net, offers an optional wallet |

**Modify:**

| File | Change |
|---|---|
| `src/components/AppContext.tsx` | New kinds, three `DebtEntry` fields, `recordMove` returns an id and accepts a date, `reverseMoves` primitive, rewritten debt CRUD |
| `src/components/AddDebtSheet.tsx` | Optional wallet picker, direction-aware label |
| `src/components/DebtPersonSection.tsx` | "Settle up" opens the sheet; un-ticking a batched row confirms and reverses |
| `src/app/transactions/page.tsx` | Render the two new kinds instead of falling through to "Transfer" |

**Unchanged:** `src/app/debts/page.tsx`, `DebtSummary.tsx`, `DebtEntryRow.tsx`, `BottomSheet.tsx`, all wallet/expense logic.

---

## Design Decisions (already settled — do not relitigate)

- **The wallet is optional on both directions.** `owed_to_me` + wallet = money out; `i_owe` + wallet = money in (they lent you cash). Blank = they paid the vendor directly, no movement.
- **Only "Settle up" moves money.** The per-row check tick stays a one-tap bookkeeping toggle.
- **Settle-up moves the NET**, not any row's face value, and `net === 0` creates no movement at all.
- **The batch is the unit of reversal.** Un-ticking any row from a wallet-linked settle-up reopens the whole batch.
- **New kinds count toward neither spent nor earned.** Lending is not consumption; a repayment is not income.
- **Out of scope:** splitting an expense across people, partial repayment, wiring `deleteMoneyMove` into the Activity UI.

---

### Task 1: Migration + types, mappers and the reversal primitive

Nothing changes behaviourally. This task makes the columns available and adds the two
helpers the later tasks build on.

**Files:**
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Produces, exported from `AppContext`:
  - `MoneyMoveKind` extended with `'debt_out' | 'debt_in'`
  - `DebtEntry` extended with `walletId: string | null; moveId: string | null; settleMoveId: string | null`
- Produces, internal to `AppProvider`:
  - `recordMove(move, balanceUpdates, date?): Promise<string | null>` — now returns the inserted row id
  - `reverseMoves(moveIds: string[]): Promise<void>`

- [ ] **Step 1: Ask the user to run the migration**

Post this to the user and wait for them to confirm it succeeded. Do not proceed until
they do — every later manual check depends on it.

**Paste the whole block.** Postgres parses the entire batch before executing any of it,
so a truncated paste rejects everything with a `42601` syntax error pointing at the
line *after* the cut, which reads like a bug in the SQL rather than a short paste.

```sql
do $$
declare c record;
begin
  for c in
    select conname from pg_constraint
    where conrelid = 'money_moves'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%kind%'
  loop
    execute format('alter table money_moves drop constraint %I', c.conname);
  end loop;
end $$;

alter table money_moves add constraint money_moves_kind_check
  check (kind in ('earned', 'withdrawn', 'moved', 'debt_out', 'debt_in'));

alter table debt_entries
  add column if not exists wallet_id      uuid references wallets(id) on delete set null,
  add column if not exists move_id        uuid references money_moves(id) on delete set null,
  add column if not exists settle_move_id uuid references money_moves(id) on delete set null;

create index if not exists debt_entries_settle_move_idx
  on debt_entries (settle_move_id) where settle_move_id is not null;
```

Expect "Success. No rows returned" — normal for DDL.

The `do $$ ... $$` block drops any existing check constraint on `money_moves` that
mentions `kind`, whatever it is named. The original `money_moves` DDL was applied by
hand and is not in the repo, so its constraint name is unknown.

- [x] **Step 2: Extend `MoneyMoveKind`**

In `src/components/AppContext.tsx`, replace the `MoneyMoveKind` line (~line 32):

```tsx
// debt_out / debt_in — a debt board movement. Excluded from earned and spent
// totals: lending is not consumption and a repayment is not income. Both are
// your own money changing location.
export type MoneyMoveKind = 'earned' | 'withdrawn' | 'moved' | 'debt_out' | 'debt_in';
```

- [x] **Step 3: Extend the `DebtEntry` interface**

Replace the `DebtEntry` interface:

```tsx
export interface DebtEntry {
  id: string; personId: string; direction: DebtDirection;
  amount: number; note: string; date: string;
  settledAt: string | null;      // null means open
  walletId: string | null;       // wallet the creation movement hit; null = none
  moveId: string | null;         // money_moves row created at creation
  settleMoveId: string | null;   // shared by every entry in one settle-up batch
}
```

- [x] **Step 4: Map the new columns**

Replace `fromDBDebtEntry`:

```tsx
const fromDBDebtEntry  = (r: Row): DebtEntry => ({
  id: r.id, personId: r.person_id,
  direction: r.direction as DebtDirection,
  amount: Number(r.amount), note: r.note || '',
  date: r.date, settledAt: r.settled_at ?? null,
  walletId: r.wallet_id ?? null,
  moveId: r.move_id ?? null,
  settleMoveId: r.settle_move_id ?? null,
});
```

- [x] **Step 5: Make `recordMove` return the new row's id and accept a date**

Replace the `recordMove` signature and its final block. Existing callers pass two
arguments and ignore the return value, so they are unaffected.

```tsx
  const recordMove = async (
    move: Omit<MoneyMove, 'id' | 'date'>,
    balanceUpdates: Record<string, number>,
    date?: string,
  ): Promise<string | null> => {
    if (!userId) return null;
    // Debt movements are dated to the debt itself, which may be days ago.
    const now = date ?? new Date().toISOString();
    const tempId = crypto.randomUUID();

    setMoneyMoves(prev => [{ ...move, id: tempId, date: now }, ...prev]);
    setWallets(prev => prev.map(w => w.id in balanceUpdates ? { ...w, balance: balanceUpdates[w.id] } : w));

    const [moveRes] = await Promise.all([
      supabase.from('money_moves').insert({
        user_id: userId, kind: move.kind, amount: move.amount,
        wallet_id: move.walletId, to_wallet_id: move.toWalletId,
        source: move.source, note: move.note, date: now,
      }).select().single(),
      ...Object.entries(balanceUpdates).map(([id, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', id)
      ),
    ]);
    if (moveRes.data) {
      setMoneyMoves(prev => prev.map(m => m.id === tempId ? fromDBMoneyMove(moveRes.data) : m));
      return moveRes.data.id as string;
    }
    return null;
  };
```

- [x] **Step 6: Add the `reverseMoves` primitive**

Place immediately after `deleteMoneyMove`. **Read the comment before changing this —
the accumulation is not optional.**

```tsx
  // ── Debt board ────────────────────────────────────────────────────────────
  // Undo a set of debt movements: put the money back and delete the records.
  //
  // Deltas are summed per wallet BEFORE any balance is computed. `balanceOf`
  // reads React state, which does not update between iterations of a loop, so
  // reversing moves one at a time would compute every new balance from the same
  // stale figure and the last write would win — silently corrupting the balance
  // whenever one wallet is hit twice (deleting a person with two linked entries
  // on the same wallet does exactly that).
  const reverseMoves = async (moveIds: string[]) => {
    const ids = moveIds.filter(Boolean);
    if (ids.length === 0) return;
    const targets = moneyMoves.filter(m => ids.includes(m.id));
    if (targets.length === 0) return;

    const deltas: Record<string, number> = {};
    for (const mv of targets) {
      deltas[mv.walletId] = (deltas[mv.walletId] ?? 0)
        + (mv.kind === 'debt_in' ? -mv.amount : mv.amount);
    }

    const newBalances: Record<string, number> = {};
    for (const [wid, d] of Object.entries(deltas)) newBalances[wid] = balanceOf(wid) + d;

    setMoneyMoves(prev => prev.filter(m => !ids.includes(m.id)));
    setWallets(prev => prev.map(w => w.id in newBalances ? { ...w, balance: newBalances[w.id] } : w));

    await Promise.all([
      supabase.from('money_moves').delete().in('id', ids),
      ...Object.entries(newBalances).map(([wid, balance]) =>
        supabase.from('wallets').update({ balance }).eq('id', wid)
      ),
    ]);
  };
```

- [x] **Step 7: Keep the existing optimistic insert compiling**

`addDebtEntry` builds its optimistic row from `{ ...e, id, settledAt: null }`, which no
longer satisfies `DebtEntry` now that three fields exist. Add them so the file
type-checks; Task 2 rewrites this function entirely.

```tsx
    setDebtEntries(prev => [{
      ...e, id: tempId, settledAt: null,
      walletId: null, moveId: null, settleMoveId: null,
    }, ...prev]);
```

- [x] **Step 8: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint shows exactly the 2 errors / 6 warnings baseline.

Manual check — open `/debts` and confirm existing entries still render, settle and
delete exactly as before. Nothing about the UI has changed yet. If the page 404s from
Supabase, the Step 1 migration has not been run.

- [x] **Step 9: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: debt movement kinds, linkage columns and reversal primitive"
```

---

### Task 2: Wallet linkage on creation

**Files:**
- Modify: `src/components/AppContext.tsx`, `src/components/AddDebtSheet.tsx`

**Interfaces:**
- Consumes: `recordMove` (returns id), `DebtEntry` fields from Task 1.
- Produces: `addDebtEntry(e: { personId, direction, amount, note, date, walletId? })` on the `useApp()` value, where `walletId?: string | null`.

- [x] **Step 1: Rewrite `addDebtEntry`**

Replace the whole function. Note it is **no longer optimistic**: with a wallet set it
must await the move to learn its id, and running two code paths — one optimistic, one
not — is more bug surface than the sheet's existing "Saving…" state is worth.

```tsx
  const addDebtEntry = async (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
  }) => {
    if (!userId) return;
    const walletId = e.walletId || null;
    const name = debtPeople.find(p => p.id === e.personId)?.name ?? 'someone';

    // The movement is inserted first so the entry can reference it. A failure
    // between the two leaves a bare movement in the feed — visible and
    // deletable — rather than an entry claiming a movement that never happened.
    let moveId: string | null = null;
    if (walletId) {
      const out = e.direction === 'owed_to_me';
      moveId = await recordMove(
        {
          kind: out ? 'debt_out' : 'debt_in',
          amount: e.amount, walletId, toWalletId: null, source: null,
          note: out ? `Spotted ${name}` : `Borrowed from ${name}`,
        },
        { [walletId]: balanceOf(walletId) + (out ? -e.amount : e.amount) },
        e.date,
      );
    }

    const { data } = await supabase.from('debt_entries').insert({
      user_id: userId, person_id: e.personId, direction: e.direction,
      amount: e.amount, note: e.note, date: e.date,
      wallet_id: walletId, move_id: moveId,
    }).select().single();

    if (data) setDebtEntries(prev => [fromDBDebtEntry(data), ...prev]);
  };
```

- [x] **Step 2: Widen the context type**

In `interface AppContextValue`, replace the `addDebtEntry` entry:

```tsx
  addDebtEntry: (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
  }) => Promise<void>;
```

- [x] **Step 3: Add the wallet picker to `AddDebtSheet`**

Pull `wallets` and `settings` from the hook — replace the destructure at the top of
the component:

```tsx
  const { debtPeople, addDebtPerson, addDebtEntry, wallets, settings } = useApp();
```

Add state beside the others:

```tsx
  const [walletId, setWalletId] = useState<string>('');
```

Insert this block after the Date input and before the save button:

```tsx
      {/* Wallet — optional. Blank means no tracked wallet was involved. */}
      <p className="text-xs text-slate-500 mt-4 mb-2">
        {direction === 'owed_to_me' ? 'Paid from' : 'Received into'}
        <span className="text-slate-600"> · optional</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => setWalletId('')}
          className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
            walletId === ''
              ? 'border-blue-500 bg-blue-500/15 text-white'
              : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
          }`}
        >
          No wallet
        </button>
        {wallets.map(w => (
          <button
            key={w.id}
            onClick={() => setWalletId(w.id)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              walletId === w.id
                ? 'border-blue-500 bg-blue-500/15 text-white'
                : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
            }`}
          >
            <span>{w.icon}</span>{w.name}
          </button>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-slate-600">
        {walletId === ''
          ? 'No balance will change. Pick a wallet if the money left or entered one.'
          : direction === 'owed_to_me'
            ? `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} leaves this wallet now.`
            : `${fmt(amountValue > 0 ? amountValue : 0, settings.currency)} enters this wallet now.`}
      </p>
```

Add `fmt` to the `AppContext` import on line 4:

```tsx
import { useApp, fmt, DebtDirection } from './AppContext';
```

- [x] **Step 4: Pass the wallet through on save**

In `handleSave`, add `walletId` to the `addDebtEntry` call:

```tsx
    await addDebtEntry({
      personId: targetId,
      direction,
      amount: amountValue,
      note: note.trim(),
      // Midday avoids the entry sliding to the previous day in UTC.
      date: new Date(`${date}T12:00:00`).toISOString(),
      walletId: walletId || null,
    });
```

- [x] **Step 5: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline.

Manual check — note your GCash balance. On `/debts`, add "They owe me ₱250, Ramen
lunch" with **GCash** selected. GCash drops by ₱250 and the Activity page shows a new
row for it (mislabelled "Transfer 🔄" for now — Task 4 fixes the label). Add a second
debt with **No wallet** selected and confirm no balance moves. Add an "I owe them ₱500"
with a wallet and confirm that wallet *rises* by ₱500.

- [x] **Step 6: Commit**

```bash
git add src/components/AppContext.tsx src/components/AddDebtSheet.tsx
git commit -m "feat: optional wallet on debt creation"
```

---

### Task 3: Settle-up sheet

**Files:**
- Create: `src/components/SettleUpSheet.tsx`
- Modify: `src/components/AppContext.tsx`, `src/components/DebtPersonSection.tsx`

**Interfaces:**
- Consumes: `netOf`, `recordMove`, `DebtPerson` from Task 1.
- Produces:
  - `settleUpPerson(personId: string, walletId?: string | null): Promise<void>`
  - `SettleUpSheet({ person, net, currency, onClose })` — default export

- [x] **Step 1: Rewrite `settleUpPerson`**

Replace the whole function:

```tsx
  // Clears every open entry for one person. With a wallet, the NET moves — not
  // any row's face value — because squaring up is one exchange of one amount.
  // A zero net means the entries cancel out and no money changes hands.
  const settleUpPerson = async (personId: string, walletId?: string | null) => {
    const open = debtEntries.filter(e => e.personId === personId && !e.settledAt);
    if (open.length === 0) return;

    const net = netOf(open);
    const settledAt = new Date().toISOString();
    const name = debtPeople.find(p => p.id === personId)?.name ?? 'someone';

    let moveId: string | null = null;
    if (walletId && net !== 0) {
      const incoming = net > 0;
      const amount = Math.abs(net);
      moveId = await recordMove(
        {
          kind: incoming ? 'debt_in' : 'debt_out',
          amount, walletId, toWalletId: null, source: null,
          note: incoming ? `${name} settled up` : `Settled up with ${name}`,
        },
        { [walletId]: balanceOf(walletId) + (incoming ? amount : -amount) },
      );
    }

    setDebtEntries(prev => prev.map(
      e => e.personId === personId && !e.settledAt
        ? { ...e, settledAt, settleMoveId: moveId }
        : e
    ));

    // Still filtered on the server by `settled_at is null` — the local state
    // above has changed but the rows have not been written yet.
    await supabase.from('debt_entries')
      .update({ settled_at: settledAt, settle_move_id: moveId })
      .eq('person_id', personId)
      .is('settled_at', null);
  };
```

- [x] **Step 2: Widen the context type**

In `interface AppContextValue`, replace the `settleUpPerson` entry:

```tsx
  settleUpPerson: (personId: string, walletId?: string | null) => Promise<void>;
```

- [x] **Step 3: Create `SettleUpSheet`**

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt, DebtPerson } from './AppContext';
import BottomSheet from './BottomSheet';

interface Props {
  person: DebtPerson;
  net: number;
  currency: string;
  onClose: () => void;
}

// Squaring up is one exchange of one amount: the net. Picking a wallet is
// optional — leave it blank when the cash never touched a tracked wallet.
export default function SettleUpSheet({ person, net, currency, onClose }: Props) {
  const { wallets, settleUpPerson } = useApp();
  const [walletId, setWalletId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const incoming = net > 0;
  const amount = Math.abs(net);

  const handleSettle = async () => {
    setSaving(true);
    await settleUpPerson(person.id, walletId || null);
    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">
        Settle up with {person.name}
      </p>

      {net === 0 ? (
        <p className="text-sm text-slate-500 mb-5">
          These cancel out exactly — nothing changes hands. Everything will be
          marked settled.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-5">
          {incoming
            ? `${person.name} pays you `
            : `You pay ${person.name} `}
          <span className={incoming ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            {fmt(amount, currency)}
          </span>
          .
        </p>
      )}

      {net !== 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {incoming ? 'Received into' : 'Paid from'}
            <span className="text-slate-600"> · optional</span>
          </p>
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => setWalletId('')}
              className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                walletId === ''
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              No wallet
            </button>
            {wallets.map(w => (
              <button
                key={w.id}
                onClick={() => setWalletId(w.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                  walletId === w.id
                    ? 'border-blue-500 bg-blue-500/15 text-white'
                    : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
                }`}
              >
                <span>{w.icon}</span>{w.name}
              </button>
            ))}
          </div>
          <p className="mb-1 text-[11px] text-slate-600">
            {walletId === ''
              ? 'No balance will change.'
              : `${fmt(amount, currency)} ${incoming ? 'enters' : 'leaves'} this wallet.`}
          </p>
        </>
      )}

      <button
        onClick={handleSettle}
        disabled={saving}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Settling…' : 'Settle up'}
      </button>
    </BottomSheet>
  );
}
```

- [x] **Step 4: Open the sheet from `DebtPersonSection`**

Add the import and state, then swap the button's handler.

Imports at the top of `DebtPersonSection.tsx`:

```tsx
import SettleUpSheet from './SettleUpSheet';
```

State inside the component, beside `showSettled`:

```tsx
  const [settleOpen, setSettleOpen] = useState(false);
```

Replace the Settle up button's `onClick`:

```tsx
          <button
            onClick={() => setSettleOpen(true)}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-white/10 transition-colors"
          >
            Settle up
          </button>
```

Render the sheet as the last child of the component's outer `<div>`, just before its
closing tag:

```tsx
      {settleOpen && (
        <SettleUpSheet
          person={person}
          net={net}
          currency={currency}
          onClose={() => setSettleOpen(false)}
        />
      )}
```

`settleUpPerson` is no longer called directly here, so remove it from the `useApp()`
destructure at the top of the component, leaving:

```tsx
  const { setDebtEntrySettled, deleteDebtEntry } = useApp();
```

- [x] **Step 5: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline.

Manual check — with Marco owing you ₱250 and you owing him ₱180, tap **Settle up**. The
sheet reads "Marco pays you ₱70.00". Pick **Cash** and settle: Cash rises by ₱70 (not
₱250), both rows move to settled, and the Activity page gains one row. Repeat with a
person whose net is exactly zero and confirm the sheet says they cancel out, offers no
wallet, and moves no money.

- [x] **Step 6: Commit**

```bash
git add src/components/SettleUpSheet.tsx src/components/AppContext.tsx src/components/DebtPersonSection.tsx
git commit -m "feat: settle up sheet moves the net into a wallet"
```

---

### Task 4: Reversal + Activity page labels

**Files:**
- Modify: `src/components/AppContext.tsx`, `src/components/DebtPersonSection.tsx`, `src/app/transactions/page.tsx`

**Interfaces:**
- Consumes: `reverseMoves` from Task 1; `settleMoveId` from Tasks 1 and 3.
- Produces: `reverseSettleBatch(settleMoveId: string): Promise<void>` on the `useApp()` value.

- [x] **Step 1: Add `reverseSettleBatch`**

Place after `settleUpPerson`:

```tsx
  // Un-settle a whole settle-up batch. Reversing one row's share of a netted
  // movement has no coherent meaning — ₱250 owed and ₱180 owing became a single
  // ₱70 movement that no individual row owns — so the batch is the unit.
  const reverseSettleBatch = async (settleMoveId: string) => {
    setDebtEntries(prev => prev.map(
      e => e.settleMoveId === settleMoveId
        ? { ...e, settledAt: null, settleMoveId: null }
        : e
    ));
    await supabase.from('debt_entries')
      .update({ settled_at: null, settle_move_id: null })
      .eq('settle_move_id', settleMoveId);
    await reverseMoves([settleMoveId]);
  };
```

- [x] **Step 2: Reverse on delete**

Replace `deleteDebtEntry` and `deleteDebtPerson`:

```tsx
  const deleteDebtEntry = async (id: string) => {
    const entry = debtEntries.find(e => e.id === id);
    setDebtEntries(prev => prev.filter(e => e.id !== id));
    await supabase.from('debt_entries').delete().eq('id', id);
    if (entry?.moveId) await reverseMoves([entry.moveId]);
  };

  // The DB cascades their entries; mirror that locally, then undo every
  // movement they caused. Each distinct settle batch is reversed exactly once,
  // and all of it goes through one reverseMoves call so repeated hits on the
  // same wallet accumulate instead of overwriting each other.
  const deleteDebtPerson = async (id: string) => {
    const mine = debtEntries.filter(e => e.personId === id);
    const moveIds = [...new Set(
      mine.flatMap(e => [e.moveId, e.settleMoveId]).filter((m): m is string => Boolean(m))
    )];

    setDebtPeople(prev => prev.filter(p => p.id !== id));
    setDebtEntries(prev => prev.filter(e => e.personId !== id));
    await supabase.from('debt_people').delete().eq('id', id);
    await reverseMoves(moveIds);
  };
```

- [x] **Step 3: Expose `reverseSettleBatch`**

Add to `interface AppContextValue`:

```tsx
  reverseSettleBatch: (settleMoveId: string) => Promise<void>;
```

Add to the provider value object, beside the other debt functions:

```tsx
      reverseSettleBatch,
```

- [x] **Step 4: Confirm before reopening a batch**

In `DebtPersonSection.tsx`, pull the new function and add confirm state:

```tsx
  const { setDebtEntrySettled, deleteDebtEntry, reverseSettleBatch } = useApp();
```

```tsx
  const [confirmBatch, setConfirmBatch] = useState<string | null>(null);
```

Replace the settled rows' `onToggleSettled` so a batched row asks first:

```tsx
                <DebtEntryRow
                  key={e.id}
                  entry={e}
                  currency={currency}
                  onToggleSettled={() =>
                    e.settleMoveId
                      ? setConfirmBatch(e.settleMoveId)
                      : setDebtEntrySettled(e.id, false)
                  }
                  onDelete={() => deleteDebtEntry(e.id)}
                />
```

Add the dialog as the last child of the outer `<div>`, after the `SettleUpSheet`:

```tsx
      {confirmBatch && (() => {
        const batch = settled.filter(e => e.settleMoveId === confirmBatch);
        const batchNet = batch.reduce(
          (s, e) => s + (e.direction === 'owed_to_me' ? e.amount : -e.amount), 0,
        );
        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center px-6"
            onClick={() => setConfirmBatch(null)}
          >
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            <div
              className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
              onClick={ev => ev.stopPropagation()}
            >
              <p className="font-semibold text-white mb-1">Reopen this settle-up?</p>
              <p className="text-sm text-slate-500 mb-5">
                {batch.length === 1
                  ? 'This item was settled as a single payment.'
                  : `This was settled together with ${batch.length - 1} other item${batch.length > 2 ? 's' : ''}. All ${batch.length} will reopen.`}
                {batchNet !== 0 && ` ${fmt(Math.abs(batchNet), currency)} will be returned to the wallet it moved through.`}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmBatch(null)}
                  className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    reverseSettleBatch(confirmBatch);
                    setConfirmBatch(null);
                  }}
                  className="flex-1 rounded-xl bg-blue-600 py-3 text-sm font-semibold text-white hover:bg-blue-500 transition-colors"
                >
                  Reopen
                </button>
              </div>
            </div>
          </div>
        );
      })()}
```

- [x] **Step 5: Render the new kinds on the Activity page**

In `src/app/transactions/page.tsx`, inside the `moneyMoves.filter(...).map(...)`
callback, add this branch **after** the `withdrawn` branch and **before** the final
`return`. The final return is a fallback that labels anything unrecognised as
"Transfer 🔄", so without this the new kinds silently mislabel rather than error.

```tsx
        if (mm.kind === 'debt_out' || mm.kind === 'debt_in') {
          // flow 'moved' keeps these out of both month totals: lending is not
          // consumption and a repayment is not income. The note carries the
          // specifics ("Spotted Marco", "Marco settled up").
          return {
            id: mm.id, date: mm.date, flow: 'moved',
            icon: '🤝', label: 'Debt',
            sub: subtitle(mm.note, walletName(mm.walletId)),
            amount: mm.amount,
          };
        }
```

- [x] **Step 6: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline.

Manual check, in order:

1. On the Activity page, the rows created in Tasks 2 and 3 now read **🤝 Debt** with
   their note and wallet, in neutral grey. The month's spent and earned totals are
   unchanged by them, and the calendar cell for that day shows no new figure.
2. Expand a person's settled list and un-tick a row that came from a wallet-linked
   settle-up. The dialog names how many items reopen and how much returns. Cancel
   changes nothing; Reopen restores all of them to open, returns the net to the
   wallet, and removes the row from Activity.
3. Delete an entry that was created with a wallet. That wallet's balance returns to
   what it was before, and its Activity row disappears.
4. **The accumulation check.** Give one person two open `owed_to_me` entries, both
   linked to the *same* wallet, for ₱100 and ₱200. The wallet has dropped ₱300. Delete
   the person and confirm the wallet rises by the full ₱300 — not ₱100 or ₱200.
   Getting ₱200 back means the deltas are not accumulating.
5. Reload after each of the above and confirm the balances persisted.

- [x] **Step 7: Commit**

```bash
git add src/components/AppContext.tsx src/components/DebtPersonSection.tsx src/app/transactions/page.tsx
git commit -m "feat: reverse debt movements on delete and un-settle"
```

---

## Self-Review

**Spec coverage**

| Spec requirement | Task |
|---|---|
| `debt_out` / `debt_in` kinds, excluded from all totals | 1 (type), 4 (Activity flow) |
| `wallet_id` / `move_id` / `settle_move_id` columns | 1 |
| Optional wallet on creation, direction-aware sign | 2 |
| Blank wallet = no movement, stays the default | 2 (`No wallet` chip is the initial state) |
| `addDebtEntry` awaits to learn the move id | 2 |
| Per-row tick stays bookkeeping-only | 3 (untouched), 4 (except batched rows) |
| Settle-up moves the NET; zero net moves nothing | 3 |
| Batch reversal reopens all and returns the net | 4 |
| Delete entry / delete person reverse fully | 4 |
| Activity page handles both kinds explicitly | 4 |
| Movement dated to the debt, not to now | 1 (`recordMove` date param), 2 (passes `e.date`) |

**Type consistency**

- `MoneyMoveKind` gains exactly `'debt_out' | 'debt_in'` in Task 1 and those two
  strings are the only variants used in Tasks 2, 3 and 4.
- `DebtEntry.walletId` / `.moveId` / `.settleMoveId` are declared in Task 1 Step 3,
  mapped in Step 4, defaulted in Step 7, and read in Tasks 3 and 4.
- `recordMove` returns `Promise<string | null>` from Task 1 Step 5; both call sites
  (Task 2, Task 3) assign it to a `string | null`.
- `settleUpPerson(personId, walletId?)` — signature in Task 3 Step 1, interface in
  Step 2, called with both arguments from `SettleUpSheet`.
- `reverseMoves(string[])` takes an array at every call site: `[entry.moveId]`,
  `[settleMoveId]`, and `moveIds`.

**Known risks**

1. **Task 1 Step 5 edits `recordMove`, which four existing callers share.** They pass
   two arguments and ignore the return, so they are unaffected — but the manual check
   in Task 1 should include adding an ordinary wallet top-up to confirm income still
   records correctly.
2. **Deleting a wallet sets `wallet_id` and `move_id` to null without reversing**, per
   the spec's `on delete set null`. The debt survives as an unlinked entry. Intended.
3. **Task 4 Step 4's dialog is an IIFE inside JSX.** It needs `fmt` imported in
   `DebtPersonSection.tsx`, which it already is.
