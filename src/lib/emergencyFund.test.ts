import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fundBalance, canWithdraw, canDeleteEntry, averageDeposit } from './emergencyFund.ts';

const dep = (id: string, amount: number) => ({ id, direction: 'deposit' as const, amount });
const wd = (id: string, amount: number) => ({ id, direction: 'withdrawal' as const, amount });

test('the balance is deposits less withdrawals', () => {
  assert.equal(fundBalance([dep('a', 5000), wd('b', 1200), dep('c', 800)]), 4600);
});

test('an empty fund holds nothing', () => {
  assert.equal(fundBalance([]), 0);
});

test('the balance is rounded at the centavo', () => {
  assert.equal(fundBalance([dep('a', 0.1), dep('b', 0.2)]), 0.3);
});

test('a withdrawal can take the whole balance, but no more', () => {
  assert.equal(canWithdraw(1000, 1000), true);
  assert.equal(canWithdraw(1000, 400), true);
  assert.equal(canWithdraw(1000, 1000.01), false);
});

test('a withdrawal must be for some money', () => {
  assert.equal(canWithdraw(1000, 0), false);
  assert.equal(canWithdraw(1000, -50), false);
});

// Deleting a deposit that later withdrawals already used would leave the fund
// holding less than nothing.
test('an entry can be deleted only if the fund stays at or above zero', () => {
  const spent = [wd('w', 1000), dep('d', 1000)]; // newest first
  assert.equal(canDeleteEntry(spent, 'w'), true);
  assert.equal(canDeleteEntry(spent, 'd'), false);

  const room = [wd('w', 400), dep('e', 500), dep('d', 1000)];
  assert.equal(canDeleteEntry(room, 'e'), true);
});

test('an entry that is not in the fund cannot be deleted', () => {
  assert.equal(canDeleteEntry([dep('d', 100)], 'missing'), false);
});

// "Projected full by" asks how fast the fund grows, so only money going in counts.
test('the average deposit uses only the most recent deposits', () => {
  const entries = [wd('w', 9000), dep('a', 1000), dep('b', 2000), dep('c', 6000)]; // newest first
  assert.equal(averageDeposit(entries, 2), 1500);
});

test('with no deposits there is no average', () => {
  assert.equal(averageDeposit([wd('w', 500)], 3), null);
  assert.equal(averageDeposit([], 3), null);
});
