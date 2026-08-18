import { test } from 'node:test';
import assert from 'node:assert/strict';
import { expenseDeltas, mergeDeltas, moveDeltas, negate } from './walletDeltas.ts';

test('a plain expense takes its amount out of the funding wallet', () => {
  const d = expenseDeltas({ walletId: 'gcash', myShare: 300, owedToMe: [] });

  assert.deepEqual(d, { gcash: -300 });
});

// The ₱1,500 dinner from the splits design: your share is ₱500, but ₱1,500
// really left GCash — each debt_out leaves the same wallet the expense did.
test('a wallet-funded split takes the whole typed amount out, not just my share', () => {
  const d = expenseDeltas({
    walletId: 'gcash',
    myShare: 500,
    owedToMe: [{ amount: 500 }, { amount: 500 }],
  });

  assert.deepEqual(d, { gcash: -1500 });
});

// The property the whole edit path rests on: an edit that changes nothing must
// move no money. updateExpense commits merge(negate(old), next) in one write,
// so if old and next are equal the wallet must land on exactly zero.
test('reversing a footprint and re-applying it cancels to zero', () => {
  const footprint = expenseDeltas({
    walletId: 'gcash',
    myShare: 500,
    owedToMe: [{ amount: 500 }],
  });

  const net = mergeDeltas(negate(footprint), footprint);

  assert.equal(net.gcash, 0);
});

// reverseMoves already warns about this: 0.01 + 0.05 is 0.060000000000000005,
// and sub-centavo dust in a stored balance means a balance that should be zero
// never compares equal to it. Summing is exactly where the dust enters.
test('merging rounds float dust away at the centavo', () => {
  const merged = mergeDeltas({ gcash: 0.01 }, { gcash: 0.05 });

  assert.equal(merged.gcash, 0.06);
});

// Guard, not a driven cycle: this branch already worked when written.
// When another person pays, no wallet of yours moves — the whole of it becomes
// a debt row instead. An edit must not invent a refund out of nothing.
test('an expense someone else paid moves no wallet', () => {
  const d = expenseDeltas({ walletId: null, myShare: 300, owedToMe: [] });

  assert.deepEqual(d, {});
});

// Guard, not a driven cycle. Re-funding an expense from a different wallet is
// the two-wallet edit: the old one is made whole, the new one pays in full.
test('moving an expense to another wallet refunds the old and debits the new', () => {
  const old = expenseDeltas({ walletId: 'gcash', myShare: 1500, owedToMe: [] });
  const next = expenseDeltas({ walletId: 'bpi', myShare: 1500, owedToMe: [] });

  assert.deepEqual(mergeDeltas(negate(old), next), { gcash: 1500, bpi: -1500 });
});

// The destination receives the full amount; the fee is what the bank kept, and
// it comes out of the source on top. So the two ends do not cancel.
test('a transfer debits the source by amount plus fee and credits the full amount', () => {
  const d = moveDeltas({
    kind: 'moved', amount: 1000, fee: 25,
    walletId: 'bpi', toWalletId: 'gcash',
  });

  assert.deepEqual(d, { bpi: -1025, gcash: 1000 });
});

// Withdrawals written before cash had a destination carry no toWalletId. The
// money really did leave, so it is not net-zero like a transfer — and the fee
// left with it, which is why reversing one has to give both back.
test('a legacy withdrawal with no destination is money leaving, fee included', () => {
  const d = moveDeltas({
    kind: 'withdrawn', amount: 500, fee: 15,
    walletId: 'bpi', toWalletId: null,
  });

  assert.deepEqual(d, { bpi: -515 });
});
