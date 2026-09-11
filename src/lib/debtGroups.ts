// Debt balances and the debt board's grouping, kept pure: no React, no Supabase.
//
// The shapes below are the fields these rules read. A DebtPerson and a
// DebtEntry have them, so either passes in without importing the client-only
// AppContext here.

export interface SignedEntry {
  direction: 'owed_to_me' | 'i_owe';
  amount: number;
}

export interface GroupableEntry extends SignedEntry {
  personId: string;
  date: string;
  settledAt: string | null;
}

export interface PersonDebts<P, E> {
  person: P;
  open: E[];
  settled: E[];
  /** Positive = they owe you. Open entries only. */
  net: number;
}

// Positive = they owe you. Caller decides which entries to include; pass only
// open ones for a live balance.
export function netOf(entries: SignedEntry[]): number {
  return entries.reduce(
    (s, e) => s + (e.direction === 'owed_to_me' ? e.amount : -e.amount),
    0,
  );
}

// Splits the board in two. Active is anyone with an open entry — even entries
// that cancel out, since those still need settling to close. Settled is
// everyone else, people never in a debt included. Both lists put the latest
// activity first, settled entries counting; people with no entries go last.
export function groupDebts<P extends { id: string }, E extends GroupableEntry>(
  people: P[],
  entries: E[],
): { active: PersonDebts<P, E>[]; settled: PersonDebts<P, E>[] } {
  const withActivity = people.map(person => {
    const mine = entries.filter(e => e.personId === person.id);
    const open = mine.filter(e => !e.settledAt);
    return {
      group: { person, open, settled: mine.filter(e => e.settledAt), net: netOf(open) },
      last: Math.max(-Infinity, ...mine.map(e => Date.parse(e.date))),
    };
  });

  withActivity.sort((a, b) => (a.last === b.last ? 0 : a.last < b.last ? 1 : -1));

  const active: PersonDebts<P, E>[] = [];
  const settled: PersonDebts<P, E>[] = [];
  for (const { group } of withActivity) {
    (group.open.length > 0 ? active : settled).push(group);
  }
  return { active, settled };
}
