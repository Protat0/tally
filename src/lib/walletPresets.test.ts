import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WALLET_PRESET_GROUPS, ALL_WALLET_PRESETS } from './walletPresets.ts';
import { LOGO_KEYS } from './icons.ts';

test('every bank and e-wallet preset carries its logo', () => {
  for (const p of ALL_WALLET_PRESETS) {
    if (p.name === 'Cash') continue;
    assert.ok(p.logo, `${p.name} has a logo`);
    assert.ok((LOGO_KEYS as readonly string[]).includes(p.logo), `${p.name}: ${p.logo} is a known logo`);
  }
});

// Cash is not a brand, so it keeps the drawn banknote.
test('cash has no logo', () => {
  const cash = ALL_WALLET_PRESETS.find(p => p.name === 'Cash');
  assert.ok(cash);
  assert.equal(cash.logo, undefined);
});

test('every logo is used by some preset', () => {
  const used = new Set(ALL_WALLET_PRESETS.map(p => p.logo));
  for (const key of LOGO_KEYS) assert.ok(used.has(key), `${key} is offered`);
});

test('preset names are unique', () => {
  const names = WALLET_PRESET_GROUPS.flatMap(g => g.presets.map(p => p.name));
  assert.equal(new Set(names).size, names.length);
});
