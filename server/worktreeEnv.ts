import { sep } from 'node:path'

/**
 * `.env` is gitignored, so `git worktree add` creates a checkout with no `.env` at all. A dev
 * server started in one has every server secret unset: the AI handlers throw NO_KEY, apiRoute maps
 * that to 501, and the UI reports "No model key set." — even though the main checkout it was cut
 * from is fully configured. Worktrees live at `<main checkout>/.claude/worktrees/<name>`, so the
 * main checkout is just the path above that marker, and vite.config can read its `.env` as a
 * fallback for the server secrets.
 *
 * Returns null when `cwd` is not inside a worktree, i.e. we are already in the main checkout.
 */
export function mainCheckoutRoot(cwd: string): string | null {
  const marker = `${sep}.claude${sep}worktrees${sep}`
  const at = cwd.indexOf(marker)
  return at === -1 ? null : cwd.slice(0, at)
}
