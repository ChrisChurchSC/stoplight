import { chromium, type BrowserContext } from 'playwright'
import { hasSession, loadSession } from './sessionStore'
import { platformOf } from './connectChannel'

/**
 * Gather ONE channel's live content for a per-channel ingest: the rendered feed
 * text AND the post images themselves, so Claude can read the copy baked INTO the
 * art (overlay headlines, on-image claims) and not just the captions. Reads
 * authenticated through a saved session when one exists (the "log in once" flow),
 * otherwise renders the public profile. Dev/server only.
 *
 * Images come back as base64 so the handler can hand them straight to Claude
 * vision; fetching them through the same browser context means login-walled CDNs
 * (Instagram, LinkedIn) serve them with the session's cookies.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'


// Pull a generous but bounded set of post images. Accumulating across scroll steps
// loads a lot; this ceiling keeps a huge feed (and the vision cost) in check.
const MAX_IMAGES = 60

export interface GatheredImage {
  data: string // base64, no data: prefix
  mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  src: string
}
export interface ChannelGather {
  platform: string
  text: string
  images: GatheredImage[]
  /** Images seen on the feed before fetching (so the UI can show "pulled N"). */
  seen: number
}

/** Where the real content lives for each platform, given a profile URL. */
function contentUrl(profileUrl: string, platform: string): string {
  const base = profileUrl.replace(/\/$/, '')
  if (platform === 'youtube') return `${base}/videos`
  if (platform === 'linkedin') {
    // Company pages post at /posts/; personal profiles at /recent-activity/all/.
    return /\/in\//i.test(base) ? `${base}/recent-activity/all/` : `${base}/posts/`
  }
  return profileUrl
}

/**
 * Render a channel profile (authenticated when a session exists) and return its
 * feed text plus the post images as base64. Returns null when the page can't be
 * read or still hits a login wall (so the caller can fall back / prompt connect).
 */
export async function gatherChannelMedia(
  profileUrl: string,
  onProgress?: (detail: string) => void,
): Promise<ChannelGather | null> {
  const platform = platformOf(profileUrl)
  const authed = hasSession(profileUrl)
  // Instagram/Facebook show almost nothing logged-out (a few public posts before a
  // login wall — that's the "only 3 posts" case). Require a saved session so the
  // user connects first, rather than ingesting a useless handful.
  if (!authed && (platform === 'instagram' || platform === 'facebook')) return null
  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--no-sandbox'] })
    const context = await browser.newContext({
      ...(authed
        ? { storageState: loadSession(profileUrl) as Awaited<ReturnType<BrowserContext['storageState']>> }
        : {}),
      userAgent: UA,
      viewport: { width: 1280, height: 1400 },
      locale: 'en-US',
    })
    const page = await context.newPage()
    await page.goto(contentUrl(profileUrl, platform), { waitUntil: 'domcontentloaded', timeout: 30000 })
    await page.waitForTimeout(4000)
    onProgress?.(`Reading ${platform}${authed ? ' (connected)' : ''}`)

    // Capture post images by SCREENSHOTTING the rendered grid elements. Two things
    // beat URL-harvesting here: the feed virtualizes (off-screen <img> get removed
    // from the DOM) AND Instagram's CDN rejects server-side fetches of the image
    // URLs (context.request and in-page fetch both came back empty / CORS-blocked).
    // Screenshotting the already-rendered, currently-visible <img> at each scroll
    // step is the reliable path: real pixels, no fetch, no CORS. Deduped by src.
    const images: GatheredImage[] = []
    const captured = new Set<string>()
    const grab = async () => {
      const imgs = page.locator('img')
      const n = await imgs.count().catch(() => 0)
      for (let i = 0; i < n && images.length < MAX_IMAGES; i++) {
        const el = imgs.nth(i)
        const src = (await el.getAttribute('src').catch(() => null)) || ''
        if (!/^https?:/i.test(src) || captured.has(src)) continue
        if (/(avatar|profile_pic|favicon|sprite|emoji|\bicon\b|logo)/i.test(src)) continue
        const box = await el.boundingBox().catch(() => null)
        // Content-sized and currently on-screen only (skips chrome, and avoids the
        // big auto-scroll Playwright does to shoot an off-screen element).
        if (!box || box.width < 180 || box.height < 180 || box.y < -50 || box.y > 1300) continue
        captured.add(src)
        const buf = await el.screenshot({ timeout: 4000 }).catch(() => null)
        if (buf && buf.length > 2000) images.push({ data: buf.toString('base64'), mediaType: 'image/png', src })
      }
    }
    await grab()
    for (let i = 0; i < 16 && images.length < MAX_IMAGES; i++) {
      await page.mouse.wheel(0, 5000).catch(() => {})
      await page.waitForTimeout(1500)
      await grab()
    }
    onProgress?.(`Captured ${images.length} post images`)

    const text = (await page.innerText('body').catch(() => '')).replace(/\s+/g, ' ').trim()
    // Still a login wall and unauthenticated? Signal "connect to read this one".
    if (!authed && text.length < 1200 && /\b(log in|sign in|sign up)\b/i.test(text)) {
      return null
    }

    return { platform, text: text.slice(0, 7000), images, seen: captured.size }
  } catch {
    return null
  } finally {
    await browser?.close().catch(() => {})
  }
}
