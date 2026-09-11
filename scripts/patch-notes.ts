// Drafts the next "What's new" entry into src/lib/patchNotes.ts from the
// Patch-note: lines on every commit since the last draft. Name it and edit the
// wording before committing; npm test fails while the TODO title is there.
//
//   npm run patch-notes

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { PATCH_NOTES } from '../src/lib/patchNotes.ts';
import {
  TRAILER_KEY, DRAFT_TITLE, parseTrailerLog, nextVersion, draftedThrough, applyDraft,
} from '../src/lib/patchNoteDraft.ts';

const FILE = 'src/lib/patchNotes.ts';

// Arguments go straight to git, not through a shell, so nothing needs quoting.
const git = (...args: string[]): string => execFileSync('git', args, { encoding: 'utf8' });

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const source = readFileSync(FILE, 'utf8');
const since = draftedThrough(source);
if (!since) fail(`${FILE} has no "Patch notes drafted through commit" line, so there is nowhere to start.`);

try {
  git('rev-parse', '--verify', '--quiet', `${since}^{commit}`);
} catch {
  fail(
    `Commit ${since} from ${FILE} is not in this repository's history. If history was rewritten, ` +
    'set that line to the last commit whose notes have already shipped.',
  );
}

const head = git('rev-parse', 'HEAD').trim();

// Git reads the trailers itself: each commit's Patch-note values joined by RS
// and closed with US, oldest commit first.
const log = git(
  'log', '--reverse',
  `--format=%(trailers:key=${TRAILER_KEY},valueonly,unfold,separator=%x1e)%x1f`,
  `${since}..HEAD`,
);
const items = parseTrailerLog(log);

if (items.length === 0) {
  console.log(`No ${TRAILER_KEY}: lines on any commit since ${since.slice(0, 7)}. Nothing drafted.`);
  process.exit(0);
}

const now = new Date();
const pad = (n: number) => String(n).padStart(2, '0');
const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
const entry = {
  version: nextVersion(date, PATCH_NOTES.map(n => n.version)),
  date,
  title: DRAFT_TITLE,
  items,
};

writeFileSync(FILE, applyDraft(source, entry, head));

console.log(`Drafted ${entry.version} into ${FILE} from ${items.length} note${items.length === 1 ? '' : 's'}:`);
for (const item of items) console.log(`  - ${item}`);
console.log(`\nNext: replace "${DRAFT_TITLE}", edit the wording, run npm test, then commit.`);
