import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseTheme, themeBootScript, THEME_COLOR, THEME_STORAGE_KEY } from './theme.ts';

test('a stored "light" is light', () => {
  assert.equal(parseTheme('light'), 'light');
});

// Dark is the default the app was designed in, so anything that isn't an
// explicit "light" — nothing stored, a blank, a value from some other build —
// lands on dark rather than on no theme at all.
test('anything else is dark', () => {
  for (const v of [null, undefined, '', 'dark', 'Light', 'system', 'garbage']) {
    assert.equal(parseTheme(v), 'dark', `for ${String(v)}`);
  }
});

// The boot script runs inline in <head> and can import nothing, so it carries
// its own copy of the rule above. Running it against a fake page is what keeps
// that copy honest.
function boot(stored: string | null | (() => never)) {
  const attrs: Record<string, string> = {};
  const meta = { content: '', setAttribute(_name: string, v: string) { meta.content = v; } };
  const localStorage = {
    getItem(key: string) {
      assert.equal(key, THEME_STORAGE_KEY);
      return typeof stored === 'function' ? stored() : stored;
    },
  };
  const document = {
    documentElement: { setAttribute(name: string, v: string) { attrs[name] = v; } },
    querySelector: () => meta,
    addEventListener: () => {},
  };
  new Function('localStorage', 'document', themeBootScript)(localStorage, document);
  return { theme: attrs['data-theme'], themeColor: meta.content };
}

test('the boot script applies a stored light theme', () => {
  assert.deepEqual(boot('light'), { theme: 'light', themeColor: THEME_COLOR.light });
});

test('the boot script falls back to dark', () => {
  assert.deepEqual(boot(null), { theme: 'dark', themeColor: THEME_COLOR.dark });
  assert.deepEqual(boot('nonsense'), { theme: 'dark', themeColor: THEME_COLOR.dark });
});

// Storage can throw outright (private browsing, blocked site data). The page
// must still render — on the server's default dark, with no uncaught error.
test('the boot script survives storage that throws', () => {
  assert.doesNotThrow(() => boot(() => { throw new Error('denied'); }));
});
