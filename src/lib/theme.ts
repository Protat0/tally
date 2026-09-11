// Tally's color theme. Dark is what the app was designed in and stays the
// default; light is opt-in and remembered per device, not per account.

export type Theme = 'dark' | 'light';

export const THEME_STORAGE_KEY = 'tally-theme';

// The browser chrome color for each theme — the page background, so a phone's
// status bar blends into the app rather than framing it.
export const THEME_COLOR: Record<Theme, string> = {
  dark: '#121110',
  light: '#FAFAF9',
};

// Only an explicit "light" is light. Missing, blank or unrecognised values fall
// back to dark rather than to no theme at all.
export function parseTheme(value: string | null | undefined): Theme {
  return value === 'light' ? 'light' : 'dark';
}

// Runs inline in <head>, before the body paints, so a light-mode user never
// sees a dark frame. It can import nothing, so it restates parseTheme in
// miniature; theme.test.ts runs it to keep the two in step.
//
// The theme-color meta tag may not be parsed yet when this runs, so if it is
// missing the color is set again once the document has loaded.
export const themeBootScript = `(function () {
  try {
    var theme = localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === 'light' ? 'light' : 'dark';
    var colors = ${JSON.stringify(THEME_COLOR)};
    document.documentElement.setAttribute('data-theme', theme);
    var setColor = function () {
      var meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', colors[theme]);
      return meta;
    };
    if (!setColor()) document.addEventListener('DOMContentLoaded', setColor);
  } catch (e) {}
})();`;
