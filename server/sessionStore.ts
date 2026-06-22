import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * Persisted logged-in browser sessions (Playwright storageState), keyed by the
 * channel's PROFILE URL. The agency logs into a client's channel ONCE; we save
 * the session here, and the authenticated gather reads through it. Keyed by
 * profile URL (not client) so a session is reusable and works even before a
 * client record exists. Stored under .rushhour/ (gitignored): treat these like
 * passwords, they grant read access to that account.
 */

const DIR = join(process.cwd(), '.rushhour', 'sessions')

/** Stable key from a profile URL: host + path, lowercased, no protocol/query. */
export function sessionKey(profileUrl: string): string {
  try {
    const u = new URL(/^https?:\/\//.test(profileUrl) ? profileUrl : `https://${profileUrl}`)
    return `${u.host}${u.pathname}`.replace(/\/$/, '').toLowerCase()
  } catch {
    return profileUrl.toLowerCase()
  }
}

function fileFor(profileUrl: string): string {
  const safe = sessionKey(profileUrl).replace(/[^a-z0-9]+/gi, '_')
  return join(DIR, `${safe}.json`)
}

export function hasSession(profileUrl: string): boolean {
  return existsSync(fileFor(profileUrl))
}

export function loadSession(profileUrl: string): unknown | undefined {
  const p = fileFor(profileUrl)
  if (!existsSync(p)) return undefined
  try {
    return JSON.parse(readFileSync(p, 'utf8'))
  } catch {
    return undefined
  }
}

export function saveSession(profileUrl: string, state: unknown): void {
  if (!existsSync(DIR)) mkdirSync(DIR, { recursive: true })
  writeFileSync(fileFor(profileUrl), JSON.stringify(state))
}
