// Every icon the app can store or draw, by name. Wallets and custom categories
// keep one of these keys in their icon column. Rows saved before emoji were
// replaced still hold the emoji itself; resolveIconKey maps those across when
// they are read, so no stored data had to be rewritten.

export const ICON_KEYS = [
  // Categories
  'utensils-crossed', 'car', 'receipt-text', 'lightbulb', 'zap', 'shopping-bag', 'pill', 'shapes',
  'target', 'paw-print', 'gamepad-2', 'book-open', 'coffee', 'house', 'smartphone', 'piggy-bank',
  'sprout', 'gift', 'plane', 'popcorn', 'dumbbell', 'shower-head', 'shirt', 'music',
  // Wallets
  'credit-card', 'landmark', 'banknote', 'coins', 'wallet', 'briefcase',
  // Income sources and activity
  'laptop', 'undo-2', 'sparkles', 'handshake', 'arrow-left-right', 'shield-check',
] as const;

// `as const` keeps each entry as its exact string rather than widening it to
// `string`, so indexing the array's type with [number] gives the union of all
// of them: 'utensils-crossed' | 'car' | …
export type IconKey = (typeof ICON_KEYS)[number];

// The invisible variation selector some keyboards add after an emoji.
const VARIATION_SELECTOR = /️/g;

// Every emoji the app ever offered, keyed without the variation selector. The
// four usually typed with one are written as escapes, so there is no invisible
// character in this file to get wrong.
const LEGACY_EMOJI: Record<string, IconKey> = {
  '🍜': 'utensils-crossed', '🚗': 'car', '💡': 'lightbulb', '⚡': 'zap', '\u{1F6CD}': 'shopping-bag',
  '💊': 'pill', '✦': 'shapes',
  '🎯': 'target', '🐶': 'paw-print', '🎮': 'gamepad-2', '📚': 'book-open', '☕': 'coffee',
  '🏠': 'house', '📱': 'smartphone', '💰': 'piggy-bank', '🌱': 'sprout', '🎁': 'gift',
  '✈': 'plane', '🍿': 'popcorn', '💪': 'dumbbell', '🚿': 'shower-head', '👕': 'shirt', '🎵': 'music',
  '💳': 'credit-card', '🏦': 'landmark', '💵': 'banknote', '🪙': 'coins', '🏧': 'wallet', '💼': 'briefcase',
  '💻': 'laptop', '↩': 'undo-2', '🤝': 'handshake', '🔄': 'arrow-left-right', '\u{1F6E1}': 'shield-check',
};

// `value is IconKey` makes this a type guard: wherever it returns true,
// TypeScript narrows `value` from string to IconKey.
export function isIconKey(value: string): value is IconKey {
  return (ICON_KEYS as readonly string[]).includes(value);
}

// The icon to draw for whatever is stored: a key as-is, an old emoji mapped to
// its replacement, anything else the fallback. The same emoji can arrive with
// or without the variation selector, depending on the keyboard that typed it,
// so that is stripped before the lookup.
export function resolveIconKey(stored: string | null | undefined, fallback: IconKey): IconKey {
  if (!stored) return fallback;
  if (isIconKey(stored)) return stored;
  return LEGACY_EMOJI[stored.replace(VARIATION_SELECTOR, '')] ?? fallback;
}

// People aren't icons: a debt contact shows their initial. Array.from splits by
// code point, so a name opening with a character outside the basic plane keeps
// the whole character rather than half of a surrogate pair.
export function initialOf(name: string): string {
  const first = Array.from(name.trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}
