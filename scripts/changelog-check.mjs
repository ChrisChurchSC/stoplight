#!/usr/bin/env node
// Drift guard for the public changelog. Lists commits that touched src/ since the changelog page
// (src/components/ChangelogPage.tsx) was last edited, so user-facing changes don't silently miss the
// changelog. Heuristic + informational: some listed commits may be internal-only, so it's a review
// prompt, not a hard gate. Warn-only (always exits 0) so it can run in build/CI without blocking.
//
// Usage: npm run changelog:check
import { execSync } from 'node:child_process'

const FILE = 'src/components/ChangelogPage.tsx'
const git = (cmd) => execSync(cmd, { encoding: 'utf8' }).trim()

let last
try {
  last = git(`git log -1 --format=%h -- ${FILE}`)
} catch {
  console.log('changelog-check: not a git repo or no history; skipping.')
  process.exit(0)
}
if (!last) {
  console.log('changelog-check: no changelog history found; skipping.')
  process.exit(0)
}

const raw = git(`git log ${last}..HEAD --oneline -- src/`)
const commits = raw ? raw.split('\n').filter(Boolean) : []

if (commits.length === 0) {
  console.log(`✓ Changelog is current (no src/ changes since it was last updated at ${last}).`)
  process.exit(0)
}

console.log(`⚠ Changelog may be stale: ${commits.length} commit(s) touched src/ since ${FILE} was last updated (${last}).`)
console.log('  Review these for user-facing changes to add to the RELEASES array:\n')
console.log(commits.map((l) => '   ' + l).join('\n'))
console.log(`\n  Then edit ${FILE} (the RELEASES array) and commit.`)
process.exit(0)
