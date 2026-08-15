# Natural-language expense entry — a parser, not a chatbot

_2026-08-09_

## The problem

Logging an expense is the most repeated action in the app, and it costs four
fields every time: amount, category, wallet, note (`src/app/expenses/new/page.tsx`).
The friction is not in any one field — it is in the fact that a user who already
knows "500 groceries, GCash" has to decompose that into a form.

The obvious answer is "add an AI assistant". The useful answer is narrower.

### Why this is not a chat feature

A chat surface over the user's whole financial state is the expensive version:
it needs a ~10K-token context per turn (a month of expenses, wallets, moves,
debts, bills), a message thread UI, and a server route that streams. It costs
roughly ₱125/user/month and — more importantly — it is a general-purpose
capability answering questions the dashboard already answers.

Natural-language *entry* is the opposite shape. One input string, one structured
object, no conversation, no memory, no tools, ~500 tokens of context. Everything
below follows from holding that frame:

**This is a parser. Its output is a form prefill, never a database write.**

## Scope

**v1 — a single simple expense.** One amount, one category, one wallet, a note.

**Deferred — anything involving another person.** See _Shared expenses_ below.
v1 detects these and declines rather than attempting them.

Dates are also out of scope: `addExpense` (`AppContext.tsx:594`) takes
`Omit<Expense, 'id' | 'date'>` and always stamps `now`. There is nowhere for a
parsed date to go, and a parser that correctly extracts "yesterday" into a field
we silently discard is worse than one that never saw the word.

## Design

### 1. Deterministic first, model second

Most real input is already machine-parseable:

```
500 groceries gcash
 │      │        └─ exact match against the user's wallet names
 │      └─ keyword map → food
 └─ /(\d[\d,]*\.?\d*)\s*k?/ → 500
```

A regex and two lookups. Zero cost, zero latency, no network, no API key, runs
client-side. It handles `grab 240`, `meralco 3200 bdo`, `500 groceries gcash`.

It falls apart on exactly the interesting cases: `kain sa jollibee 320`,
`1.5k jeep pamasahe`, typos, Taglish, unusual word order. Those go to the model.

```ts
const quick = parseDeterministic(text, wallets, categoryKeys);

// Amount plus at least one other field → good enough.
if (quick.amount && (quick.category || quick.walletName)) {
  return quick;                    // 0ms, ₱0, no network
}
return await parseWithClaude(text); // the messy tail only
```

This wins on three axes, not just cost. The common case becomes **instant** — no
round trip at all, which matters more than the money for a feature whose whole
value is feeling fast. It works **offline**. And if ~70% of input hits the fast
path, the API bill drops by ~70%.

The deterministic parser must **abstain honestly**, exactly like the model does.
If it cannot find a wallet it returns `null`; it never falls back to "first
wallet in the list".

### 2. The schema is the contract, not the prompt

Use structured outputs (`output_config.format`), not "reply with JSON" and not
tool use. Schema conformance is *constrained*, not requested — invalid output is
unreachable, so there is no parse-retry loop.

Build the enums from **this user's live rows**, at request time:

```ts
z.object({
  amount:     z.number().positive(),
  category:   z.enum(categoryKeys).nullable(),
  walletName: z.enum(walletNames).nullable(),
  note:       z.string(),
})
```

Because `category` is an enum of the user's six built-ins plus their custom
keys, the model **cannot** emit `"groceries"` or `"Food"`. That entire class of
bug — and the normalisation layer it would otherwise spawn — is structurally
impossible. It was not prompted away; it was made unrepresentable.

Wallet uses **name**, not `walletId`. UUIDs carry no meaning for a language
model; names do. Resolve name → id in our own code. General rule: give the model
the semantic handle, keep opaque identifiers on our side.

Where a split is involved, extract *parameters* and compute in code —
`myShareRatio: 0.5`, never `myShare: 250`. Three-way splits give ₱333.33 and
someone has to eat the extra centavo; that rounding policy is ours to own
deterministically, not one to re-litigate on every parse.

### 3. Four layers of protection, ranked

| Layer | Example | Can it fail? |
| --- | --- | --- |
| **1. Structural** — the schema | `category` is an enum of real keys | **No.** Invalid output is unreachable. |
| **2. Deterministic code** | Resolve name → row; reject non-matches; bound the amount | **No.** A testable pure function. |
| **3. UX** | Prefill and confirm; never auto-submit | Only if the user isn't looking |
| **4. Prompt text** | "Prefer null over guessing" | **Yes**, probabilistically; drifts across model versions |

Every constraint that can be pushed down to layers 1–3 **must** be. Layer 4 is
the only kind of rule that can be quietly ignored, and piling emphatic rules
into a prompt degrades rather than stacks — when six instructions are all marked
critical, the emphasis stops carrying information, and the parser gets more
hedging, not more correct.

For v1 this leaves roughly **one sentence** of prompt-level protocol:

> "Set walletName to null unless the user names or clearly implies a wallet."

Everything else already lives in a stronger layer.

### 4. Protection is proportional to blast radius

Not all fields deserve equal rigour, and treating them uniformly is what makes a
system feel bureaucratic.

| Field | Habit evidence | If wrong | Confidence bar | Ask when unsure? |
| --- | --- | --- | --- | --- |
| `note` | — | Nothing | — | **Never** |
| `category` | Keyword → category from own past notes | One chart skews; 1 tap to fix | **Low** — guess freely | **Never** |
| `walletId` | Wallet used for this category, last 20 | Two balances, plus every derived number | **High** (≥5 samples, ≥60%) | **Yes** |
| debt person | Exact match on `DebtPerson` | Creates a persistent entity | **Exact only** | **Always** |
| `amount` | — | Everything downstream | Never inferred | Fail the parse |

The rule: **confidence bar and willingness to ask both scale with blast radius —
neither scales with how often the field is ambiguous.** Those are independent
axes, and conflating them is the usual mistake.

Two cases that flip the intuition:

- **Category is ambiguous constantly and should almost never be asked about.**
  `load 100` — bills or other? Genuinely unclear. But a wrong category costs one
  tap and skews one chart. Interrupting on every ambiguous category would fire
  on a large fraction of input and make the feature exhausting.
- **Debt person is rarely ambiguous and should always be confirmed.** "John" is
  linguistically obvious, but resolving it may *create a `DebtPerson` row* that
  lives on the board forever, and a fuzzy match onto an existing "John D."
  attaches money to the wrong human. **A parse must never create an entity.**

### 5. The resolution ladder

Every field flows through one resolver: **stated → confident habit → ask → absent.**

```ts
type Resolution<T> =
  | { mode: 'stated';  value: T }
  | { mode: 'assumed'; value: T; basis: string }
  | { mode: 'ask';     options: T[] }
  | { mode: 'absent' };

interface FieldPolicy {
  minSamples: number;
  minShare: number;
  askWhenUnsure: boolean;   // set by blast radius, not by ambiguity rate
}

const POLICY: Record<string, FieldPolicy> = {
  category:   { minSamples: 0,        minShare: 0,   askWhenUnsure: false },
  wallet:     { minSamples: 5,        minShare: 0.6, askWhenUnsure: true  },
  debtPerson: { minSamples: Infinity, minShare: 1,   askWhenUnsure: true  },
};
```

`debtPerson` with `minSamples: Infinity` can never reach the assume branch — it
is exact-match or ask, expressed as a reviewable one-line policy rather than
logic buried in a branch. Adding a field later means adding a policy row.

Two sources of inference, and only one belongs to the model:

| Source | Question | Resolved by |
| --- | --- | --- |
| **Language** | Did the user *say* it? | The model |
| **Habit** | What do they *usually* do? | **Our code** |

Habit is deterministic, explainable, free, and computable from `expenses`, which
`AppContext` already holds in memory. Paying tokens for a worse, unauditable
answer would be strictly worse. So `null` from the model is not a dead end — it
is a handoff.

### 6. The assumption must not look like the parse

This is the mechanism that makes ambiguity safe, and it is load-bearing rather
than decorative.

```
  ₱500                              ← from text, solid
  🍔 Food                           ← from text, solid
  ┌ ─ ─ ─ ─ ─ ─ ─ ┐
  ┊ 📱 GCash  usually ┊  ▾          ← ASSUMED: dashed, labelled, tappable
  └ ─ ─ ─ ─ ─ ─ ─ ┘
  groceries
```

If a defaulted wallet renders identically to a stated one, the user learns to
trust the field uniformly — which is precisely how a wrong default slips
through. The dashed border says *nobody told us this, we picked it*.

Cost when the assumption is right: **zero extra taps**. When wrong: **one**.
Against four hand-entered fields today, both are wins — which is the answer to
"doesn't confirmation defeat the point?". **The baseline is the current form,
not mind-reading.** Confirmation is not the tax on the feature; it is the
feature working correctly.

When confidence is low, the same field renders as ranked buttons instead:

```
  Which wallet?
  [📱 GCash] [💵 Cash] [🏦 BDO]   ⌄ 9 more
```

Ranked by habit, not alphabetically — a realistic user has 8–12 wallets
(`walletPresets.ts`), and twelve buttons is a wall while three plus "more" is a
choice. The habit signal is never wasted: **confident → it becomes the default;
unconfident → it becomes the ordering.** In the ask branch the right answer is
usually the first button, which quietly recovers most of the tap spent asking.

These are field *states*, not chat turns. A question rendered as a sentence
costs ~2s to read where a labelled row costs ~200ms, promises conversational
ability the architecture does not have, and invites a second model call. **A
button tap is a form input, not a message — it is never sent back to the model.**

### 7. Learning falls out of the threshold

The system should ask when it does not know the user and stop once it does. That
trajectory needs no learning system — it is what a confidence threshold over a
rolling window already does:

| Expense # | Pool | Top share | Behaviour |
| --- | --- | --- | --- |
| 1 | 0 | — | **Asks** (no evidence) |
| 2–4 | 1–3 | — | **Asks** (below sample floor) |
| 5–8 | 4–7 | 75% | **Assumes**, dashed |
| 20+ | 20 | 90% | **Assumes**, near-invisible |

**Do not persist learned preferences.** A rolling window over the last N rows
gives what a stored preference cannot: it **unlearns for free**. Switch from
GCash to Maya for groceries and the default follows within ~10 expenses. A
stored preference stays sticky until we build decay, an override UI, and a
migration — and still earns the "why does it keep suggesting the wrong one"
complaint.

**Correction is already the training signal.** A corrected wallet lands in
`expenses`, which is the exact data the next resolution reads. The loop closes
with no event logging and no preference writes.

**Known risk — self-reinforcing defaults.** An assumption accepted without being
read becomes evidence for itself. Two mitigations, both already in the design:
the provisional styling is what keeps the user's eye on the field (never "clean
it up" to match stated values), and the ceiling on trust is *shown, unasked* —
a 90% share must never become auto-submit. Weighting corrected entries above
silently-accepted ones is theoretically right and over-engineering for v1.

## Shared expenses — deferred, with the analysis recorded

Worked case: _"John and I went to dinner, I paid, we split ₱500 50/50."_

This is **three writes across two subsystems**:

```ts
addExpense({ amount: 250, category: 'food', walletId: W, note: 'dinner' })
addDebtPerson({ name: 'John', emoji: '🙂' })            // returns new id
addDebtEntry({ personId: john, direction: 'owed_to_me',
               amount: 250, walletId: W, note: 'dinner' })
```

The **data model already handles this correctly** (`AppContext.tsx:793`):

| | Wallet W | Spending total | Debt board |
| --- | --- | --- | --- |
| Expense (250, food) | −250 | +250 | — |
| Debt entry → `debt_out`, "Spotted John" | −250 | *excluded* | John owes 250 |
| **Net** | **−500** | **250** | **250 open** |

The wallet drops by the ₱500 that actually left it; spending counts only the
₱250 consumed — correct precisely because of the existing "lending is not
consumption" decision. **The entry path, not the model, is what cannot express
this.**

Three ambiguities, one unresolvable: whether ₱500 is the total or John's half
(ambiguous to a human reader too); which wallet; and which John.

The failure mode is why v1 declines. Fed to a single-expense schema, the parse
does not error — it returns `{ amount: 500, category: "food" }` and **John
silently vanishes**. Nothing on any screen looks broken; ₱250 owed simply ceases
to exist. That is the worst bug class: plausible, silent, and unfalsifiable from
the UI.

Deferring is also justified by the write path: three writes with no transaction.
If `addExpense` succeeds and `addDebtEntry` fails, the result is an expense with
no debt record and no indication. `addDebtEntry` already reasons about partial
failure (its comment on inserting the movement first so a failure leaves "a bare
movement in the feed — visible and deletable"); compound entry multiplies that
surface and deserves its own design pass.

**v1 behaviour: detect and decline.** "Does this involve another person?" is a
near-trivial classification; decomposing it correctly is not. On detection,
route to the existing Add Debt sheet with amount and note prefilled — still
saves typing, without guessing about money.

## Reversibility buys the right to guess

`deleteExpense` (`AppContext.tsx:617`) restores the wallet balance exactly;
`deleteDebtEntry` calls `reverseMoves`. Prevention and reversibility are
substitutes: a mistake that is visible in the feed and undoable in one tap needs
to be **catchable**, not impossible.

The corollary is where effort belongs: **make wrong entries easy to spot, not
impossible to create.** A "parsed" badge in the transaction feed would do more
for data quality than any amount of prompt text.

## Cost and model choice

~500 input tokens (system prompt + two enum lists), ~250 output including
thinking:

| Model | Per parse | 300/mo | 3,000/mo |
| --- | --- | --- | --- |
| Haiku 4.5 | ~$0.0009 | $0.27 | $2.70 |
| Sonnet 5 | ~$0.005 | $1.50 | $15 |
| Opus 5 | ~$0.009 | $2.70 | $27 |

The hybrid fast path removes ~70% of these calls again.

**Start on Sonnet 5**, then test Haiku 4.5 against the eval set and drop down if
it holds. Sonnet over Opus because the schema does the accuracy work — this is
constrained extraction from a short string, not reasoning.

Two API notes:

- **`effort` is unsupported on Haiku 4.5** and returns a 400. Drop the parameter
  when testing it.
- **On Opus 5, thinking is on by default.** Omitting `thinking` does *not* mean
  no thinking, and a parser that deliberates for seconds is a bad parser. Use
  `effort: "low"`. Set `max_tokens` ~2048: the real output is ~80 tokens, but
  `max_tokens` caps thinking *plus* response, so a tight ceiling produces
  truncation that presents as intermittent failure.

## Security

The API key is a **bearer credential to a funded account** — unlike the Supabase
publishable key in `src/lib/supabase.ts:5-6`, which is designed to be public and
backed by RLS. Same-looking variable, opposite threat model.

- `ANTHROPIC_API_KEY`, **never** `NEXT_PUBLIC_ANTHROPIC_API_KEY`. The prefix is
  an instruction to inline the value into the browser bundle.
- Read only inside `src/app/api/**/route.ts`; never in a `'use client'` file.
  `new Anthropic()` picks it up automatically — passing it explicitly invites an
  accidental client-side import.
- Set a **console spend limit before the first call**. This is an authenticated
  endpoint that costs money per request; a cap turns a runaway bill into a
  failed request.
- Model output is **untrusted input that happens to be well-shaped**. Resolve
  every name against real rows before writing. An enum is a strong constraint,
  not a security guarantee.

## Open questions

- Is `load` a `bills` or `other` category? The eval set forces a decision; the
  model cannot know our intent.
- Thresholds `≥5 samples` / `≥60% share` are starting values, to be tuned
  against ask-rate.
- Does the deterministic parser earn a Taglish keyword map, or does everything
  non-English go to the model?

## Success metric

**Ask-rate** on the eval set — the share of realistic inputs that need user
input rather than a confirmable guess.

- **under ~5%** — clear win; the guardrails are invisible
- **over ~20%** — more annoying than the form; loosen abstention or narrow scope

If ask-rate rises after adding a protocol, that protocol cost more than it
bought, regardless of how sensible it read.

## Build order

1. **Eval set** (~30 cases) — written *before* any tuning, as input → expected
   output. Includes `"dinner 250"` expecting a simple expense, to catch
   over-tuning toward person-detection.
2. **Deterministic parser** — client-side, no API dependency, independently
   useful.
3. **Resolver + policies** — `Resolution<T>`, `FieldPolicy`, habit tally over
   `expenses`.
4. **Four-state field component** — stated / assumed / ask / absent.
5. **API route** — JWT verification, per-user rate limit, structured outputs.
   The largest and most security-sensitive step; it is the app's first server
   surface.
6. **Compound / shared expenses** — only after the above is in use, and only
   with a transaction story.
