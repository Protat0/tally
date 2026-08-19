import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cycleKeyOf, cycleRange, cycleLabel, dueDateInCycle,
  datesInCycle, daysInCycle, daysElapsedInCycle, shiftCycleKey, clampDay,
} from './cycle.ts';
import { rekeyBillTicks } from './cycle.ts';

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

// A bill paid on Aug 5 was stored under '2026-08' meaning "August". Once the
// cycle starts on the 15th, '2026-08' means Aug 15 – Sep 14 — a period that
// payment does NOT belong to. Left alone the bill would read as already paid.
test('a tick moves to the cycle its payment actually falls in', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 5).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-07']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-07': 'e1' });
});

test('a tick already in the right cycle is left where it is', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 20).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-08']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-08': 'e1' });
});

// Months ticked before payments recorded an expense have no date to re-key
// from. Inventing one would be worse than leaving them.
test('a legacy tick with no expense is left untouched', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-06', '2026-08'], paidExpenseIds: { '2026-08': 'e1' } }],
    { e1: new Date(2026, 7, 5).toISOString() },
    15,
  );

  assert.deepEqual(out[0].paidMonths.sort(), ['2026-06', '2026-07']);
});

// An expense id pointing at a row that no longer exists must not silently drop
// the tick — the bill would become payable twice.
test('a tick whose expense is missing keeps its original key', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'gone' } }],
    {},
    15,
  );

  assert.deepEqual(out[0].paidMonths, ['2026-08']);
  assert.deepEqual(out[0].paidExpenseIds, { '2026-08': 'gone' });
});

// The confirm sheet may be re-run, and a failed write may be retried.
test('re-keying twice changes nothing the second time', () => {
  const bills = [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1' } }];
  const dates = { e1: new Date(2026, 7, 5).toISOString() };

  const once = rekeyBillTicks(bills, dates, 15);

  assert.deepEqual(rekeyBillTicks(once, dates, 15), once);
});

test('fields other than the ticks survive re-keying', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', name: 'Electric', amount: 2500, paidMonths: [], paidExpenseIds: {} }],
    {},
    15,
  );

  assert.equal(out[0].name, 'Electric');
  assert.equal(out[0].amount, 2500);
});

// Loop 2 repairs orphaned entries — entries in paidExpenseIds but missing from
// paidMonths. When an orphan re-keys to a cycle not occupied by a real tick, it
// must be carried through and appear in the output, else the orphan repair is
// pointless and the expense stays stranded.
test('an orphan entry re-keyed to an unoccupied cycle appears in paidMonths', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-08'], paidExpenseIds: { '2026-08': 'e1', '2026-09': 'e2' } }],
    { e1: new Date(2026, 8, 20).toISOString(), e2: new Date(2026, 6, 10).toISOString() },
    15,
  );

  assert.ok(out[0].paidMonths.includes('2026-06'));
  assert.equal((out[0].paidExpenseIds as Record<string, string>)['2026-06'], 'e2');
});

// When a real tick (from paidMonths) and an orphan repair (from paidExpenseIds)
// both re-key to the same cycle, the real tick must win. Loop 2 is a repair for
// orphaned data only; it must never overwrite a legitimate tick's linkage.
// Allowing it would lose the real expense id and strand a transaction.
test('a real tick wins over an orphan entry when both re-key to the same cycle', () => {
  const out = rekeyBillTicks(
    [{ id: 'b1', paidMonths: ['2026-07'], paidExpenseIds: { '2026-07': 'e1', '2026-09': 'e2' } }],
    { e1: new Date(2026, 7, 20).toISOString(), e2: new Date(2026, 7, 25).toISOString() },
    15,
  );

  // Both e1 (Aug 20) and e2 (Aug 25) re-key to '2026-08' with startDay=15.
  // But e1 comes from paidMonths (real tick), so it must survive.
  assert.equal((out[0].paidExpenseIds as Record<string, string>)['2026-08'], 'e1');
  assert.deepEqual(out[0].paidMonths, ['2026-08']);
});
