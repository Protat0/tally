import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleKeyOf, cycleRange, cycleLabel, dueDateInCycle,
  datesInCycle, daysInCycle, daysElapsedInCycle, shiftCycleKey, clampDay,
} from './cycle.ts';

const at = (y: number, m: number, d: number) => new Date(y, m - 1, d);

// The regression guard for everyone who never touches the setting: at a start
// day of 1 a cycle IS the calendar month.
test('a start day of 1 is the calendar month', () => {
  assert.equal(cycleKeyOf(at(2026, 8, 1), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 19), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 31), 1), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 1), 1), '2026-09');
});

// A cycle is named for the month it STARTS in, so Sep 3 still belongs to the
// cycle that opened on Aug 15.
test('a mid-month start day names the cycle for the month it opens in', () => {
  assert.equal(cycleKeyOf(at(2026, 8, 5), 15), '2026-07');
  assert.equal(cycleKeyOf(at(2026, 8, 14), 15), '2026-07');
  assert.equal(cycleKeyOf(at(2026, 8, 15), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 8, 19), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 3), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 14), 15), '2026-08');
  assert.equal(cycleKeyOf(at(2026, 9, 15), 15), '2026-09');
});

test('a January date before the start day belongs to the previous December', () => {
  assert.equal(cycleKeyOf(at(2026, 1, 3), 15), '2025-12');
});

// The boundary is local midnight. A bill paid at 00:30 on the 15th in Manila
// must land in the cycle that just opened, not the one that just closed.
test('the boundary is local midnight of the start day', () => {
  assert.equal(cycleKeyOf(new Date(2026, 7, 15, 0, 30), 15), '2026-08');
  assert.equal(cycleKeyOf(new Date(2026, 7, 14, 23, 59), 15), '2026-07');
});

test('a cycle range is half-open and covers the gap to the next one', () => {
  const aug = cycleRange('2026-08', 15);

  assert.deepEqual(aug.start, new Date(2026, 7, 15));
  assert.deepEqual(aug.end, new Date(2026, 8, 15));
  assert.deepEqual(cycleRange('2026-09', 15).start, aug.end);
});

// No date may fall in two cycles or in none.
test('every day of a year belongs to exactly one cycle', () => {
  for (const startDay of [1, 15, 28, 31]) {
    for (let i = 0; i < 365; i++) {
      const d = new Date(2026, 0, 1 + i);
      const { start, end } = cycleRange(cycleKeyOf(d, startDay), startDay);
      const stamp = new Date(d.getFullYear(), d.getMonth(), d.getDate());

      assert.ok(stamp >= start && stamp < end, `${d.toDateString()} @ ${startDay}`);
    }
  }
});

test('a day past the end of a short month clamps to its last day', () => {
  assert.equal(clampDay(2026, 1, 31), 28);   // February 2026
  assert.equal(clampDay(2024, 1, 31), 29);   // February 2024, a leap year
  assert.equal(clampDay(2026, 3, 31), 30);   // April
  assert.deepEqual(cycleRange('2026-01', 31).end, new Date(2026, 1, 28));
});

test('a cycle is labelled by its span unless it is a whole calendar month', () => {
  assert.equal(cycleLabel('2026-08', 1), 'August 2026');
  assert.equal(cycleLabel('2026-08', 15), 'Aug 15 – Sep 14');
});

// A due day lands in whichever of the cycle's two calendar months contains it.
test('a due day resolves to its one occurrence inside the cycle', () => {
  assert.deepEqual(dueDateInCycle(15, '2026-08', 15), new Date(2026, 7, 15));
  assert.deepEqual(dueDateInCycle(20, '2026-08', 15), new Date(2026, 7, 20));
  assert.deepEqual(dueDateInCycle(5, '2026-08', 15), new Date(2026, 8, 5));
  assert.deepEqual(dueDateInCycle(31, '2026-01', 15), new Date(2026, 0, 31));
  assert.deepEqual(dueDateInCycle(31, '2026-02', 15), new Date(2026, 1, 28));
});

// The reason paydays move to cycles: a 1st-and-15th cycle starting on the 15th
// contains BOTH paydays, so income and spending finally share a window.
test('both paydays fall inside a cycle that starts on the 15th', () => {
  assert.deepEqual(datesInCycle([1, 15], '2026-08', 15), [
    new Date(2026, 7, 15),
    new Date(2026, 8, 1),
  ]);
});

test('days that clamp onto the same date are not counted twice', () => {
  assert.deepEqual(datesInCycle([30, 31], '2026-02', 1), [new Date(2026, 1, 28)]);
});

test('cycle length and elapsed days match the calendar month at a start day of 1', () => {
  assert.equal(daysInCycle('2026-08', 1), 31);
  assert.equal(daysElapsedInCycle('2026-08', 1, at(2026, 8, 19)), 19);
});

test('elapsed days count from the cycle start, not the month start', () => {
  assert.equal(daysInCycle('2026-08', 15), 31);
  assert.equal(daysElapsedInCycle('2026-08', 15, at(2026, 8, 19)), 5);
  assert.equal(daysElapsedInCycle('2026-08', 15, at(2026, 9, 3)), 20);
});

test('stepping a cycle key moves whole cycles and rolls the year', () => {
  assert.equal(shiftCycleKey('2026-08', -1), '2026-07');
  assert.equal(shiftCycleKey('2026-12', 1), '2027-01');
  assert.equal(shiftCycleKey('2026-01', -1), '2025-12');
});
