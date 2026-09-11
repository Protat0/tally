// Release notes, shown once after an update. Newest first. Adding an entry here
// is part of shipping the change it describes.

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
