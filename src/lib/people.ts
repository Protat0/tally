// Choosing people for a debt or a split, kept pure: no React, no Supabase.
//
// The shapes below are the few fields these rules read. A DebtPerson or a
// DebtEntry has them, so either can be passed in without importing the
// client-only AppContext here.

export interface NamedPerson {
  id: string;
  name: string;
}

export interface PersonActivity {
  personId: string;
  date: string;
}

// Lowercase with accents stripped, so a search for "nino" finds "Niño":
// NFD splits "ñ" into "n" plus a combining tilde, and the range drops the tilde.
function fold(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Most recently used first, by each person's latest debt entry. People with no
// entries yet go last, alphabetically.
export function rankPeople<P extends NamedPerson>(people: P[], entries: PersonActivity[]): P[] {
  const latest = new Map<string, number>();
  for (const e of entries) {
    const at = Date.parse(e.date);
    const prev = latest.get(e.personId);
    if (prev === undefined || at > prev) latest.set(e.personId, at);
  }
  return [...people].sort((a, b) => {
    const at = latest.get(a.id);
    const bt = latest.get(b.id);
    if (at !== undefined && bt !== undefined) return bt - at;
    if (at !== undefined) return -1;
    if (bt !== undefined) return 1;
    return byName(a, b);
  });
}

function byName(a: NamedPerson, b: NamedPerson): number {
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

// The picker's two lists: up to `limit` people used most recently, newest
// first, then everyone else by name. A long list is scanned alphabetically, so
// people last used long ago belong in the second list, not at its end.
export function groupPeople<P extends NamedPerson>(
  people: P[],
  entries: PersonActivity[],
  limit: number,
): { recent: P[]; rest: P[] } {
  const used = new Set(entries.map(e => e.personId));
  const recent = rankPeople(people, entries).filter(p => used.has(p.id)).slice(0, limit);
  const rest = people.filter(p => !recent.includes(p)).sort(byName);
  return { recent, rest };
}

// People whose name contains the query anywhere. A blank query keeps everyone.
export function searchPeople<P extends NamedPerson>(people: P[], query: string): P[] {
  const q = fold(query);
  if (!q) return people;
  return people.filter(p => fold(p.name).includes(q));
}

// Whether a typed name can become a new person: not blank, and nobody has that
// name already. Case doesn't make a different person; a partial match does.
export function canAddPerson(people: NamedPerson[], name: string): boolean {
  const n = name.trim().toLowerCase();
  return n.length > 0 && !people.some(p => p.name.trim().toLowerCase() === n);
}
