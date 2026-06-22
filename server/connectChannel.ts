import { chromium, type Browser, type BrowserContext } from 'playwright'
import { hasSession, loadSession, saveSession } from './sessionStore'

/**
 * Connect a channel by logging in ONCE, then gather it authenticated. The agency
 * has access to its client's accounts, so it signs in (the one step software
 * can't do, proving a permitted human is present); we save the session and Claude
 * reads through it from then on. This is what makes "Claude gathers everything"
 * real for login-walled channels (Instagram, LinkedIn, etc.).
 *
 * Local/dev only. startConnect opens a real (headed) browser for the login;
 * saveConnect persists the resulting session; gatherWithSession renders the
 * profile headless using it and dumps the text for Claude to interpret.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

const LOGIN_URLS: Record<string, string> = {
  instagram: 'https://www.instagram.com/accounts/login/',
  linkedin: 'https://www.linkedin.com/login',
  youtube: 'https://accounts.google.com/ServiceLogin?service=youtube',
  tiktok: 'https://www.tiktok.com/login',
  x: 'https://x.com/login',
  facebook: 'https://www.facebook.com/login',
}

export function platformOf(url: string): string {
  const u = url.toLowerCase()
  if (u.includes('instagram.com')) return 'instagram'
  if (u.includes('linkedin.com')) return 'linkedin'
  if (u.includes('youtube.com')) return 'youtube'
  if (u.includes('tiktok.com')) return 'tiktok'
  if (u.includes('x.com') || u.includes('twitter.com')) return 'x'
  if (u.includes('facebook.com')) return 'facebook'
  return 'web'
}

interface Pending {
  browser: Browser
  context: BrowserContext
  profileUrl: string
}
const pending = new Map<string, Pending>()
let seq = 0

/** Open a real browser at the platform's login. Returns a token; the window
 *  stays open while the user signs in, then saveConnect() persists the session. */
export async function startConnect(profileUrl: string): Promise<{ token: string }> {
  const platform = platformOf(profileUrl)
  const browser = await chromium.launch({ headless: false })
  const context = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 } })
  const page = await context.newPage()
  await page.goto(LOGIN_URLS[platform] ?? profileUrl, { waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {})
  const token = `cx${++seq}`
  pending.set(token, { browser, context, profileUrl })
  return { token }
}

/** Persist the logged-in session for the pending connect, then close the window. */
export async function saveConnect(token: string): Promise<{ ok: boolean; profileUrl?: string }> {
  const p = pending.get(token)
  if (!p) return { ok: false }
  try {
    const state = await p.context.storageState()
    saveSession(p.profileUrl, state)
  } finally {
    await p.browser.close().catch(() => {})
    pending.delete(token)
  }
  return { ok: true, profileUrl: p.profileUrl }
}

/** Where the real content lives for each platform, given a profile URL. */
function contentUrl(profileUrl: string, platform: string): string {
  const base = profileUrl.replace(/\/$/, '')
  if (platform === 'youtube') return `${base}/videos`
  if (platform === 'linkedin') return `${base}/posts/`
  return profileUrl
}

/** Render a connected profile authenticated and dump its text for Claude. Returns
 *  null with no session, or when it still hits a login wall (session expired). */
export async function gatherWithSession(profileUrl: string): Promise<{ text: string; platform: string } | null> {
  if (!hasSession(profileUrl)) return null
  const platform = platformOf(profileUrl)
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const context = await browser.newContext({
      storageState: loadSession(profileUrl) as Awaited<ReturnType<BrowserContext['storageState']>>,
      userAgent: UA,
      viewport: { width: 1280, height: 1200 },
      locale: 'en-US',
    })
    const page = await context.newPage()
    await page.goto(contentUrl(profileUrl, platform), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)
    // Scroll to load more posts/videos into the feed.
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 4000).catch(() => {})
      await page.waitForTimeout(1200)
    }
    const text = await page.innerText('body').catch(() => '')
    const clean = text.replace(/\s+/g, ' ').trim()
    // Still a login wall? Session is missing/expired; signal "reconnect".
    if (clean.length < 1200 && /\b(log in|sign in|sign up)\b/i.test(clean)) return null
    return { text: clean.slice(0, 7000), platform }
  } catch {
    return null
  } finally {
    await browser?.close().catch(() => {})
  }
}
