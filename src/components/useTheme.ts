'use client';

import { useSyncExternalStore } from 'react';
import { parseTheme, THEME_COLOR, THEME_STORAGE_KEY, type Theme } from '@/lib/theme';

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => { listeners.delete(onChange); };
}

// The <html> attribute is the source of truth. The boot script set it before
// React existed, so reading it back is how the switch agrees with the page.
function getSnapshot(): Theme {
  return parseTheme(document.documentElement.getAttribute('data-theme'));
}

// There is no document on the server. Dark is what the server renders, and
// React re-reads the real value straight after hydration.
function getServerSnapshot(): Theme {
  return 'dark';
}

export function setTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, theme);
  } catch {
    // Storage blocked: the theme still applies for this visit, it just won't be remembered.
  }
  listeners.forEach(notify => notify());
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
