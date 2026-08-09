# Debt Board Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A `/debts` page that tracks mutual mini-debts with friends and coworkers — who owes you, who you owe, and what each debt was for.

**Architecture:** Two new Supabase tables (`debt_people`, `debt_entries`) loaded through `AppContext` alongside the existing data. Entries are itemised and grouped into a section per person; a person's balance is **derived** by netting their open entries, never stored. Settling stamps `settled_at` rather than deleting, so history survives. The board is a **standalone ledger** — it does not touch wallet balances or `money_moves`.

**Tech Stack:** Next.js 16.2.4 (Turbopack, App Router), React 19, TypeScript, Tailwind CSS v4, Supabase (`@supabase/supabase-js`).

---

## Global Constraints

- **No test framework exists.** `package.json` defines only `build` (`next build`) and `lint` (`eslint`). Every task verifies with `npm run build`, `npm run lint`, and a named manual check. **Do not add a test framework — it is out of scope.**
- **Lint baseline.** `npm run lint` reports **2 errors and 6 warnings**, all pre-existing in `src/components/AppContext.tsx` and `src/app/auth/page.tsx` / `src/app/page.tsx`. A task passes if it introduces nothing beyond this baseline. **Do not fix the baseline issues — out of scope.**
- **This is NOT the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing code that touches framework APIs. This plan touches only client components, `next/link` and `next/navigation`, all already used throughout.
- **All new components are client components** — start every new file with `'use client';`.
- **Preserve the existing dark palette exactly:** surface `bg-[#111827]`, border `border-[#1e2d40]`, hover surface `bg-[#141d2e]`, page background `bg-[#0b0f1a]`, accent `blue-600`/`blue-400`, positive `emerald-400`, negative `red-400`.
- **Money is always rendered with `fmt(amount, currency)`** from `AppContext`, where `currency` comes from `settings.currency`. Never hardcode `₱`.
- **The migration in Task 1 must be run by the user in the Supabase SQL editor before any later task can be manually verified.** Ask them to run it; do not attempt to apply it programmatically.
- **Direction values are exactly `'owed_to_me'` and `'i_owe'`** — used in the DB check constraint, the TypeScript union, and every component. Do not invent variants.

---

## File Structure

**Create:**

| File | Responsibility |
|---|---|
| `src/app/debts/page.tsx` | Route shell: sorting, sheet state, person sections |
| `src/components/DebtSummary.tsx` | Top band — you're owed / you owe / net |
| `src/components/DebtPersonSection.tsx` | One person: header, net, Settle up, open items, settled disclosure |
| `src/components/DebtEntryRow.tsx` | One entry — direction arrow, note, date, amount, settle tick, delete |
| `src/components/AddDebtSheet.tsx` | Add an entry; pick an existing person or create a new one |

**Modify:**

| File | Change |
|---|---|
| `src/components/AppContext.tsx` | `DebtPerson` / `DebtEntry` types, load, CRUD, computed totals |
| `src/components/Icons.tsx` | Add `UsersIcon` |
| `src/components/BottomNav.tsx` | Add Debts; drop Settings from the **mobile** bar only |
| `src/components/PageHeader.tsx` | Settings cog beside the existing `right` slot |
| `src/app/page.tsx` | Settings cog in its bespoke header |
| `src/app/wallets/page.tsx` | Settings cog in its bespoke header |
| `src/app/expenses/page.tsx` | Settings cog in the Log Expense row (this page has no `<header>`) |

**Unchanged:** every other page, `BottomSheet.tsx`, `HalfCircleProgress.tsx`, all wallet/expense/money-move logic.

---

## Design Decisions (already settled — do not relitigate)

- **Standalone ledger.** Settling never writes a `money_move` and never changes a wallet balance.
- **Netting is derived.** A person's balance is `Σ(owed_to_me) − Σ(i_owe)` across their **open** entries. Never persist a balance.
- **`settled_at` is a nullable timestamp, not a boolean** — it doubles as the settled history.
- **Un-settle is supported.** Ticking a settled entry clears `settled_at`.
- **Deleting an entry does not confirm** (low stakes, re-addable). **Deleting a person does confirm** — it cascades their whole history.
- **Date defaults to today**, editable in the add sheet.
- **Out of scope:** splitting one bill across several people, reminders, sharing a board with the other person, any link to wallets or `money_moves`.

---

### Task 1: Migration + `AppContext` data layer

Nothing renders yet. This task makes the data available.

**Files:**
- Modify: `src/components/AppContext.tsx`

**Interfaces:**
- Produces, exported from `AppContext`:
  - `type DebtDirection = 'owed_to_me' | 'i_owe'`
  - `interface DebtPerson { id: string; name: string; emoji: string }`
  - `interface DebtEntry { id: string; personId: string; direction: DebtDirection; amount: number; note: string; date: string; settledAt: string | null }`
  - `function netOf(entries: DebtEntry[]): number`
- Produces, on the `useApp()` value:
  - `debtPeople: DebtPerson[]`
  - `debtEntries: DebtEntry[]`
  - `addDebtPerson(p: { name: string; emoji: string }): Promise<string | null>` — resolves to the **real** row id
  - `deleteDebtPerson(id: string): Promise<void>`
  - `addDebtEntry(e: { personId: string; direction: DebtDirection; amount: number; note: string; date: string }): Promise<void>`
  - `deleteDebtEntry(id: string): Promise<void>`
  - `setDebtEntrySettled(id: string, settled: boolean): Promise<void>`
  - `settleUpPerson(personId: string): Promise<void>`
  - `totalOwedToMe: number`, `totalIOwe: number`

- [ ] **Step 1: Ask the user to run the migration**

Post this to the user and wait for them to confirm it succeeded. Do not proceed until they do — every later manual check depends on it.

```sql
create table if not exists debt_people (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null,
  emoji      text not null default '🧑',
  created_at timestamptz not null default now()
);

create table if not exists debt_entries (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  person_id  uuid not null references debt_people(id) on delete cascade,
  direction  text not null check (direction in ('owed_to_me', 'i_owe')),
  amount     numeric not null check (amount > 0),
  note       text not null default '',
  date       timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists debt_people_user_idx       on debt_people  (user_id, created_at);
create index if not exists debt_entries_user_date_idx on debt_entries (user_id, date desc);
create index if not exists debt_entries_person_idx    on debt_entries (person_id);

alter table debt_people  enable row level security;
alter table debt_entries enable row level security;

create policy "own debt_people" on debt_people
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own debt_entries" on debt_entries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

`create policy` has no `if not exists`. If it errors with "policy already exists", prepend
`drop policy if exists "own debt_people" on debt_people;` (and the same for `debt_entries`).

Expect "Success. No rows returned" — normal for DDL.

**Paste the whole block.** Postgres parses the entire batch before executing any of
it, so a truncated paste rejects everything with a `42601` syntax error pointing at
the line *after* the cut — which reads like a bug in the SQL rather than a short
paste. Check the last statement arrived intact before blaming the script.

- [x] **Step 2: Add the types**

In `src/components/AppContext.tsx`, after the `MoneyMove` interface (~line 47):

```tsx
// ── Debt board ──────────────────────────────────────────────────────────────
// A standalone ledger: settling a debt never moves a wallet balance. A person's
// balance is derived from their open entries, never stored.
export type DebtDirection = 'owed_to_me' | 'i_owe';

export interface DebtPerson {
  id: string; name: string; emoji: string;
}

export interface DebtEntry {
  id: string; personId: string; direction: DebtDirection;
  amount: number; note: string; date: string;
  settledAt: string | null;   // null means open
}

// Positive = they owe you. Caller decides which entries to include; pass only
// open ones for a live balance.
export function netOf(entries: DebtEntry[]): number {
  return entries.reduce(
    (s, e) => s + (e.direction === 'owed_to_me' ? e.amount : -e.amount),
    0,
  );
}
```

- [x] **Step 3: Add the row mappers**

Next to the other `fromDB*` helpers (~line 257):

```tsx
const fromDBDebtPerson = (r: Row): DebtPerson => ({
  id: r.id, name: r.name, emoji: r.emoji || '🧑',
});

const fromDBDebtEntry  = (r: Row): DebtEntry => ({
  id: r.id, personId: r.person_id,
  direction: r.direction as DebtDirection,
  amount: Number(r.amount), note: r.note || '',
  date: r.date, settledAt: r.settled_at ?? null,
});
```

- [x] **Step 4: Add state and wire the loader**

Add alongside the other `useState` calls in `AppProvider` (~line 285):

```tsx
const [debtPeople,  setDebtPeople]  = useState<DebtPerson[]>([]);
const [debtEntries, setDebtEntries] = useState<DebtEntry[]>([]);
```

In the `useEffect` that clears state when `userId` goes null (~line 290), add:

```tsx
setDebtPeople([]); setDebtEntries([]);
```

In `loadAll`, add two queries to the `Promise.all` array and destructure them —
**append to the end of both the array and the destructuring list** so the existing
positional bindings do not shift:

```tsx
const [sRes, wRes, eRes, mmRes, bRes, blRes, aRes, spRes, efRes, dpRes, deRes] = await Promise.all([
  // ...existing nine queries, unchanged...
  supabase.from('debt_people').select('*').eq('user_id', uid).order('created_at'),
  supabase.from('debt_entries').select('*').eq('user_id', uid).order('date', { ascending: false }),
]);
```

Then before `setDataLoading(false)`:

```tsx
if (dpRes.data) setDebtPeople(dpRes.data.map(fromDBDebtPerson));
if (deRes.data) setDebtEntries(deRes.data.map(fromDBDebtEntry));
```

- [x] **Step 5: Add the CRUD functions**

Place after `deleteMoneyMove` (~line 508). Note `addDebtPerson` is **not optimistic** —
it awaits the insert and returns the real id, because `AddDebtSheet` immediately
inserts an entry with that id as a foreign key. A temp UUID would violate the FK.

```tsx
// ── Debt board ────────────────────────────────────────────────────────────
// Not optimistic: the caller needs the real row id to reference as a foreign
// key on the entry it inserts next.
const addDebtPerson = async (p: { name: string; emoji: string }): Promise<string | null> => {
  if (!userId) return null;
  const { data } = await supabase.from('debt_people').insert({
    user_id: userId, name: p.name, emoji: p.emoji,
  }).select().single();
  if (!data) return null;
  setDebtPeople(prev => [...prev, fromDBDebtPerson(data)]);
  return data.id as string;
};

// The DB cascades their entries; mirror that locally so the UI matches.
const deleteDebtPerson = async (id: string) => {
  setDebtPeople(prev => prev.filter(p => p.id !== id));
  setDebtEntries(prev => prev.filter(e => e.personId !== id));
  await supabase.from('debt_people').delete().eq('id', id);
};

const addDebtEntry = async (e: {
  personId: string; direction: DebtDirection;
  amount: number; note: string; date: string;
}) => {
  if (!userId) return;
  const tempId = crypto.randomUUID();
  setDebtEntries(prev => [{ ...e, id: tempId, settledAt: null }, ...prev]);

  const { data } = await supabase.from('debt_entries').insert({
    user_id: userId, person_id: e.personId, direction: e.direction,
    amount: e.amount, note: e.note, date: e.date,
  }).select().single();

  if (data) {
    setDebtEntries(prev => prev.map(x => x.id === tempId ? fromDBDebtEntry(data) : x));
  }
};

const deleteDebtEntry = async (id: string) => {
  setDebtEntries(prev => prev.filter(e => e.id !== id));
  await supabase.from('debt_entries').delete().eq('id', id);
};

const setDebtEntrySettled = async (id: string, settled: boolean) => {
  const settledAt = settled ? new Date().toISOString() : null;
  setDebtEntries(prev => prev.map(e => e.id === id ? { ...e, settledAt } : e));
  await supabase.from('debt_entries').update({ settled_at: settledAt }).eq('id', id);
};

// Clears every open entry for one person in a single write.
const settleUpPerson = async (personId: string) => {
  const settledAt = new Date().toISOString();
  setDebtEntries(prev => prev.map(
    e => e.personId === personId && !e.settledAt ? { ...e, settledAt } : e
  ));
  await supabase.from('debt_entries')
    .update({ settled_at: settledAt })
    .eq('person_id', personId)
    .is('settled_at', null);
};
```

- [x] **Step 6: Add the computed totals**

Add a `useMemo` after the existing `computed` block (~line 336). Keep it separate —
do not enlarge the existing `Computed` interface, which is about budget maths:

```tsx
// Open entries only — settled debts are history, not balance.
const debtTotals = useMemo(() => {
  const open = debtEntries.filter(e => !e.settledAt);
  return {
    totalOwedToMe: open.filter(e => e.direction === 'owed_to_me')
                       .reduce((s, e) => s + e.amount, 0),
    totalIOwe:     open.filter(e => e.direction === 'i_owe')
                       .reduce((s, e) => s + e.amount, 0),
  };
}, [debtEntries]);
```

- [x] **Step 7: Extend the context type and provider value**

Add to `interface AppContextValue` (~line 113):

```tsx
  debtPeople: DebtPerson[];
  debtEntries: DebtEntry[];
  totalOwedToMe: number;
  totalIOwe: number;
  addDebtPerson: (p: { name: string; emoji: string }) => Promise<string | null>;
  deleteDebtPerson: (id: string) => Promise<void>;
  addDebtEntry: (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
  }) => Promise<void>;
  deleteDebtEntry: (id: string) => Promise<void>;
  setDebtEntrySettled: (id: string, settled: boolean) => Promise<void>;
  settleUpPerson: (personId: string) => Promise<void>;
```

Add to the `<AppContext.Provider value={{ ... }}>` object:

```tsx
      debtPeople, debtEntries,
      ...debtTotals,
      addDebtPerson, deleteDebtPerson,
      addDebtEntry, deleteDebtEntry, setDebtEntrySettled, settleUpPerson,
```

- [x] **Step 8: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint shows exactly the 2 errors / 6 warnings baseline.

Manual check — run `npm run dev`, open any page, and confirm it still loads with no
console errors. In the browser console the new tables should read as empty arrays,
not throw. If you see a 404 from Supabase, the Step 1 migration has not been run.

- [x] **Step 9: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: debt board data layer"
```

---

### Task 2: `UsersIcon` + navigation swap

**Files:**
- Modify: `src/components/Icons.tsx`, `src/components/BottomNav.tsx`

**Interfaces:**
- Produces: `UsersIcon` exported from `Icons.tsx`, same signature as every other icon there.

- [x] **Step 1: Add the icon**

`Icons.tsx` builds every icon with the local `i(path)` helper. Add alongside the others:

```tsx
export const UsersIcon = i('M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z');
```

- [x] **Step 2: Split the nav lists**

In `BottomNav.tsx`, replace the single `links` array (lines 8-14) with:

```tsx
const links = [
  { href: '/',             label: 'Dashboard', Icon: HomeIcon },
  { href: '/wallets',      label: 'Wallets',   Icon: WalletIcon },
  { href: '/expenses',     label: 'Budget',    Icon: TrendingUpIcon },
  { href: '/transactions', label: 'Activity',  Icon: ReceiptIcon },
  { href: '/debts',        label: 'Debts',     Icon: UsersIcon },
  { href: '/settings',     label: 'Settings',  Icon: CogIcon },
];

// The mobile bar fits five comfortably. Settings is the rarest destination and
// is reachable from the cog in every page header, so it is the one to drop.
const mobileLinks = links.filter(l => l.href !== '/settings');
```

Update the import on line 5 to include `UsersIcon`.

- [x] **Step 3: Use `mobileLinks` in the mobile bar only**

In the `<nav className="md:hidden ...">` block, change `links.map(...)` to `mobileLinks.map(...)`.
**Leave the desktop `<aside>` using the full `links` array** — the sidebar has room for all six.

- [x] **Step 4: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline. `/debts` does not exist yet, so the nav
item will 404 when tapped — that is expected until Task 4.

Manual check — at a phone width the bottom bar shows five items ending in **Debts**,
no Settings. At `md` and wider the sidebar shows all six including Settings.

- [x] **Step 5: Commit**

```bash
git add src/components/Icons.tsx src/components/BottomNav.tsx
git commit -m "feat: add Debts to nav, drop Settings from the mobile bar"
```

---

### Task 3: Settings cog in page headers

Settings just left the mobile bar, so it needs a route back. **All three non-Settings
pages that use `PageHeader` already pass a `right` slot**, so the cog must render
*beside* `right`, never as a fallback for it.

**Files:**
- Modify: `src/components/PageHeader.tsx`, `src/app/page.tsx`, `src/app/wallets/page.tsx`, `src/app/expenses/page.tsx`

- [x] **Step 1: Rewrite `PageHeader`**

Replace the whole file:

```tsx
'use client';

import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { ChevronLeftIcon, CogIcon } from './Icons';

interface Props {
  title: string;
  right?: React.ReactNode;
  onBack?: () => void;
}

export default function PageHeader({ title, right, onBack }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  // Mobile only — the desktop sidebar still carries Settings. And never link a
  // page to itself.
  const showCog = pathname !== '/settings';

  return (
    <header className="flex items-center justify-between gap-3 pt-12 pb-5 md:pt-10 md:pb-6">
      <button
        onClick={onBack ?? (() => router.back())}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
      >
        <ChevronLeftIcon className="w-5 h-5 text-slate-400" />
      </button>
      <h1 className="text-base font-semibold text-white md:text-2xl md:font-bold truncate">{title}</h1>
      <div className="flex shrink-0 items-center justify-end gap-2">
        {right}
        {showCog && (
          <Link
            href="/settings"
            aria-label="Settings"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
          >
            <CogIcon className="w-5 h-5 text-slate-400" />
          </Link>
        )}
      </div>
    </header>
  );
}
```

The old fixed `w-9` wrapper is now `flex ... gap-2` so two controls fit. `truncate`
on the `<h1>` stops a long title pushing the buttons off-screen.

- [x] **Step 2: Add the cog to the Dashboard's bespoke header**

`src/app/page.tsx` has its own `<header>`. Add this as the last child of that header's
right-hand side (add `import Link from 'next/link';` and `CogIcon` to the icon import
if they are not already there):

```tsx
<Link
  href="/settings"
  aria-label="Settings"
  className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
>
  <CogIcon className="w-5 h-5 text-slate-400" />
</Link>
```

If the header has no right-hand container, wrap the existing right-hand content and
this link together in `<div className="flex items-center gap-2">`.

- [x] **Step 3: Add the same cog to `src/app/wallets/page.tsx`**

Identical markup, same placement in that page's bespoke `<header>`.

- [x] **Step 4: Add the same cog to `src/app/expenses/page.tsx`**

This page has **no** `<header>` — its top row is the Log Expense link
(`<div className="flex justify-end pt-14 pb-4 md:pt-10">`). Put the cog **before**
the existing `<Link href="/expenses/new">` inside that div, and add `gap-2` to it:

```tsx
<div className="flex justify-end items-center gap-2 pt-14 pb-4 md:pt-10">
  <Link
    href="/settings"
    aria-label="Settings"
    className="flex h-9 w-9 items-center justify-center rounded-full bg-white/5 active:bg-white/10 transition-colors md:hidden"
  >
    <CogIcon className="w-5 h-5 text-slate-400" />
  </Link>
  {/* existing Log Expense link, unchanged */}
</div>
```

Add `CogIcon` to the `@/components/Icons` import on that page.

`/expenses/new` is deliberately excluded — it is a form sub-page you back out of,
not a destination you navigate onward from.

- [x] **Step 5: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint at baseline.

Manual check at a **phone width**, since the cog is `md:hidden`: a cog appears
top-right on Dashboard, Wallets, Budget, Activity, Shopee and Emergency Fund, and
each opens Settings. On Shopee / Emergency Fund / Activity the cog sits **beside**
that page's existing button, not instead of it. Settings itself shows **no** cog.
At `md` and wider, no cog appears anywhere.

- [x] **Step 6: Commit**

```bash
git add src/components/PageHeader.tsx src/app/page.tsx src/app/wallets/page.tsx src/app/expenses/page.tsx
git commit -m "feat: settings cog in page headers for mobile"
```

---

### Task 4: `/debts` route + `DebtSummary`

First rendering task. Produces a working page with the summary band and an empty
state; person sections arrive in Task 5.

**Files:**
- Create: `src/components/DebtSummary.tsx`, `src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `totalOwedToMe`, `totalIOwe`, `debtPeople`, `debtEntries` from Task 1.
- Produces: `DebtSummary({ owedToMe, iOwe, currency })` — default export.

- [x] **Step 1: Create `DebtSummary`**

```tsx
'use client';

import { fmt } from './AppContext';

interface Props {
  owedToMe: number;
  iOwe: number;
  currency: string;
}

// The three numbers the page exists to answer, before any detail.
export default function DebtSummary({ owedToMe, iOwe, currency }: Props) {
  const net = owedToMe - iOwe;

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-5">
      <div className="grid grid-cols-3 gap-3">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">You&rsquo;re owed</p>
          <p className="mt-1 text-lg font-bold text-emerald-400 tabular-nums truncate">
            {fmt(owedToMe, currency)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">You owe</p>
          <p className="mt-1 text-lg font-bold text-red-400 tabular-nums truncate">
            {fmt(iOwe, currency)}
          </p>
        </div>
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-slate-500">Net</p>
          <p className={`mt-1 text-lg font-bold tabular-nums truncate ${
            net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-slate-400'
          }`}>
            {net > 0 ? '+' : net < 0 ? '-' : ''}{fmt(Math.abs(net), currency)}
          </p>
        </div>
      </div>
      {net !== 0 && (
        <p className="mt-3 text-xs text-slate-500">
          {net > 0 ? 'Overall, people owe you.' : 'Overall, you owe people.'}
        </p>
      )}
    </div>
  );
}
```

- [x] **Step 2: Create the page**

```tsx
'use client';

import { useState, useMemo } from 'react';
import { useApp, netOf, DebtPerson, DebtEntry } from '@/components/AppContext';
import BottomNav from '@/components/BottomNav';
import PageHeader from '@/components/PageHeader';
import DebtSummary from '@/components/DebtSummary';
import { PlusIcon, UsersIcon } from '@/components/Icons';

export interface PersonGroup {
  person: DebtPerson;
  open: DebtEntry[];
  settled: DebtEntry[];
  net: number;
}

export default function DebtsPage() {
  const { debtPeople, debtEntries, totalOwedToMe, totalIOwe, settings } = useApp();
  const { currency } = settings;

  const [addOpen, setAddOpen] = useState(false);

  // People with an open balance first, most recently active at the top; fully
  // settled people sink to the bottom.
  const groups = useMemo<PersonGroup[]>(() => {
    const byPerson = debtPeople.map(person => {
      const mine = debtEntries.filter(e => e.personId === person.id);
      const open = mine.filter(e => !e.settledAt);
      const settled = mine.filter(e => e.settledAt);
      return { person, open, settled, net: netOf(open) };
    });

    const lastActivity = (g: PersonGroup) =>
      [...g.open, ...g.settled]
        .reduce((max, e) => (e.date > max ? e.date : max), '');

    return byPerson.sort((a, b) => {
      if ((a.open.length > 0) !== (b.open.length > 0)) return a.open.length > 0 ? -1 : 1;
      return lastActivity(b).localeCompare(lastActivity(a));
    });
  }, [debtPeople, debtEntries]);

  return (
    <div className="min-h-screen bg-[#0b0f1a]">
      <BottomNav />

      <div className="md:pl-64">
        <div className="mx-auto max-w-5xl px-4 md:px-8 pb-28 md:pb-12">

          <PageHeader
            title="Debt Board"
            right={
              <button
                onClick={() => setAddOpen(true)}
                aria-label="Add debt"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-blue-600 hover:bg-blue-500 transition-colors"
              >
                <PlusIcon className="w-4 h-4 text-white" />
              </button>
            }
          />

          <DebtSummary owedToMe={totalOwedToMe} iOwe={totalIOwe} currency={currency} />

          <div className="mt-6 space-y-4">
            {groups.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#1e2d40] px-4 py-12 text-center">
                <UsersIcon className="w-8 h-8 text-slate-700 mx-auto mb-2" />
                <p className="text-sm text-slate-500 mb-1">No debts tracked yet.</p>
                <p className="text-xs text-slate-600">
                  Add one when you cover someone&rsquo;s meal — or they cover yours.
                </p>
              </div>
            ) : (
              groups.map(g => (
                <div key={g.person.id} className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-4">
                  <p className="text-sm font-semibold text-white">
                    {g.person.emoji} {g.person.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {g.open.length} open · net {g.net}
                  </p>
                </div>
              ))
            )}
          </div>

        </div>
      </div>
    </div>
  );
}
```

The placeholder person card above is replaced wholesale in Task 5. `addOpen` is
declared now and wired in Task 6; until then the + button opens nothing.

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds. Lint will report **one new warning** — `addOpen` assigned
but never used. That is expected and resolved in Task 6; do not delete the state.

Manual check — tap **Debts** in the bottom bar. The page loads with a summary band
reading `₱0.00 / ₱0.00 / ₱0.00` and the empty state. The back chevron and Settings
cog both work.

- [x] **Step 4: Commit**

```bash
git add src/components/DebtSummary.tsx src/app/debts/page.tsx
git commit -m "feat: debts route with summary band"
```

---

### Task 5: `DebtEntryRow` + `DebtPersonSection`

**Files:**
- Create: `src/components/DebtEntryRow.tsx`, `src/components/DebtPersonSection.tsx`
- Modify: `src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `DebtEntry`, `DebtPerson`, `netOf`, `setDebtEntrySettled`, `deleteDebtEntry`, `settleUpPerson`, `deleteDebtPerson` from Task 1; `PersonGroup` from Task 4.
- Produces:
  - `DebtEntryRow({ entry, currency, onToggleSettled, onDelete })` — default export
  - `DebtPersonSection({ group, currency, onDeletePerson })` — default export

- [x] **Step 1: Create `DebtEntryRow`**

```tsx
'use client';

import { fmt, DebtEntry } from './AppContext';
import { CheckIcon, TrashIcon } from './Icons';

interface Props {
  entry: DebtEntry;
  currency: string;
  onToggleSettled: () => void;
  onDelete: () => void;
}

export default function DebtEntryRow({ entry, currency, onToggleSettled, onDelete }: Props) {
  const settled = Boolean(entry.settledAt);
  const owedToMe = entry.direction === 'owed_to_me';
  const day = new Date(entry.date).toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric',
  });

  return (
    <div className={`flex items-center gap-2.5 rounded-xl border px-3 py-2.5 transition-colors ${
      settled ? 'bg-white/[0.02] border-[#1e2d40]' : 'bg-white/5 border-[#1e2d40]'
    }`}>
      <span className={`text-xs shrink-0 ${owedToMe ? 'text-emerald-400' : 'text-red-400'}`}>
        {owedToMe ? '→' : '←'}
      </span>

      <div className="min-w-0 flex-1">
        <p className={`text-sm truncate ${settled ? 'text-slate-500 line-through' : 'text-white'}`}>
          {entry.note || (owedToMe ? 'They owe you' : 'You owe them')}
        </p>
        <p className="text-[11px] text-slate-600">{day}</p>
      </div>

      <p className={`text-sm font-medium tabular-nums shrink-0 ${
        settled ? 'text-slate-600' : owedToMe ? 'text-emerald-400' : 'text-red-400'
      }`}>
        {owedToMe ? '+' : '-'}{fmt(entry.amount, currency)}
      </p>

      <button
        onClick={onToggleSettled}
        title={settled ? 'Mark unsettled' : 'Mark settled'}
        aria-label={settled ? 'Mark unsettled' : 'Mark settled'}
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-colors ${
          settled
            ? 'bg-emerald-500/20 text-emerald-400'
            : 'bg-white/5 text-slate-500 hover:text-slate-200 hover:bg-white/10'
        }`}
      >
        <CheckIcon className="w-3.5 h-3.5" />
      </button>

      <button
        onClick={onDelete}
        title="Delete entry"
        aria-label="Delete entry"
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-white/10 transition-colors"
      >
        <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
      </button>
    </div>
  );
}
```

- [x] **Step 2: Create `DebtPersonSection`**

```tsx
'use client';

import { useState } from 'react';
import { useApp, fmt } from './AppContext';
import DebtEntryRow from './DebtEntryRow';
import { TrashIcon } from './Icons';
import type { PersonGroup } from '@/app/debts/page';

interface Props {
  group: PersonGroup;
  currency: string;
  onDeletePerson: () => void;
}

export default function DebtPersonSection({ group, currency, onDeletePerson }: Props) {
  const { setDebtEntrySettled, deleteDebtEntry, settleUpPerson } = useApp();
  const { person, open, settled, net } = group;
  const [showSettled, setShowSettled] = useState(false);

  const label = net > 0 ? 'owes you' : net < 0 ? 'you owe' : 'settled up';
  const tone  = net > 0 ? 'text-emerald-400' : net < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="rounded-2xl bg-[#111827] border border-[#1e2d40] p-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="text-xl shrink-0">{person.emoji}</span>
          <p className="text-sm font-semibold text-white truncate">{person.name}</p>
        </div>
        <div className="text-right shrink-0">
          <p className={`text-base font-bold tabular-nums ${tone}`}>
            {net === 0 ? fmt(0, currency) : fmt(Math.abs(net), currency)}
          </p>
          <p className="text-[11px] text-slate-500">{label}</p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 mb-3">
        {open.length > 0 && (
          <button
            onClick={() => settleUpPerson(person.id)}
            className="rounded-lg bg-white/5 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-white/10 transition-colors"
          >
            Settle up
          </button>
        )}
        <button
          onClick={onDeletePerson}
          title={`Delete ${person.name}`}
          aria-label={`Delete ${person.name}`}
          className="flex h-7 w-7 items-center justify-center rounded-full hover:bg-white/10 transition-colors ml-auto"
        >
          <TrashIcon className="w-3.5 h-3.5 text-slate-600 hover:text-red-400" />
        </button>
      </div>

      {/* Open entries */}
      {open.length === 0 ? (
        <p className="text-xs text-slate-600">Nothing outstanding.</p>
      ) : (
        <div className="space-y-2">
          {open.map(e => (
            <DebtEntryRow
              key={e.id}
              entry={e}
              currency={currency}
              onToggleSettled={() => setDebtEntrySettled(e.id, true)}
              onDelete={() => deleteDebtEntry(e.id)}
            />
          ))}
        </div>
      )}

      {/* Settled history */}
      {settled.length > 0 && (
        <div className="mt-3 border-t border-[#1e2d40] pt-3">
          <button
            onClick={() => setShowSettled(v => !v)}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showSettled ? '▴ Hide' : '▾ Show'} {settled.length} settled
          </button>
          {showSettled && (
            <div className="mt-2 space-y-2">
              {settled.map(e => (
                <DebtEntryRow
                  key={e.id}
                  entry={e}
                  currency={currency}
                  onToggleSettled={() => setDebtEntrySettled(e.id, false)}
                  onDelete={() => deleteDebtEntry(e.id)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [x] **Step 3: Use it in the page**

In `src/app/debts/page.tsx`, import it and replace the placeholder person card from
Task 4 with:

```tsx
groups.map(g => (
  <DebtPersonSection
    key={g.person.id}
    group={g}
    currency={currency}
    onDeletePerson={() => setConfirmDeletePerson(g.person)}
  />
))
```

Add the confirm state next to `addOpen` (the dialog itself is Task 7):

```tsx
const [confirmDeletePerson, setConfirmDeletePerson] = useState<DebtPerson | null>(null);
```

- [x] **Step 4: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds. Lint still reports the unused `addOpen` warning plus a new
unused `confirmDeletePerson` warning — both resolved in Tasks 6 and 7. No other new
warnings.

Manual check — you cannot add entries through the UI yet. Insert two rows by hand in
the Supabase table editor (one `owed_to_me` for 250, one `i_owe` for 180, same
`person_id`), reload `/debts`, and confirm: the section header nets to `₱70.00 owes
you`, both rows render with the right arrow and colour, ticking one drops it out of
the net and into "1 settled", expanding shows it struck through, and un-ticking
restores it. "Settle up" clears all open rows at once.

- [x] **Step 5: Commit**

```bash
git add src/components/DebtEntryRow.tsx src/components/DebtPersonSection.tsx src/app/debts/page.tsx
git commit -m "feat: debt person sections with netting and settling"
```

---

### Task 6: `AddDebtSheet`

**Files:**
- Create: `src/components/AddDebtSheet.tsx`
- Modify: `src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `BottomSheet`, `addDebtPerson`, `addDebtEntry`, `debtPeople` from Task 1.
- Produces: `AddDebtSheet({ onClose })` — default export; reads everything else from `useApp()`.

- [x] **Step 1: Create the sheet**

```tsx
'use client';

import { useState } from 'react';
import { useApp, DebtDirection } from './AppContext';
import BottomSheet from './BottomSheet';

const PERSON_EMOJI = ['🧑','👩','👨','🧔','👧','👦','🙂','😎','🐱','🐶','⭐','🎯'];

function todayInputValue(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

interface Props {
  onClose: () => void;
}

export default function AddDebtSheet({ onClose }: Props) {
  const { debtPeople, addDebtPerson, addDebtEntry } = useApp();

  const [personId,  setPersonId]  = useState<string>(debtPeople[0]?.id ?? '');
  const [newName,   setNewName]   = useState('');
  const [newEmoji,  setNewEmoji]  = useState('🧑');
  const [creating,  setCreating]  = useState(debtPeople.length === 0);
  const [direction, setDirection] = useState<DebtDirection>('owed_to_me');
  const [amount,    setAmount]    = useState('');
  const [note,      setNote]      = useState('');
  const [date,      setDate]      = useState(todayInputValue());
  const [saving,    setSaving]    = useState(false);

  const amountValue = parseFloat(amount);
  const validPerson = creating ? newName.trim().length > 0 : personId.length > 0;
  const canSave = validPerson && !isNaN(amountValue) && amountValue > 0 && !saving;

  const handleSave = async () => {
    if (!canSave) return;
    setSaving(true);

    // A new person must be inserted first — the entry references its real id.
    const targetId = creating
      ? await addDebtPerson({ name: newName.trim(), emoji: newEmoji })
      : personId;

    if (!targetId) { setSaving(false); return; }

    await addDebtEntry({
      personId: targetId,
      direction,
      amount: amountValue,
      note: note.trim(),
      // Midday avoids the entry sliding to the previous day in UTC.
      date: new Date(`${date}T12:00:00`).toISOString(),
    });

    setSaving(false);
    onClose();
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-5">Add debt</p>

      {/* Person */}
      <p className="text-xs text-slate-500 mb-2">Person</p>
      {debtPeople.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {debtPeople.map(p => (
            <button
              key={p.id}
              onClick={() => { setCreating(false); setPersonId(p.id); }}
              className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
                !creating && personId === p.id
                  ? 'border-blue-500 bg-blue-500/15 text-white'
                  : 'border-[#1e2d40] bg-white/5 text-slate-400 hover:text-white'
              }`}
            >
              <span>{p.emoji}</span>{p.name}
            </button>
          ))}
          <button
            onClick={() => setCreating(true)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs transition-colors ${
              creating
                ? 'border-blue-500 bg-blue-500/15 text-white'
                : 'border-dashed border-[#1e2d40] bg-white/5 text-blue-400 hover:border-blue-500/40'
            }`}
          >
            + New person
          </button>
        </div>
      )}

      {creating && (
        <div className="mb-4 rounded-xl border border-[#1e2d40] bg-white/5 p-3">
          <div className="flex flex-wrap gap-1.5 mb-3">
            {PERSON_EMOJI.map(em => (
              <button
                key={em}
                onClick={() => setNewEmoji(em)}
                className={`h-8 w-8 rounded-lg text-base border transition-colors ${
                  newEmoji === em ? 'border-blue-500 bg-blue-500/15' : 'border-[#1e2d40] bg-white/5'
                }`}
              >
                {em}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Name"
            autoFocus
            className="w-full rounded-lg bg-white/5 border border-[#1e2d40] px-3 py-2 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
          />
        </div>
      )}

      {/* Direction */}
      <p className="text-xs text-slate-500 mb-2">Direction</p>
      <div className="grid grid-cols-2 gap-2 mb-4">
        <button
          onClick={() => setDirection('owed_to_me')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'owed_to_me'
              ? 'border-emerald-500 bg-emerald-500/15 text-emerald-400'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          They owe me
        </button>
        <button
          onClick={() => setDirection('i_owe')}
          className={`rounded-xl border px-3 py-2.5 text-sm transition-colors ${
            direction === 'i_owe'
              ? 'border-red-500 bg-red-500/15 text-red-400'
              : 'border-[#1e2d40] bg-white/5 text-slate-400'
          }`}
        >
          I owe them
        </button>
      </div>

      {/* Amount */}
      <p className="text-xs text-slate-500 mb-1">Amount</p>
      <input
        type="number"
        value={amount}
        onChange={e => setAmount(e.target.value)}
        placeholder="0.00"
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
      />

      {/* Note */}
      <p className="text-xs text-slate-500 mb-1">What for</p>
      <input
        type="text"
        value={note}
        onChange={e => setNote(e.target.value)}
        placeholder="e.g. Ramen lunch"
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50 mb-4"
      />

      {/* Date */}
      <p className="text-xs text-slate-500 mb-1">Date</p>
      <input
        type="date"
        value={date}
        onChange={e => setDate(e.target.value)}
        className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white outline-none focus:border-blue-500/50"
      />

      <button
        onClick={handleSave}
        disabled={!canSave}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving ? 'Saving…' : 'Add debt'}
      </button>
    </BottomSheet>
  );
}
```

- [x] **Step 2: Render it from the page**

In `src/app/debts/page.tsx`, import `AddDebtSheet` and add before the closing
`</div>` of the outermost wrapper (matching how `/expenses` renders its sheets):

```tsx
{addOpen && <AddDebtSheet onClose={() => setAddOpen(false)} />}
```

- [x] **Step 3: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds. The `addOpen` unused warning is now gone; only the
`confirmDeletePerson` warning remains, cleared in Task 7.

Manual check, end to end — tap **+**. With no people yet the sheet opens straight
into the new-person form. Pick an emoji, type "Marco", choose **They owe me**, amount
`250`, note `Ramen lunch`, keep today's date, Add. The sheet closes, a Marco section
appears reading `₱250.00 owes you`, and the summary band's "You're owed" rises to
₱250.00. Tap **+** again: Marco now appears as a chip. Select him, choose **I owe
them**, `180`, note `Coffee`, Add. His section nets to `₱70.00 owes you` with both
rows listed. Reload the page — everything persists.

Confirm Save stays disabled with an empty name, a blank amount, or a zero amount.

- [x] **Step 4: Commit**

```bash
git add src/components/AddDebtSheet.tsx src/app/debts/page.tsx
git commit -m "feat: add debt sheet with inline person creation"
```

---

### Task 7: Delete-person confirmation

Deleting a person cascades every entry they have, so it is the one destructive
action on this page that confirms.

**Files:**
- Modify: `src/app/debts/page.tsx`

**Interfaces:**
- Consumes: `deleteDebtPerson` from Task 1; `confirmDeletePerson` state from Task 5.

- [x] **Step 1: Add the dialog**

Add `deleteDebtPerson` to the `useApp()` destructure, then render this next to the
`AddDebtSheet`. It reuses the confirm-dialog markup already used on `/expenses`
rather than `BottomSheet`, because it is a decision, not a form:

```tsx
{confirmDeletePerson && (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center px-6"
    onClick={() => setConfirmDeletePerson(null)}
  >
    <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
    <div
      className="relative w-full max-w-sm rounded-2xl bg-[#111827] border border-[#1e2d40] p-6 text-center"
      onClick={e => e.stopPropagation()}
    >
      <p className="text-3xl mb-3">{confirmDeletePerson.emoji}</p>
      <p className="font-semibold text-white mb-1">
        Delete {confirmDeletePerson.name}?
      </p>
      <p className="text-sm text-slate-500 mb-5">
        Every debt logged with them is deleted too, settled ones included. This
        cannot be undone.
      </p>
      <div className="flex gap-2">
        <button
          onClick={() => setConfirmDeletePerson(null)}
          className="flex-1 rounded-xl bg-white/5 py-3 text-sm font-medium text-slate-300 hover:bg-white/10 transition-colors"
        >
          Cancel
        </button>
        <button
          onClick={() => {
            deleteDebtPerson(confirmDeletePerson.id);
            setConfirmDeletePerson(null);
          }}
          className="flex-1 rounded-xl bg-red-600 py-3 text-sm font-semibold text-white hover:bg-red-500 transition-colors"
        >
          Delete
        </button>
      </div>
    </div>
  </div>
)}
```

- [x] **Step 2: Verify**

```bash
npm run build
npm run lint
```

Expected: build succeeds; lint back at **exactly the 2 errors / 6 warnings baseline**,
with no leftover unused-variable warnings from Tasks 4 and 5.

Manual check — tap the trash icon on a person's header. The dialog names them and
warns that settled history goes too. Cancel leaves everything intact. Delete removes
the section, and the summary band drops by that person's open amounts. Reload to
confirm the rows are gone from the database, not just from local state.

- [x] **Step 3: Commit**

```bash
git add src/app/debts/page.tsx
git commit -m "feat: confirm before deleting a debt person"
```

---

## Self-Review

**Design coverage**

| Design requirement | Task |
|---|---|
| Standalone ledger — no wallet/money_move writes | 1 (no such call exists anywhere in the plan) |
| Itemised entries, grouped per person | 5 |
| Net per person, both directions listed | 1 (`netOf`), 5 (header + rows) |
| Per-item settle | 1, 5 |
| "Settle up" clears all open for a person | 1 (`settleUpPerson`), 5 |
| Settled history, expandable | 5 |
| `debt_people` + `debt_entries` with FK cascade | 1 |
| Summary band — owed / owe / net | 4 |
| Debts in nav, Settings off the mobile bar | 2 |
| Settings cog reachable on every mobile page header | 3 |
| Person created inline while adding an entry | 6 |
| Confirm on person delete, none on entry delete | 5 (entry), 7 (person) |
| Un-settle supported | 1, 5 |
| Date defaults to today | 6 |

**Type consistency**

- `DebtDirection` is `'owed_to_me' | 'i_owe'` in the SQL check constraint (Task 1
  Step 1), the TS union (Task 1 Step 2), `DebtEntryRow` (Task 5) and `AddDebtSheet`
  (Task 6). No variants.
- `settledAt` (camelCase, TS) maps to `settled_at` (snake_case, DB) in
  `fromDBDebtEntry` only. Components only ever see `settledAt`.
- `PersonGroup` is defined and exported in `src/app/debts/page.tsx` (Task 4) and
  imported by `DebtPersonSection` (Task 5) as a type-only import.
- `addDebtPerson` returns `Promise<string | null>` in the interface (Task 1 Step 7),
  the implementation (Step 5), and is null-checked at its only call site (Task 6).
- `DebtSummary` takes `owedToMe` / `iOwe` / `currency`; the page passes
  `totalOwedToMe` / `totalIOwe` / `currency`.

**Known risks**

1. **Task 1 Step 4 edits a destructured array.** Adding the two queries anywhere but
   the end silently reassigns `sRes`…`efRes` to the wrong results. The step says
   append; the manual check (every existing page still loads) catches it if not.
2. **Lint warnings are expected mid-plan.** Tasks 4 and 5 declare state used later.
   Only Task 7 returns lint to baseline. Do not "fix" these by deleting the state.
3. **`AddDebtSheet` awaits two sequential writes** when creating a person. The button
   shows "Saving…" and is disabled meanwhile, so a double-tap cannot create two people.
