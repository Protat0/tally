import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PATCH_NOTES, unseenNotes, type PatchNote } from './patchNotes.ts';

const note = (version: string, date: string): PatchNote => ({ version, date, title: version, items: ['x'] });

// Newest first, as the real list is kept.
const NOTES = [note('3', '2026-11-01'), note('2', '2026-10-01'), note('1', '2026-09-01')];
const OLD_ACCOUNT = '2026-01-15T08:00:00Z';

test('nothing new since the last version seen', () => {
  assert.deepEqual(unseenNotes('3', NOTES, OLD_ACCOUNT), []);
});

test('every release newer than the last one seen, newest first', () => {
  assert.deepEqual(unseenNotes('1', NOTES, OLD_ACCOUNT).map(n => n.version), ['3', '2']);
  assert.deepEqual(unseenNotes('2', NOTES, OLD_ACCOUNT).map(n => n.version), ['3']);
});

// A device that has never recorded a version is either a new user or an
// existing user on a new device or browser. Neither should get the whole
// history — at most the latest release, and only if the account predates it.
test('a device with no record shows only the latest release to an existing account', () => {
  assert.deepEqual(unseenNotes(null, NOTES, OLD_ACCOUNT).map(n => n.version), ['3']);
});

test('a brand-new account is not told about releases it never missed', () => {
  assert.deepEqual(unseenNotes(null, NOTES, '2026-11-01T09:00:00Z'), []);
  assert.deepEqual(unseenNotes(null, NOTES, '2026-12-25T09:00:00Z'), []);
});

test('an unknown account age counts as new', () => {
  assert.deepEqual(unseenNotes(null, NOTES, undefined), []);
});

// A stored version that is no longer in the list (renamed, or from a build
// that was rolled back) can't be placed, so only the latest release shows.
test('a version not in the list shows only the latest release', () => {
  assert.deepEqual(unseenNotes('0.9-beta', NOTES, OLD_ACCOUNT).map(n => n.version), ['3']);
});

test('no notes, nothing to show', () => {
  assert.deepEqual(unseenNotes(null, [], OLD_ACCOUNT), []);
  assert.deepEqual(unseenNotes('1', [], OLD_ACCOUNT), []);
});

// Guards on the real list, so a hand-edited release entry can't quietly break
// the ordering the rules above rely on.
test('the shipped notes are newest first, with unique versions and real dates', () => {
  assert.ok(PATCH_NOTES.length > 0);
  const versions = PATCH_NOTES.map(n => n.version);
  assert.equal(new Set(versions).size, versions.length, 'versions are unique');
  for (const n of PATCH_NOTES) {
    assert.match(n.date, /^\d{4}-\d{2}-\d{2}$/, `${n.version} date`);
    assert.ok(n.items.length > 0, `${n.version} has items`);
  }
  const dates = PATCH_NOTES.map(n => n.date);
  assert.deepEqual(dates, [...dates].sort().reverse(), 'newest first');
});
