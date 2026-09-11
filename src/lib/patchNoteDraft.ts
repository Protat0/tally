// Drafting a patch notes entry from commit messages, kept pure: the script in
// scripts/patch-notes.ts does the git and file work and hands the text here.
//
// A commit users will notice ends its message with one or more lines like
//   Patch-note: Withdraw from your emergency fund.
// and git reads those out itself. patchNotes.ts keeps a marker comment naming
// the last commit drafted, so each draft starts where the previous one stopped.

import type { PatchNote } from './patchNotes';

export const TRAILER_KEY = 'Patch-note';

// Stands in until someone names the release. The shipped-notes test rejects
// it, so a draft can't go out unreviewed.
export const DRAFT_TITLE = 'TODO: name this release';

// `$` in multiline mode stops before a \r as well as a \n, so a file with
// Windows line endings keeps them when the marker is rewritten.
const MARKER = /^\/\/ Patch notes drafted through commit ([0-9a-f]{7,40})[ \t]*$/m;
const OPENER = 'export const PATCH_NOTES: PatchNote[] = [';

// Git's output for the script's --format: each commit's notes joined by RS
// (\x1e) and closed with US (\x1f). Notes come back in commit order, trimmed,
// with blanks and repeats dropped.
export function parseTrailerLog(log: string): string[] {
  const notes: string[] = [];
  for (const commit of log.split('\x1f')) {
    for (const value of commit.split('\x1e')) {
      const note = value.trim();
      if (note && !notes.includes(note)) notes.push(note);
    }
  }
  return notes;
}

// A release's date is its version, numbered from -2 when that day already has
// one. Devices remember versions once seen, so none may ever be reused.
export function nextVersion(date: string, taken: string[]): string {
  if (!taken.includes(date)) return date;
  let n = 2;
  while (taken.includes(`${date}-${n}`)) n++;
  return `${date}-${n}`;
}

export function draftedThrough(source: string): string | null {
  return source.match(MARKER)?.[1] ?? null;
}

// A single-quoted string literal. Backslashes first, or the ones added for
// quotes would be doubled too.
const quote = (s: string): string => `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

function entryLines(entry: PatchNote): string[] {
  return [
    '  {',
    `    version: ${quote(entry.version)},`,
    `    date: ${quote(entry.date)},`,
    `    title: ${quote(entry.title)},`,
    '    items: [',
    ...entry.items.map(item => `      ${quote(item)},`),
    '    ],',
    '  },',
  ];
}

// The source with the entry first in PATCH_NOTES and the marker moved to
// `through`. Throws when the file lacks the list or the marker, rather than
// guessing where either belongs.
export function applyDraft(source: string, entry: PatchNote, through: string): string {
  if (source.split(OPENER).length !== 2) throw new Error(`Expected exactly one "${OPENER}"`);
  if (!MARKER.test(source)) throw new Error('No "Patch notes drafted through commit" line');

  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  return source
    .replace(OPENER, () => [OPENER, ...entryLines(entry)].join(eol))
    .replace(MARKER, () => `// Patch notes drafted through commit ${through}`);
}
