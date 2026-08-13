# Partial Debt Settlement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the debts page record a payment of any amount against a person's balance, instead of only settling the whole thing at once.

**Architecture:** A partial payment is stored as an ordinary `debt_entries` row pointing the opposite way from the person's net — no schema change, no new table. The person's balance is already derived by `netOf` from their open entries, so inserting that row updates the card, the wallet, and the transactions feed through code that already exists. Deleting the row is the undo, also through existing code. Nothing is marked settled by a partial payment; the existing all-or-nothing `settleUpPerson` path stays exactly as it is and still runs when the user confirms the full amount.

**Tech Stack:** Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, Supabase JS client. State lives in one React context, `src/components/AppContext.tsx`.

## Global Constraints

- **Read the spec first:** `docs/superpowers/specs/2026-08-13-partial-debt-settlement-design.md`.
- **This is NOT the Next.js you know.** Per `AGENTS.md`, read the relevant guide in `node_modules/next/dist/docs/` before writing framework-level code. Nothing in this plan touches routing, server components, or data fetching — it is all client-component state and markup inside existing `'use client'` files — so that lookup is likely unnecessary here. Do it anyway if you find yourself reaching for a framework API.
- **There is no test framework.** `package.json` has only `dev`, `build`, `start`, `lint`. Do not add one; do not write test files. Verification in every task is `npx tsc --noEmit`, `npm run lint`, and a scripted manual pass in the browser. Steps below give the exact commands and the exact expected output.
- **`npm run lint` is not clean on this repo, and that is not yours to fix.** The merge base already reports `✖ 8 problems (2 errors, 6 warnings)`, all in `AppContext.tsx`'s data-loading `useEffect`/`loadAll` block and unrelated to this feature. The bar for every task is **no new problems** — the count must still read 8 when you are done. Do not "fix" the pre-existing two; that is an unrelated change and will be rejected in review.
- **Existing behavior is load-bearing.** The per-row ✓ button and the zero-net "these cancel out" case must render and behave exactly as they do today. Several steps exist only to confirm that.
- **Money amounts are compared at 2 decimals.** Task 2 defines a `round2` helper for this. Never compare raw floats for the "is this the full amount" decision.
- **Currency is never hardcoded.** Always format through `fmt(amount, currency)` from `AppContext`.
- **Copy strings are exact.** The user-facing strings in this plan were decided during design. Type them as written, including the `’` (U+2019) in contractions and the `…` (U+2026) in saving states, matching the surrounding files.
- **Commit after each task**, using the message given in the task's final step.

---

### Task 1: Record a debt payment in AppContext

Adds the model-layer operation. Nothing in the UI calls it yet, so the page is unchanged after this task — that is expected and correct.

**Files:**
- Modify: `src/components/AppContext.tsx` — `Ctx` interface (~line 222), `addDebtEntry` (~line 793), new `recordDebtPayment` after `addDebtEntry`, provider value (~line 1262)

**Interfaces:**
- Consumes: existing `addDebtEntry`, `netOf`, `debtEntries`, `debtPeople`
- Produces:
  - `addDebtEntry` gains an optional field: `moveNote?: string`
  - `recordDebtPayment: (personId: string, amount: number, walletId: string) => Promise<void>` — exposed on the context, consumed by Task 2

- [ ] **Step 1: Widen the `addDebtEntry` type in the `Ctx` interface**

In `src/components/AppContext.tsx`, find the `addDebtEntry` member of the `Ctx` interface (~line 222). Replace it with:

```tsx
  addDebtEntry: (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
    /** Overrides the money-move note. A repayment is not a new loan and
     *  should not read like one in the transactions feed. */
    moveNote?: string;
  }) => Promise<void>;
```

- [ ] **Step 2: Declare `recordDebtPayment` in the `Ctx` interface**

Directly below the `settleUpPerson` member (~line 229), add:

```tsx
  recordDebtPayment: (personId: string, amount: number, walletId: string) => Promise<void>;
```

- [ ] **Step 3: Accept `moveNote` in the `addDebtEntry` implementation**

Find the `addDebtEntry` implementation (~line 793). Update its parameter type to match the interface:

```tsx
  const addDebtEntry = async (e: {
    personId: string; direction: DebtDirection;
    amount: number; note: string; date: string;
    walletId?: string | null;
    moveNote?: string;
  }) => {
```

- [ ] **Step 4: Use `moveNote` when building the movement**

Inside the same function, in the `recordMove` call, replace this line:

```tsx
          note: out ? `Spotted ${name}` : `Borrowed from ${name}`,
```

with:

```tsx
          note: e.moveNote ?? (out ? `Spotted ${name}` : `Borrowed from ${name}`),
```

Every existing caller omits `moveNote`, so they all keep today's strings.

- [ ] **Step 5: Implement `recordDebtPayment`**

Insert this immediately after the closing brace of `addDebtEntry` and before `deleteDebtEntry` (~line 827):

```tsx
  // A payment against a person's balance. It is an ordinary entry pointing the
  // other way, not a settlement: paying down a positive net is money coming in,
  // which is exactly what `addDebtEntry` already books for an `i_owe` row. The
  // originals keep their face values and nothing is marked settled — the new
  // balance falls out of `netOf`, as it does for every other entry.
  //
  // The net is read here rather than passed in: the direction of the money
  // depends on it, and a stale figure from a render would point the wallet
  // movement the wrong way.
  const recordDebtPayment = async (personId: string, amount: number, walletId: string) => {
    const net = netOf(debtEntries.filter(e => e.personId === personId && !e.settledAt));
    if (amount <= 0 || net === 0) return;

    const incoming = net > 0;
    const name = debtPeople.find(p => p.id === personId)?.name ?? 'someone';
    const note = incoming ? `${name} paid you` : `Paid ${name}`;

    await addDebtEntry({
      personId,
      direction: incoming ? 'i_owe' : 'owed_to_me',
      amount,
      note,
      date: new Date().toISOString(),
      walletId,
      moveNote: note,
    });
  };
```

- [ ] **Step 6: Expose it on the provider value**

Find the provider value object (~line 1262). It currently reads:

```tsx
      addDebtEntry, deleteDebtEntry, setDebtEntrySettled, settleUpPerson,
      reverseSettleBatch,
```

Replace with:

```tsx
      addDebtEntry, deleteDebtEntry, setDebtEntrySettled, settleUpPerson,
      reverseSettleBatch, recordDebtPayment,
```

- [ ] **Step 7: Verify it compiles and lints**

Run:

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

Run:

```bash
npm run lint
```

Expected: no errors. If it reports `recordDebtPayment` as unused, you missed Step 6.

- [ ] **Step 8: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "feat: record a payment against a person's debt balance

A payment is an ordinary entry pointing the other way, so the wallet
movement, the feed entry, and the undo all come from existing code."
```

---

### Task 2: Amount field and chips in the settle sheet

The user-visible change. After this task the feature works end to end.

**Files:**
- Modify: `src/components/SettleUpSheet.tsx` (whole file — rewrite given below)
- Modify: `src/components/DebtPersonSection.tsx:110-119` (person-level sheet usage)

**Interfaces:**
- Consumes: `recordDebtPayment` from Task 1; existing `settleUpPerson`, `fmt`, `WalletPicker`, `BottomSheet`
- Produces: `SettleUpSheet` gains two optional props — `allowPartial?: boolean` and `onPartial?: (amount: number, walletId: string) => Promise<void>`. Both omitted means today's behavior exactly.

- [ ] **Step 1: Rewrite `SettleUpSheet.tsx`**

Replace the entire contents of `src/components/SettleUpSheet.tsx` with:

```tsx
'use client';

import { useState } from 'react';
import { fmt } from './AppContext';
import BottomSheet from './BottomSheet';
import WalletPicker from './WalletPicker';

// Money compares at two decimals. A raw float comparison would send a ₱333.33
// payment against a ₱333.33 balance down the partial path and leave a phantom
// ₱0.00 entry open forever.
const round2 = (n: number) => Math.round(n * 100) / 100;

interface Props {
  title: string;
  personName: string;
  /** Signed: positive means they pay you, negative means you pay them. */
  net: number;
  currency: string;
  /** Person-level settle-up only. A single row is all-or-nothing. */
  allowPartial?: boolean;
  onConfirm: (walletId: string | null) => Promise<void>;
  /** Required when `allowPartial` is set and the user enters less or more
   *  than the full net. */
  onPartial?: (amount: number, walletId: string) => Promise<void>;
  onClose: () => void;
}

// Used for both a person's whole settle-up and a single row. Either way the
// question is the same: this much changes hands — which wallet, if any? With
// `allowPartial`, "this much" becomes editable and the sheet turns into a
// payoff tool: pay part of the balance, all of it, or more than it.
export default function SettleUpSheet({
  title, personName, net, currency, allowPartial, onConfirm, onPartial, onClose,
}: Props) {
  const incoming = net > 0;
  const full = round2(Math.abs(net));
  // A zero net moves nothing, so there is nothing to take an amount for.
  const partial = Boolean(allowPartial) && net !== 0;

  // Prefilled with the whole balance so settling in full stays a single tap.
  const [amount, setAmount] = useState(partial ? String(full) : '');
  const [walletId, setWalletId] = useState<string>('');
  const [saving, setSaving] = useState(false);

  const entered = round2(parseFloat(amount));
  const valid = !isNaN(entered) && entered > 0;
  const isFull = valid && entered === full;
  const over = valid && entered > full;

  // What actually changes hands, for the wallet hint.
  const moving = partial ? (valid ? entered : 0) : full;

  const canConfirm = !saving && (
    partial ? valid && walletId.length > 0
            : net === 0 || walletId.length > 0
  );

  const handleConfirm = async () => {
    setSaving(true);
    if (partial && !isFull && onPartial) {
      await onPartial(entered, walletId);
    } else {
      await onConfirm(walletId || null);
    }
    setSaving(false);
    onClose();
  };

  const outcome = () => {
    if (!valid) return 'Enter how much changed hands.';
    if (isFull) return `Clears everything with ${personName}.`;
    if (over) {
      const flipped = round2(entered - full);
      return incoming
        ? `You’ll owe ${personName} ${fmt(flipped, currency)} after this.`
        : `${personName} will owe you ${fmt(flipped, currency)} after this.`;
    }
    return `${fmt(round2(full - entered), currency)} stays outstanding.`;
  };

  return (
    <BottomSheet onClose={onClose}>
      <p className="font-semibold text-white text-lg mb-1">{title}</p>

      {net === 0 ? (
        <p className="text-sm text-slate-500 mb-5">
          These cancel out exactly — nothing changes hands. Everything will be
          marked settled.
        </p>
      ) : (
        <p className="text-sm text-slate-500 mb-5">
          {incoming ? `${personName} owes you ` : `You owe ${personName} `}
          <span className={incoming ? 'text-emerald-400 font-semibold' : 'text-red-400 font-semibold'}>
            {fmt(full, currency)}
          </span>
          .
        </p>
      )}

      {partial && (
        <>
          <div className="flex items-baseline justify-between mb-1">
            <p className="text-xs text-slate-500">
              {incoming ? 'They pay' : 'You pay'}
            </p>
            <p className="text-[11px] text-slate-600 tabular-nums">
              of {fmt(full, currency)}
            </p>
          </div>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0.00"
            className="w-full rounded-xl bg-white/5 border border-[#1e2d40] px-4 py-2.5 text-sm text-white placeholder-slate-600 outline-none focus:border-blue-500/50"
          />
          <div className="flex gap-2 mt-2 mb-4">
            <button
              onClick={() => setAmount(String(round2(full / 2)))}
              className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Half
            </button>
            <button
              onClick={() => setAmount(String(full))}
              className="rounded-lg border border-[#1e2d40] bg-white/5 px-2.5 py-1 text-xs text-slate-400 hover:text-white transition-colors"
            >
              Full
            </button>
          </div>
        </>
      )}

      {net !== 0 && (
        <>
          <p className="text-xs text-slate-500 mb-2">
            {incoming ? 'Received into' : 'Paid from'}
          </p>
          <WalletPicker value={walletId} onChange={setWalletId} />
          <p className="mt-2 text-[11px] text-slate-600">
            {walletId === ''
              ? 'Pick the wallet the money moved through.'
              : `${fmt(moving, currency)} ${incoming ? 'enters' : 'leaves'} this wallet.`}
          </p>
        </>
      )}

      {partial && (
        <p className="mt-4 text-[11px] text-slate-500">{outcome()}</p>
      )}

      <button
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="mt-5 w-full rounded-xl bg-blue-600 py-3.5 font-semibold text-white disabled:opacity-40"
      >
        {saving
          ? (partial && !isFull ? 'Recording…' : 'Settling…')
          : (partial && !isFull ? 'Record payment' : 'Mark settled')}
      </button>
    </BottomSheet>
  );
}
```

Note the lead paragraph changed from `pays you` to `owes you`: with an editable amount below it, the sentence now states the balance rather than the transaction.

- [ ] **Step 2: Wire the person-level sheet**

In `src/components/DebtPersonSection.tsx`, pull `recordDebtPayment` out of the context. Line 18 currently reads:

```tsx
  const { setDebtEntrySettled, deleteDebtEntry, settleUpPerson, reverseSettleBatch } = useApp();
```

Replace with:

```tsx
  const { setDebtEntrySettled, deleteDebtEntry, settleUpPerson, reverseSettleBatch,
          recordDebtPayment } = useApp();
```

- [ ] **Step 3: Pass the new props**

In the same file, find the person-level `SettleUpSheet` usage (~line 110). Replace the block:

```tsx
      {settleOpen && (
        <SettleUpSheet
          title={`Settle up with ${person.name}`}
          personName={person.name}
          net={net}
          currency={currency}
          onConfirm={wid => settleUpPerson(person.id, wid)}
          onClose={() => setSettleOpen(false)}
        />
      )}
```

with:

```tsx
      {settleOpen && (
        <SettleUpSheet
          title={`Settle up with ${person.name}`}
          personName={person.name}
          net={net}
          currency={currency}
          allowPartial
          onConfirm={wid => settleUpPerson(person.id, wid)}
          onPartial={(amt, wid) => recordDebtPayment(person.id, amt, wid)}
          onClose={() => setSettleOpen(false)}
        />
      )}
```

Leave the per-row `SettleUpSheet` (~line 121) untouched — no `allowPartial`, so it renders exactly as before.

- [ ] **Step 4: Verify it compiles and lints**

Run:

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

Run:

```bash
npm run lint
```

Expected: `✖ 8 problems (2 errors, 6 warnings)` — the pre-existing baseline, unchanged. Any higher count is yours.

- [ ] **Step 5: Manual pass — partial payment toward you**

Run `npm run dev` and open the debts page. Set up a person who owes you two entries, e.g. ₱300 and ₱200, so the card reads **₱500 owes you**. Note the balance of the wallet you will use.

Tap **Settle up**. Confirm:
- the amount field is prefilled `500`
- the label above reads `They pay`, with `of ₱500` on the right
- the outcome line reads `Clears everything with {name}.`
- the button reads `Mark settled`

Now type `250`. Confirm the outcome line becomes `₱250.00 stays outstanding.` and the button becomes `Record payment`. Pick a wallet — the hint should read `₱250.00 enters this wallet.` Confirm.

Expected after: the card reads **₱250 owes you**; the two original entries are still listed at ₱300 and ₱200, unchanged; a third row `{name} paid you` shows `-₱250.00` with a `←` arrow; the wallet balance is up by ₱250.

- [ ] **Step 6: Manual pass — undo**

Tap the 🗑 on the `{name} paid you` row.

Expected: the card returns to **₱500 owes you** and the wallet balance returns to what it was before Step 5. This is existing `deleteDebtEntry` behavior — if it fails, the payment row was built wrong, not the delete.

- [ ] **Step 7: Manual pass — partial payment from you**

Add an entry in the other direction so a person's card reads **you owe**, e.g. ₱400. Tap **Settle up**.

Confirm the label reads `You pay`, the wallet section reads `Paid from`, and after typing `150` the hint reads `₱150.00 leaves this wallet.`

Confirm. Expected: card reads **₱250 you owe**; a `Paid {name}` row appears at `+₱150.00` with a `→` arrow; wallet balance is down by ₱150.

- [ ] **Step 8: Manual pass — full amount still settles**

On any person with an open balance, tap **Settle up**, leave the prefilled amount alone, pick a wallet, and confirm.

Expected: identical to the old behavior — every open entry including any payment rows disappears into `▾ Show N settled`, one movement for the net hits the wallet, and reopening the batch from the settled list restores everything.

- [ ] **Step 9: Manual pass — overpayment**

On a person who owes you ₱500, tap **Settle up** and type `700`.

Expected: outcome line reads `You’ll owe {name} ₱200.00 after this.` Confirm, and the card flips to **₱200 you owe** with three open rows.

Repeat in the other direction — on a person you owe ₱400, type `600` — and confirm the line reads `{name} will owe you ₱200.00 after this.`

- [ ] **Step 10: Manual pass — nothing else moved**

Two regressions to rule out:
- **Zero net.** Give a person equal and opposite open entries (e.g. ₱200 each way) so the card reads **₱0 settled up**. Tap **Settle up**: no amount field, no chips, the `These cancel out exactly` copy, and a `Mark settled` button that works with no wallet picked.
- **Per-row ✓.** Tap the ✓ on any single open entry. The sheet must show no amount field and no chips — just the wallet picker and `Mark settled`. One intended difference: the lead line now reads `{name} owes you ₱300.00` where it used to read `{name} pays you ₱300.00`, because Step 1 restated that sentence as a balance. Everything else is as before.

- [ ] **Step 11: Commit**

```bash
git add src/components/SettleUpSheet.tsx src/components/DebtPersonSection.tsx
git commit -m "feat: settle up takes any amount, not just the whole balance

The sheet prefills the full net so squaring up stays one tap, and edits
down to a partial payment or up past the net to flip who owes whom."
```

---

### Task 3: Summary tiles count per-person nets

Independent of Tasks 1-2 and separately reviewable, but the feature makes it necessary: without it, a partial payment inflates both the `You're owed` and `You owe` tiles.

**Files:**
- Modify: `src/components/AppContext.tsx:557-566` (`debtTotals`)

**Interfaces:**
- Consumes: existing `debtEntries`
- Produces: no signature change. `totalOwedToMe` and `totalIOwe` keep their names and types; only how they are computed changes.

- [ ] **Step 1: Rewrite `debtTotals`**

In `src/components/AppContext.tsx`, replace the whole `debtTotals` block (~line 557):

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

with:

```tsx
  // Open entries only — settled debts are history, not balance.
  //
  // Netted per person, not summed gross. One person cannot both owe you and be
  // owed by you at the same time; only their balance is real. Summing face
  // values would count a part-paid debt on both sides and report a position
  // that matches no card on the page.
  const debtTotals = useMemo(() => {
    const netByPerson = new Map<string, number>();
    for (const e of debtEntries) {
      if (e.settledAt) continue;
      const signed = e.direction === 'owed_to_me' ? e.amount : -e.amount;
      netByPerson.set(e.personId, (netByPerson.get(e.personId) ?? 0) + signed);
    }

    let totalOwedToMe = 0;
    let totalIOwe = 0;
    for (const net of netByPerson.values()) {
      if (net > 0) totalOwedToMe += net;
      else if (net < 0) totalIOwe -= net;
    }
    return { totalOwedToMe, totalIOwe };
  }, [debtEntries]);
```

Grouping by `personId` off the entries themselves, rather than iterating `debtPeople`, keeps the dependency array at `[debtEntries]` and cannot silently drop an entry whose person is mid-delete.

- [ ] **Step 2: Verify it compiles and lints**

Run:

```bash
npx tsc --noEmit
```

Expected: no output, exit code 0.

Run:

```bash
npm run lint
```

Expected: `✖ 8 problems (2 errors, 6 warnings)` — the pre-existing baseline, unchanged. Any higher count is yours.

- [ ] **Step 3: Manual pass — tiles agree with the cards**

Run `npm run dev` and open the debts page with at least two people, one of whom has a partial payment recorded against them (redo Task 2 Step 5 if you undid it).

Expected: `You’re owed` equals the sum of every card reading `owes you`, `You owe` equals the sum of every card reading `you owe`, and `Net` is unchanged from before this task.

- [ ] **Step 4: Manual pass — the pre-existing case**

Give one person both an open `They owe me` entry of ₱300 and an open `I owe them` entry of ₱100, with no payment rows.

Expected: their card reads **₱200 owes you**, and they contribute ₱200 to `You’re owed` and ₱0 to `You owe`. Before this task they would have contributed ₱300 and ₱100.

- [ ] **Step 5: Commit**

```bash
git add src/components/AppContext.tsx
git commit -m "fix: debt totals net per person instead of summing face values

A part-paid debt was counted on both sides at once, so the tiles reported
a position that matched no card on the page."
```

---

## Done when

- A person's Settle up takes any amount and the card, the wallet, and the transactions feed all agree afterward.
- Confirming the prefilled amount behaves exactly as Settle up did before.
- The per-row ✓ and the zero-net case are visibly unchanged.
- `npx tsc --noEmit` and `npm run lint` are clean.
