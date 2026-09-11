import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseTrailerLog, nextVersion, draftedThrough, applyDraft, DRAFT_TITLE } from './patchNoteDraft.ts';

// The script asks git for each commit's Patch-note values, separated by RS
// within a commit and ended by US after every commit.
const RS = '\x1e';
const US = '\x1f';

test('notes are read from every commit in order, skipping commits without one', () => {
  const log = `Withdraw from your emergency fund.${US}\n${US}\nSwitch appliances from home.${RS}Pick a bank by its logo.${US}\n`;
  assert.deepEqual(parseTrailerLog(log), [
    'Withdraw from your emergency fund.',
    'Switch appliances from home.',
    'Pick a bank by its logo.',
  ]);
});

test('blank and repeated notes are dropped', () => {
  const log = `  Add a debt from the + button.  ${RS}   ${US}\nAdd a debt from the + button.${US}\n`;
  assert.deepEqual(parseTrailerLog(log), ['Add a debt from the + button.']);
});

test('an empty log has no notes', () => {
  assert.deepEqual(parseTrailerLog(''), []);
});

test('a release takes its date as its version when that is free', () => {
  assert.equal(nextVersion('2026-09-12', ['2026-09-11', '2026-09-11-2']), '2026-09-12');
});

// Versions are remembered on each device once seen, so one can never be reused.
test('another release on the same day gets the next number', () => {
  assert.equal(nextVersion('2026-09-11', ['2026-09-11']), '2026-09-11-2');
  assert.equal(nextVersion('2026-09-11', ['2026-09-11-2', '2026-09-11']), '2026-09-11-3');
});

const SOURCE = [
  'export interface PatchNote { version: string; date: string; title: string; items: string[] }',
  '',
  'export const PATCH_NOTES: PatchNote[] = [',
  '  {',
  "    version: '2026-09-11',",
  "    date: '2026-09-11',",
  "    title: 'A fresh look',",
  "    items: ['Light mode.'],",
  '  },',
  '];',
  '',
  '// Patch notes drafted through commit abc1234',
  '',
].join('\n');

const entry = {
  version: '2026-09-12',
  date: '2026-09-12',
  title: DRAFT_TITLE,
  items: ['Delete a fund entry that shouldn’t stay.', "It's quoted 'safely' \\ too."],
};

test('the drafted-through commit is read from its marker', () => {
  assert.equal(draftedThrough(SOURCE), 'abc1234');
  assert.equal(draftedThrough('export const PATCH_NOTES = [];'), null);
});

test('a draft goes first and moves the marker to the commit it was drafted through', () => {
  const out = applyDraft(SOURCE, entry, 'def5678');
  assert.equal(draftedThrough(out), 'def5678');
  assert.ok(out.indexOf("version: '2026-09-12'") < out.indexOf("version: '2026-09-11'"));
  assert.ok(out.includes("title: 'A fresh look',"), 'older entries are kept');
});

// The draft is written into a source file, so quotes and backslashes in a note
// must come back as the same text, not as a syntax error.
test('a drafted file still loads, with the draft and the older notes intact', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'patch-notes-'));
  const file = path.join(dir, 'notes.ts');
  writeFileSync(file, applyDraft(SOURCE, entry, 'def5678'));
  const { PATCH_NOTES } = await import(pathToFileURL(file).href);
  assert.deepEqual(PATCH_NOTES[0], entry);
  assert.equal(PATCH_NOTES[1].title, 'A fresh look');
});

test('a file checked out with Windows line endings keeps them', () => {
  const out = applyDraft(SOURCE.replace(/\n/g, '\r\n'), entry, 'def5678');
  assert.equal(/[^\r]\n/.test(out), false);
});

test('a file without the marker is refused rather than guessed at', () => {
  assert.throws(() => applyDraft('export const PATCH_NOTES: PatchNote[] = [\n];\n', entry, 'def5678'));
});
