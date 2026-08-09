# Debt–Wallet Linkage — Design

_Designed 2026-08-09. Follows on from the Debt Board (`debtplan.md`)._

## Problem

The Debt Board is a standalone ledger: settling never touches a wallet. That was
deliberate, and the accounting half of it is right — what you're owed is a
receivable, not cash, so it should not inflate a wallet balance.

But it leaves the *movement* unrecorded. Spotting Marco ₱250 from GCash costs four
actions today:

1. Add the debt entry
2. Go to Wallets, withdraw ₱250 from GCash — or GCash is overstated
3. Tick settle when he repays
4. Go to Wallets, add ₱250 to Cash — or Cash is understated

Steps 2 and 4 get skipped, and nothing complains. Balances drift silently until the
next Reset, when the numbers mysteriously disagree. Silently wrong balances are worse
than a slightly heavier form.

## Goal

Let a debt optionally carry a wallet, so the balance moves when the money actually
moves — without turning the debt board into a wallet system, and without making
capture slower for debts where no tracked wallet was involved.

## Non-goals

- **Splitting one expense across people.** Paying for a group meal and marking that
  others owe part of it stays out. That's a change to the *expense*, not the debt.
- **Partial repayment.** An entry is open or settled; there is no "Marco paid ₱100 of
  ₱250". Add two entries if you need that.
- **Requiring a wallet.** Blank stays valid and stays the default.
- **Wiring up `deleteMoneyMove` in the Activity UI.** Still unbuilt, still out of scope.

---

## Data model

### Two new `MoneyMoveKind` values

```ts
export type MoneyMoveKind =
  | 'earned' | 'withdrawn' | 'moved'
  | 'debt_out' | 'debt_in';
```

| Kind | Fires when | Balance |
|---|---|---|
| `debt_out` | You cover someone (`owed_to_me` created), or you pay back what you owed (settle-up with a negative net) | − |
| `debt_in` | Someone repays you (settle-up with a positive net), or someone lends you cash (`i_owe` created) | + |

Named for direction rather than story. `'lent'`/`'repaid'` reads better until Marco
lends *you* cash — money in, but not a repayment.

**Both are excluded from every total**, exactly as `'moved'` already is:

- `receivedThisMonth` (AppContext) filters `kind === 'earned'` — unaffected, but this
  is the bug the naming exists to prevent. A repayment recorded as `earned` would
  inflate your actual-vs-expected income row and go unnoticed for months.
- `monthSpent` / `monthEarned` (Activity page) skip anything whose `flow` is `'moved'`.
  The new kinds map to `flow: 'moved'` for totalling purposes while rendering with
  their own icon and label.

Lending is not consumption and a repayment is not income. Both are your own money
changing location.

### Three nullable columns on `debt_entries`

| Column | Meaning |
|---|---|
| `wallet_id uuid null` | Which wallet the *creation* movement hit. `null` = no wallet involved (they paid the vendor directly) |
| `move_id uuid null` | The `money_moves` row created at creation, so deleting the entry can find and reverse it |
| `settle_move_id uuid null` | The row created when this entry was settled. **Shared by every entry in the same settle-up batch** |

`settle_move_id` resolves the hardest case. A settle-up nets ₱250 owed against ₱180
owing into a single ₱70 movement, so no individual row owns a share of it. The batch
is therefore the unit of reversal — see *Batch reversal* below.

### Rejected alternative

Pointing `money_moves` at debt rows with an FK instead. It inverts the dependency:
the Activity page would have to join the debt tables just to render a label, when a
plain note on the move (`"Marco settled up"`) does the job with no coupling.

---

## Flows

### Adding an entry

The add sheet gains one optional wallet picker, below Date, labelled to match the
chosen direction:

- `owed_to_me` → **"Paid from"** — money leaves that wallet
- `i_owe` → **"Received into"** — money arrives in that wallet

Leaving it blank is valid and is the default. It means no tracked wallet was
involved, which is the common case when someone covers your meal.

| Direction | Wallet set | Effect |
|---|---|---|
| `owed_to_me` | yes | `debt_out` move, wallet − amount, note `"Spotted {name}"` |
| `i_owe` | yes | `debt_in` move, wallet + amount, note `"Borrowed from {name}"` |
| either | blank | No move. `wallet_id`, `move_id` stay null |

**`addDebtEntry` stops being optimistic when a wallet is set.** It needs the inserted
move's real id to store in `move_id`, the same reason `addDebtPerson` already awaits
its insert. With no wallet it can stay optimistic.

### Per-row settle tick

Unchanged and deliberately dumb: a one-tap bookkeeping toggle that **never** touches a
balance and never creates a move. It exists for corrections and for debts squared in
ways you don't track.

The one exception: un-ticking a row whose `settle_move_id` is set triggers batch
reversal (below), because that row's settled state is owned by a movement.

### Settle up

The "Settle up" button opens a small sheet — the one obvious place where money moves.
It shows the net and offers an optional wallet:

- Net **> 0** (they owe you) → `debt_in`, wallet **+ net**, note `"{name} settled up"`
- Net **< 0** (you owe them) → `debt_out`, wallet **− |net|**, note `"Settled up with {name}"`
- Net **= 0** → no move regardless of wallet choice; the entries cancel out
- Wallet blank → no move, behaves exactly as Settle up does today

All open entries get `settled_at` stamped. When a move was created, every one of them
also gets `settle_move_id` set to it.

### Batch reversal

Given a `settle_move_id` S:

1. Reverse S's balance effect on its wallet
2. Delete S's `money_moves` row
3. Clear `settled_at` **and** `settle_move_id` on every entry referencing S

Triggered by un-ticking any row in the batch, behind a confirm that names the
consequence: *"This was settled together with 2 other items. Un-settling reopens all
3 and returns ₱70.00 to GCash."*

Reversing a third of a netted movement has no coherent meaning. Reopening the batch
does, and it is explainable in one sentence.

### Deleting

- **An entry** — if `move_id` is set, reverse it and delete the move. If
  `settle_move_id` is set, run batch reversal first (same confirm), then delete.
- **A person** — reverse every entry's `move_id`, plus each *distinct* `settle_move_id`
  exactly once, then delete their moves and the person. The existing confirm copy
  gains a line naming the net balance effect when there is one.

This mirrors what `deleteMoneyMove` already does for wallet balances.

---

## Migration

`money_moves.kind` may carry a `CHECK` constraint from its original migration; the DDL
was applied by hand and isn't in the repo. The migration drops any check constraint on
the table whose definition mentions `kind`, by name lookup, so it is correct either
way:

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

`on delete set null` on all three matters. Deleting a wallet, or deleting a money move
through some future UI, must not cascade away debt history — the debt is still real
even once the record of the movement is gone. The entry simply reverts to behaving
like an unlinked one.

---

## Known risks

1. **Deleting a wallet orphans the linkage.** `wallet_id` and `move_id` go null and the
   balance is not reversed, because the wallet no longer exists to reverse onto. The
   debt entry survives as an unlinked entry. Acceptable — the alternative is blocking
   wallet deletion on debt history, which is worse.
2. **Two sequential writes on a wallet-linked add.** The move is inserted before the
   entry, so a failure between them leaves a move with no entry: a bare withdrawal in
   the feed. Rare, visible, and manually deletable — preferred over the opposite order,
   which would leave an entry claiming a movement that never happened.
3. **The Activity page's money-move mapping ends in a fallback `return`** that renders
   anything unrecognised as "Transfer 🔄". Both new kinds must be handled explicitly or
   they will silently mislabel rather than error.
4. **Reversal arithmetic reads balances from React state**, as every existing mutation
   does. Two rapid reversals against the same wallet could race. Consistent with the
   rest of the app; not worth diverging here.
