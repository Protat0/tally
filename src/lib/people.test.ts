import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rankPeople, groupPeople, searchPeople, canAddPerson } from './people.ts';

const person = (id: string, name = id) => ({ id, name });
const entry = (personId: string, date: string) => ({ personId, date });
const ids = (people: { id: string }[]) => people.map(p => p.id);
const day = (d: number) => `2026-09-${String(d).padStart(2, '0')}T12:00:00Z`;

test('people used most recently come first', () => {
  const people = [person('ana'), person('ben'), person('cy')];
  const entries = [entry('ana', day(1)), entry('cy', day(10)), entry('ben', day(5))];
  assert.deepEqual(ids(rankPeople(people, entries)), ['cy', 'ben', 'ana']);
});

test('a person ranks by their latest entry, not their first', () => {
  const people = [person('ana'), person('ben')];
  const entries = [entry('ana', day(1)), entry('ben', day(5)), entry('ana', day(9))];
  assert.deepEqual(ids(rankPeople(people, entries)), ['ana', 'ben']);
});

test('people never used go last, by name regardless of case', () => {
  const people = [person('z', 'Zed'), person('b', 'bea'), person('a', 'Ana'), person('u', 'Used')];
  assert.deepEqual(ids(rankPeople(people, [entry('u', day(1))])), ['u', 'a', 'b', 'z']);
});

test('ranking hands back the same person objects, extra fields included', () => {
  const ana = { id: 'ana', name: 'Ana', emoji: '' };
  assert.equal(rankPeople([ana], [])[0], ana);
});

test('recent is the few people used most recently, newest first', () => {
  const people = [person('ana'), person('ben'), person('cy'), person('dee')];
  const entries = [entry('ana', day(1)), entry('ben', day(9)), entry('cy', day(5)), entry('dee', day(7))];
  assert.deepEqual(ids(groupPeople(people, entries, 2).recent), ['ben', 'dee']);
});

// A long list is scanned by name, so everyone below recent is alphabetical —
// including people last used long ago.
test('everyone not in recent is listed by name, used or not', () => {
  const people = [person('z', 'Zed'), person('a', 'ana'), person('b', 'Ben'), person('c', 'Cy')];
  const entries = [entry('z', day(1)), entry('c', day(9))];
  const { recent, rest } = groupPeople(people, entries, 1);
  assert.deepEqual(ids(recent), ['c']);
  assert.deepEqual(ids(rest), ['a', 'b', 'z']);
});

test('people never used are never recent', () => {
  const { recent, rest } = groupPeople([person('b', 'Ben'), person('a', 'Ana')], [], 5);
  assert.deepEqual(ids(recent), []);
  assert.deepEqual(ids(rest), ['a', 'b']);
});

const named = [person('1', 'Niño'), person('2', 'Carlo'), person('3', 'Marco')];

test('search matches any part of a name, ignoring case and accents', () => {
  assert.deepEqual(ids(searchPeople(named, 'nino')), ['1']);
  assert.deepEqual(ids(searchPeople(named, 'ARL')), ['2']);
  assert.deepEqual(ids(searchPeople(named, 'rc')), ['3']);
  assert.deepEqual(ids(searchPeople(named, 'zz')), []);
});

test('a blank search keeps everyone, in the order given', () => {
  assert.deepEqual(ids(searchPeople(named, '')), ['1', '2', '3']);
  assert.deepEqual(ids(searchPeople(named, '   ')), ['1', '2', '3']);
});

test('a typed name can be added unless someone already has it', () => {
  // A partial match is a different person: typing "Carl" must still offer Carl.
  assert.equal(canAddPerson(named, 'Carl'), true);
  assert.equal(canAddPerson(named, ' carlo '), false);
  assert.equal(canAddPerson(named, 'Niño'), false);
});

test('a blank name cannot be added', () => {
  assert.equal(canAddPerson(named, ''), false);
  assert.equal(canAddPerson(named, '   '), false);
});
