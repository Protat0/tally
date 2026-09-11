import { test } from 'node:test';
import assert from 'node:assert/strict';
import { netOf, groupDebts } from './debtGroups.ts';

type Direction = 'owed_to_me' | 'i_owe';

const person = (id: string) => ({ id, name: id });
let seq = 0;
const entry = (personId: string, day: number, direction: Direction, amount: number, settled = false) => ({
  id: `e${seq++}`,
  personId,
  direction,
  amount,
  date: `2026-09-${String(day).padStart(2, '0')}T12:00:00Z`,
  settledAt: settled ? '2026-09-20T12:00:00Z' : null,
});
const ids = (groups: { person: { id: string } }[]) => groups.map(g => g.person.id);

test('net is positive when they owe you and negative when you owe them', () => {
  assert.equal(netOf([entry('a', 1, 'owed_to_me', 300), entry('a', 2, 'i_owe', 120)]), 180);
  assert.equal(netOf([entry('a', 1, 'i_owe', 50)]), -50);
  assert.equal(netOf([]), 0);
});

test('anyone with an open entry is active; anyone without is settled', () => {
  const entries = [entry('ana', 1, 'owed_to_me', 100), entry('ben', 2, 'i_owe', 40, true)];
  const { active, settled } = groupDebts([person('ana'), person('ben')], entries);
  assert.deepEqual(ids(active), ['ana']);
  assert.deepEqual(ids(settled), ['ben']);
});

// Open entries that cancel out still have to be settled to close them, so a
// zero balance on its own does not tuck someone away.
test('open entries that cancel out keep a person active', () => {
  const entries = [entry('ana', 1, 'owed_to_me', 100), entry('ana', 2, 'i_owe', 100)];
  const { active } = groupDebts([person('ana')], entries);
  assert.deepEqual(ids(active), ['ana']);
  assert.equal(active[0].net, 0);
});

test('a person with no entries at all is settled', () => {
  const { active, settled } = groupDebts([person('ana')], []);
  assert.deepEqual(ids(active), []);
  assert.deepEqual(ids(settled), ['ana']);
});

test("each person's entries split into open and settled, with net from open only", () => {
  const entries = [
    entry('ana', 1, 'owed_to_me', 500, true),
    entry('ana', 2, 'owed_to_me', 200),
    entry('ben', 3, 'owed_to_me', 999),
  ];
  const ana = groupDebts([person('ana'), person('ben')], entries).active.find(g => g.person.id === 'ana');
  assert.ok(ana);
  assert.equal(ana.open.length, 1);
  assert.equal(ana.settled.length, 1);
  assert.equal(ana.net, 200);
});

test('both lists put the latest activity first, settled entries included', () => {
  const people = [person('ana'), person('ben'), person('cy'), person('dee')];
  const entries = [
    entry('ana', 5, 'owed_to_me', 10),
    // Ben's newest activity is a settled entry, and it still counts.
    entry('ben', 1, 'owed_to_me', 10),
    entry('ben', 9, 'i_owe', 10, true),
    entry('cy', 3, 'i_owe', 10, true),
    entry('dee', 7, 'i_owe', 10, true),
  ];
  const { active, settled } = groupDebts(people, entries);
  assert.deepEqual(ids(active), ['ben', 'ana']);
  assert.deepEqual(ids(settled), ['dee', 'cy']);
});

test('people with no entries come after settled people with history', () => {
  const { settled } = groupDebts([person('new'), person('old')], [entry('old', 1, 'owed_to_me', 10, true)]);
  assert.deepEqual(ids(settled), ['old', 'new']);
});

test('groups hand back the same person and entry objects', () => {
  const ana = person('ana');
  const e = entry('ana', 1, 'owed_to_me', 10);
  const [g] = groupDebts([ana], [e]).active;
  assert.equal(g.person, ana);
  assert.equal(g.open[0], e);
});
