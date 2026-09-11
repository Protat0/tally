import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ICON_KEYS, isIconKey, resolveIconKey, initialOf } from './icons.ts';

test('a stored icon key resolves to itself', () => {
  for (const key of ICON_KEYS) assert.equal(resolveIconKey(key, 'shapes'), key);
});

// Wallets and custom categories saved before the switch still hold emoji. They
// map across at read time, so no stored row had to be rewritten.
test('emoji saved before icons map to the matching icon', () => {
  assert.equal(resolveIconKey('🏦', 'wallet'), 'landmark');
  assert.equal(resolveIconKey('💵', 'wallet'), 'banknote');
  assert.equal(resolveIconKey('📱', 'wallet'), 'smartphone');
  assert.equal(resolveIconKey('🎯', 'shapes'), 'target');
  assert.equal(resolveIconKey('🐶', 'shapes'), 'paw-print');
});

// The same emoji can arrive with or without the invisible variation selector
// (U+FE0F), depending on the keyboard that typed it.
test('the emoji variation selector is ignored', () => {
  assert.equal(resolveIconKey('✈️', 'shapes'), 'plane');
  assert.equal(resolveIconKey('✈', 'shapes'), 'plane');
  assert.equal(resolveIconKey('🛍️', 'shapes'), 'shopping-bag');
});

test('anything unrecognised falls back', () => {
  for (const v of [null, undefined, '', '🦄', 'not-an-icon', 'Landmark']) {
    assert.equal(resolveIconKey(v, 'wallet'), 'wallet', `for ${String(v)}`);
  }
});

test('isIconKey only accepts known keys', () => {
  assert.equal(isIconKey('landmark'), true);
  assert.equal(isIconKey('Landmark'), false);
  assert.equal(isIconKey('🏦'), false);
});

test('a person shows their initial, uppercased', () => {
  assert.equal(initialOf('marco'), 'M');
  assert.equal(initialOf('  ana '), 'A');
});

// Array.from splits by code point, so a name that opens with a character
// outside the basic plane keeps the whole character instead of half of it.
test('an initial is a whole character', () => {
  assert.equal(initialOf('élise'), 'É');
  assert.equal(initialOf('𝒥en'), '𝒥');
});

test('a blank name still gets an avatar', () => {
  assert.equal(initialOf(''), '?');
  assert.equal(initialOf('   '), '?');
});
