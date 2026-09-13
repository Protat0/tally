// Release notes, shown once after an update. Newest first. Adding an entry here
// is part of shipping the change it describes: `npm run patch-notes` drafts one
// from the Patch-note: lines on commits since the last draft (see AGENTS.md).

export interface PatchNote {
  /** Unique per release. It is saved on the device once seen, so never reuse one. */
  version: string;
  /** Release day, YYYY-MM-DD. */
  date: string;
  title: string;
  items: string[];
}

export const PATCH_NOTES: PatchNote[] = [
  {
    version: '2026-09-12',
    date: '2026-09-12',
    title: 'Credit cards',
    items: [
      'Add your credit cards: see what each one owes, when it is due, and pay it from a wallet.',
      'Pay for an expense with a credit card, and see what is left to spend on it.',
      'The dashboard shows what you owe on cards and reminds you before a bill is due.',
      'Card purchases, payments and charges all show in Activity.',
      'Deleting a credit card stops its interest and fees from that day.',
      'Each page in the bottom bar has an icon.',
    ],
  },
  {
    version: '2026-09-11-2',
    date: '2026-09-11',
    title: 'Debts, wallets and your emergency fund',
    items: [
      'Withdraw from your emergency fund. Adding or withdrawing can move money from or into a wallet, or none.',
      'Delete an emergency fund entry that shouldn’t be there. Any wallet money it moved goes back.',
      'Choose people for a split or a debt from a searchable list, with the people you use most at the top.',
      'The debts page tucks away people you’re settled up with. Tap anyone to see their debts.',
      'Add a debt straight from the + button.',
      'Switch any appliance on or off from home.',
      'Pick your bank or e-wallet by its logo when adding a wallet.',
    ],
  },
  {
    version: '2026-09-11',
    date: '2026-09-11',
    title: 'A fresh look',
    items: [
      'A calmer design: warm dark surfaces, with teal marking anything you can tap.',
      'Green, amber and red only mean something now: money doing well, nearing a limit, or over.',
      'Light mode. Turn it on in Settings.',
      'Icons replace emoji across wallets, categories and activity.',
      'People you track debts with show their initial.',
    ],
  },
];

// Patch notes drafted through commit 8f743a1d3b9fc86c0498441035c064bf4057bb1d
// `npm run patch-notes` drafts from the commit after this one, then moves it forward.

export const SEEN_VERSION_KEY = 'tally-seen-version';

// Which releases to show, given the last version this device saw.
export function unseenNotes(
  lastSeen: string | null,
  notes: PatchNote[],
  accountCreatedAt: string | undefined,
): PatchNote[] {
  if (notes.length === 0) return [];
  const latest = notes[0];

  if (lastSeen === null) {
    // No record on this device: a new account, or an existing one on a new
    // device or browser. Only an account older than the latest release has
    // missed it, and even then that one release is enough, not the history.
    if (!accountCreatedAt) return [];
    return accountCreatedAt.slice(0, 10) < latest.date ? [latest] : [];
  }

  const seenAt = notes.findIndex(n => n.version === lastSeen);
  // A version no longer in the list can't be placed, so show just the latest.
  if (seenAt === -1) return [latest];
  return notes.slice(0, seenAt);
}
