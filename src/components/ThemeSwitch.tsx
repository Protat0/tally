'use client';

import { useTheme, setTheme } from './useTheme';

// A switch rather than a pair of buttons: dark is the app's default, and light
// is the one thing to turn on.
export default function ThemeSwitch() {
  const light = useTheme() === 'light';
  return (
    <button
      role="switch"
      aria-checked={light}
      aria-label="Light mode"
      onClick={() => setTheme(light ? 'dark' : 'light')}
      className={`flex h-7 w-12 shrink-0 rounded-full p-[3px] transition-colors duration-200 ${
        light ? 'justify-end bg-primary' : 'justify-start bg-line-strong'
      }`}
    >
      <span className="h-[22px] w-[22px] rounded-full bg-white elev-knob" />
    </button>
  );
}
