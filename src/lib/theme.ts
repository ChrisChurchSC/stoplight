/**
 * Light / dark / follow-the-system, as a data-theme attribute on <html>.
 *
 * The stylesheet does the work: index.css defines the dark palette under both
 * `@media (prefers-color-scheme: dark)` and `:root[data-theme='dark']`, so 'system' is simply the
 * ABSENCE of the attribute rather than a third palette to keep in step. That is why this writes
 * nothing at all for 'system' instead of resolving the preference itself — one definition of what
 * dark looks like, and it lives in CSS.
 *
 * Applied from a plain script before React mounts (see main.tsx), because reading the stored choice
 * after first paint is how you get a flash of the wrong theme.
 */

export type ThemeChoice = 'light' | 'dark' | 'system'

const KEY = 'stoplight.theme.v1'

export function readTheme(): ThemeChoice {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    // Private mode / storage disabled: follow the OS rather than failing to render.
    return 'system'
  }
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement
  if (choice === 'system') root.removeAttribute('data-theme')
  else root.setAttribute('data-theme', choice)
}

export function setTheme(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, choice)
  } catch {
    /* ignore: the attribute below still applies for this session */
  }
  applyTheme(choice)
}

/** True when what is on screen right now is the dark palette, whichever route got it there. */
export function isDarkNow(): boolean {
  const attr = document.documentElement.getAttribute('data-theme')
  if (attr === 'dark') return true
  if (attr === 'light') return false
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false
}
