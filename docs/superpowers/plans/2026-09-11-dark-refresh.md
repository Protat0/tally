# Tally Dark Refresh Implementation Plan

> **For agentic workers:** Executed inline in the authoring session (user preference: no subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the whole app to the Claude Design "Tally Refresh Dark" board: warm near-black surfaces, teal as the only tap-and-brand color, green/amber/red for meaning only.

**Architecture:** The palette becomes Tailwind v4 `@theme` tokens named by role (`bg-surface`, `text-ink-3`, `bg-primary`, `text-growth-text`…). The five designed screens (dashboard, budget, debts, add-funds sheet, desktop dashboard + nav) are rewritten by hand to match the board. Every other file is migrated by a one-off codemod that maps the old hard-coded classes (`bg-[#111827]`, `slate-*`, `blue-*`…) onto the same tokens.

**Tech Stack:** Next 16.2.4 (App Router), React 19, Tailwind v4 (CSS-first config), `next/font/google`.

**Spec:** Claude Design project `f782e84f-bc8f-4364-9764-2e26b2809c26`, file `Tally Refresh Dark.dc.html`.

## Global Constraints

- Teal is the only color for "tap this" and brand. On dark it is lifted: fill `#14B8A6`, hover `#2DD4BF`, text `#5EEAD4`, text-on-fill `#06302C`, hero card `#0F766E`.
- Green `#22C55E` = positive money only, never a button. Text shade `#4ADE80`.
- Amber `#F59E0B` = nearing a limit only, never decorative (electricity and payday are not amber). Text shade `#FBBF24`.
- Red `#EF4444` = overspend, negative balance, you owe. Text shade `#F87171`.
- Page `#121110`, cards `#1C1A19` with `#34302D` hairline, tracks/pills `#2A2725`.
- Text `#F5F3F0`; secondary `#C4BEB8` / `#A39C95`; muted `#9B948C`.
- Tints: teal `#0F2E2B`/`#1F5C55`, green `#10291A`/`#1E5233`, amber `#2E2410`/`#6B4B12`, red `#2E1618`/`#6B2A2A`.
- Font: Public Sans. Money figures use `tabular-nums`.
- Copy says "cycle", not "month", wherever the number is a cycle (see commit a143e9f).
- No behaviour changes. Only presentation, plus copy the design renames ("Debt Board" → "Debts").

## File map

| File | Change |
|---|---|
| `src/app/globals.css` | `@theme` tokens, Public Sans, base colors |
| `src/app/layout.tsx` | Public Sans font, `themeColor`, body classes |
| `src/components/ProgressBar.tsx` | `color` prop → `tone: Tone`, sizes, token fills |
| `src/components/HalfCircleProgress.tsx` | reuse `Tone`, token strokes |
| `src/components/BottomSheet.tsx`, `PageHeader.tsx` | sheet/header chrome |
| `src/components/BottomNav.tsx` | dot + label nav, teal active state |
| `src/components/GlobalFAB.tsx` | teal FAB, one accent for action chips, electric sheet off amber |
| `src/app/page.tsx` | dashboard rewrite (mobile + desktop) |
| `src/components/BudgetHero.tsx`, `CategoryCard.tsx`, `CategoryGrid.tsx`, `src/app/expenses/page.tsx` | budget screen |
| `src/components/ElectricSection.tsx` | electric accent amber → teal |
| `src/components/DebtSummary.tsx`, `DebtPersonSection.tsx`, `src/app/debts/page.tsx` | debts screen |
| `src/components/WalletCard.tsx` | add funds / withdraw / transfer sheet |
| `src/lib/categories.ts` | one chip color for every category |
| every other `src/**/*.tsx` | codemod |

## Known deviations from the board

- Category card "Set one" link is not added: the card is already a `<button>`, and buttons cannot nest. The pencil stays the route to setting a budget.
- The budget page keeps a settings cog on mobile, because the bottom nav drops Settings and the cog in each header is how you reach it.
- The dashboard keeps "Manage →" under the electric card. The dashboard has no other way to reach appliance setup.
- The desktop sidebar keeps `w-64` rather than 248px, so every page's `md:pl-64` offset still lines up.

---

### Task 1: Tokens, font, shell

**Files:** Modify `src/app/globals.css`, `src/app/layout.tsx`

- [ ] Replace the `:root` block and `@theme inline` in `globals.css` with a role-named `@theme` (values from Global Constraints) plus `--color-danger-strong: #DC2626` for destructive buttons, and `--color-ink-5: #78716C` for placeholders.
- [ ] `html`/`body` read `var(--color-canvas)` / `var(--color-ink)`; font-family `var(--font-public-sans)`; scrollbar thumb `var(--color-line)`; `::selection { background: #134E4A }`.
- [ ] `layout.tsx`: `Public_Sans({ variable: "--font-public-sans", subsets: ["latin"] })`, `themeColor: "#121110"`, body `bg-canvas text-ink antialiased`.
- [ ] Verify: `npx tsc --noEmit` passes.

### Task 2: Shared primitives and chrome

**Files:** `ProgressBar.tsx`, `HalfCircleProgress.tsx`, `BottomSheet.tsx`, `PageHeader.tsx`, `BottomNav.tsx`, `GlobalFAB.tsx`, `Providers.tsx`, `src/lib/categories.ts`, `CategoryDetailSheet.tsx` (call site)

**Interfaces produced:**
- `export type Tone = 'growth' | 'warning' | 'danger' | 'primary'` from `ProgressBar.tsx`
- `ProgressBar({ value, max, tone = 'primary', size = 'md', className, showLabel })`, sizes `sm` = 7px and `md` = 10px
- `HalfCircleProgress({ value, max, tone = 'primary', className })`

- [ ] ProgressBar: track `bg-raised`, fill `Record<Tone, string>` → `bg-growth|bg-warning|bg-danger|bg-primary`.
- [ ] HalfCircleProgress: track `stroke-raised`, arc `Record<Tone, string>` strokes, readout `text-ink`.
- [ ] BottomSheet: `bg-surface`, `md:border md:border-line`, shadow `0 -8px 32px rgba(0,0,0,.65)`, handle `bg-line`.
- [ ] PageHeader: 34px round buttons `border-line bg-surface text-ink-3`, hover `border-primary-text text-primary-text`; title 19px/22px bold.
- [ ] BottomNav mobile: `grid-cols-5`, `bg-surface border-t border-line`, 5px dot (`bg-primary` active, transparent otherwise), 11px label (`font-semibold text-primary-text` active, `text-ink-4` otherwise), `aria-current="page"`. Sidebar: 30px teal "T" tile, `text-primary-text` wordmark, rows with 6px dot (`bg-primary` / `bg-line`), active `bg-primary-tint text-primary-text font-semibold`, inactive `text-ink-2 hover:bg-canvas hover:text-ink`, footer email `text-ink-3` + teal "Sign out" text button.
- [ ] GlobalFAB: FAB `bg-primary text-on-primary hover:bg-primary-hover` with teal glow `0 6px 18px rgba(20,184,166,.28)`; every action chip `bg-primary-tint` / `text-primary-text`; electric sheet "Add time" tone = primary, "Remove time" tone = danger; focus `focus:border-primary`.
- [ ] Providers splash and auth logo: `bg-primary` tile with `text-on-primary` "T".
- [ ] categories.ts: every `color` → `bg-primary-tint border-primary-edge`.
- [ ] CategoryDetailSheet: `color=` → `tone=` with Tone values.

### Task 3: Dashboard (`src/app/page.tsx`)

- [ ] Mobile header: 26px teal "T" tile + `text-primary-text` "Tally"; 34px outlined cog.
- [ ] Desktop header (`hidden md:flex`, bottom border `divider`): "Dashboard" 22px + `"{cycleLabel} cycle · next payday in N days"`; buttons "Add expense" (outlined → `/expenses/new`) and "Add funds" (teal → `/wallets`).
- [ ] Balance hero `md:col-span-2 bg-primary-deep`: label `text-teal-100`, amount 38px/46px `text-teal-50`, dot + "across N wallets". Desktop only: three stats on the right, separated by `border-white/20`: projected savings (`text-green-200`, or `text-red-200` if negative), next payday, spending pace (color by tone via `Record<Tone,string>`: green-200/amber-200/red-200).
- [ ] Projected savings card: 8px growth dot (danger if negative), 30px amount `text-growth-text`, "realistic — if your pace holds", "up to … if you spend nothing more", amber notice button (`bg-warning-tint border-warning-edge`, `bg-warning` dot, `text-warning-text`), teal "How is this worked out?" toggle, breakdown in `bg-canvas`.
- [ ] Payday card (`md:hidden`): date 19px bold + pill `bg-raised border-line text-ink-2` "N days left".
- [ ] Spending pace card: tone-colored %, `ProgressBar tone`, pace label + "spent / expected"; desktop "Resets {cycle end}".
- [ ] Emergency fund card: `%` in `text-growth-text`, amount + "of target", growth bar, "Projected full by …".
- [ ] Electric card: amount, "this cycle"; pinned appliances as `role="switch"` rows on mobile (teal on / `line-strong` off) and ON/OFF tiles on desktop (`primary-tint`/`primary-edge` on, `canvas`/`line` off); "N of M running" + teal "Manage →".
- [ ] Grid order: hero (span 2) · savings | pace · emergency | electric.

### Task 4: Budget screen

**Files:** `BudgetHero.tsx`, `CategoryCard.tsx`, `CategoryGrid.tsx`, `src/app/expenses/page.tsx`, `ElectricSection.tsx`

- [ ] Page header: "Budget" + `"{cycleLabel} cycle"` in `text-ink-3`, mobile cog; drop the duplicate "Log Expense" button (the FAB's first action is the same route).
- [ ] BudgetHero loses its `monthLabel` prop. Card `bg-primary-tint border-primary-edge`, teal "Monthly budget" label, editable income at 34px, "income this cycle", split bar (allocated `bg-primary`, or `bg-danger` if over; remainder `bg-growth-edge`), Allocated / Unallocated (`text-growth-text`) or Over budget (`text-danger-text`), teal "Breakdown →".
- [ ] CategoryCard: drop the arc and use a flat `ProgressBar size="sm"` at every width. 26px teal icon tile, 14px semibold name, 20px amount (`text-danger-text` when over), caption `of ₱X · ₱Y left|over` with the tone text shade, border `danger-edge` when over, dashed `line-strong` with a striped track when no budget.
- [ ] CategoryGrid: add tile dashed `border-line-strong`.
- [ ] ElectricSection: hero on `bg-surface border-line`, label `text-ink-3`, running dot/text teal, running row `bg-primary-tint border-primary-edge`, toggle `bg-primary`.

### Task 5: Debts screen

**Files:** `DebtSummary.tsx`, `DebtPersonSection.tsx`, `src/app/debts/page.tsx`

- [ ] Page: title "Debts", right slot a teal "Add" text button, "By person" section label above the list.
- [ ] DebtSummary: `bg-primary-deep` hero; total 32px `text-teal-50`; three columns under a `border-white/20` rule. You're owed in `text-green-200`; you owe as a red dot + white; net as `+` green-200, or red dot + white when negative.
- [ ] DebtPersonSection header: 40px avatar circle with the person's emoji on a tint (green if they owe you, red if you owe, neutral if settled); "{name} owes you" / "You owe {name}" / "{name}"; 17px amount in the tone's text shade (or "All settled"); outlined teal "Settle up" pill that fills on hover; ghost trash button.

### Task 6: Add funds sheet (`WalletCard.tsx`)

- [ ] Sheet: `bg-surface`, handle, centered 18px title.
- [ ] Amount: muted 30px `₱`, borderless 46px input, 2px teal underline, "Goes to {wallet}" caption.
- [ ] "Source" label + pill chips (on: `border-primary bg-primary-tint text-primary-text`; off: `border-line bg-surface text-ink-2`).
- [ ] Transfer targets, fee and note fields on `bg-canvas`, with teal focus ring.
- [ ] CTA `bg-primary text-on-primary`, reading "Add ₱X from Salary" / "Withdraw ₱X" / "Transfer ₱X" once an amount is valid. Muted "Cancel".

### Task 7: Codemod the rest

**Files:** every `src/**/*.{ts,tsx}` except `*.test.ts`

- [ ] Run `scratchpad/retheme.mjs` (the mapping below). It prints per-file counts and any old-palette class left over.
  - Surfaces: `bg-[#0b0f1a]`→`bg-canvas`, `bg-[#111827]`/`bg-[#0e1420]`→`bg-surface`, `bg-[#1a2332]`/`bg-[#141d2e]`/`bg-white/5`/`bg-slate-700`→`bg-raised`, `bg-white/10`/`bg-white/20`/`bg-[#1e2d40]`→`bg-line`, `bg-white/15`/`bg-slate-600`→`bg-line-strong`, `border-[#1e2d40]`→`border-line`, `border-slate-600`→`border-line-strong`, decorative gradients → `bg-surface`.
  - Text: `text-white`/`text-slate-200`→`text-ink`, `slate-300`/`slate-400`→`ink-2`, `slate-500`→`ink-3`, `slate-600`→`ink-4`, `slate-700`→`ink-5` (placeholders follow the same steps).
  - Primary: `bg-blue-600|500`→`bg-primary`, `hover:bg-blue-500`/`active:bg-blue-700`→`…:bg-primary-hover`, `bg-blue-*/NN`→`bg-primary-tint`, `border-blue-500`→`border-primary`, `border-blue-*/NN`→`border-primary-edge`, `text-blue-400`→`text-primary-text`, `text-blue-300|200`→`text-primary-hover`, every `focus:border-*`→`focus:border-primary`; green buttons (`bg-emerald-600`) become teal too.
  - Meaning: emerald/green → `growth`, amber → `warning`, red/rose → `danger` (`bg-*-500`→fill, `bg-*/NN`→`-tint`, `border-*/NN`→`-edge`, `text-*-300|400`→`-text`, `bg-red-600`→`bg-danger-strong`).
  - Decorative violet/purple/sky/teal/orange/pink → primary tint/text.
  - Line passes: a line holding an input (`outline-none`) swaps `bg-raised`→`bg-canvas`; a line with a solid `bg-primary` swaps `text-ink`→`text-on-primary`; a line with `bg-danger-strong` keeps `text-white`.
- [ ] Grep solid `bg-primary` with 3 lines of context and fix any icon on its own line still reading `text-ink`.
- [ ] Grep for leftovers: `slate-|blue-|emerald-|amber-|red-|rose-|violet-|purple-|sky-|#[0-9a-f]{6}\]|white/`. Anything left is either intentional (scrims `bg-black/NN`, `border-white/20` on the teal hero, `teal-50/100`, `green-200` on the teal hero) or gets fixed by hand.

### Task 8: Verify

- [ ] `npx tsc --noEmit`: no errors.
- [ ] `npm test`: green (the pure libs are untouched, but this confirms it).
- [ ] `npm run build`: succeeds, and the built CSS contains `--color-canvas`.
- [ ] `npm run lint`: compare against the known-red baseline on `main`. No new errors in touched files.
- [ ] Start `npm run dev` and ask the user to eyeball `/`, `/expenses`, `/debts` and `/wallets` (Add) at phone and desktop widths. Browser automation needs an explicit ask.
- [ ] Commits wait for the user to ask.
