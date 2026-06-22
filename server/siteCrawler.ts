import { chromium, type Page } from 'playwright'

/**
 * Rendered site crawler for "Set up with Claude". Loads the homepage plus the
 * highest-signal internal pages in a headless browser and returns their rendered
 * text, so JS-heavy and bot-walled sites (which a plain fetch can't see) still
 * yield their real messaging. The brand's OWN public site, read at their request
 * during onboarding. Dev/server only.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Highest-signal pages to pull beyond the homepage, ranked. Keeps the map to the
// messaging-bearing pages, not every URL on a large domain.
const PRIORITY_PATHS = [
  'product', 'pricing', 'features', 'solutions', 'platform', 'use-case',
  'customers', 'about', 'how-it-works', 'services', 'case-stud', 'blog',
]

function rankPath(url: string): number {
  const p = url.toLowerCase()
  let s = 0
  PRIORITY_PATHS.forEach((kw, i) => {
    if (p.includes(kw)) s += PRIORITY_PATHS.length - i
  })
  return s
}

function internalLinks(html: string, origin: string, max: number): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], origin)
      if (u.origin !== origin) continue
      const path = u.pathname.replace(/\/$/, '')
      if (!path) continue
      if (/\.(png|jpe?g|gif|svg|webp|avif|pdf|zip|css|js|ico|woff2?|mp4|mov)$/i.test(path)) continue
      found.add(u.origin + u.pathname)
    } catch {
      /* skip malformed href */
    }
  }
  return [...found].sort((a, b) => rankPath(b) - rankPath(a)).slice(0, max)
}

/** Render one page and return its visible text + raw HTML (for link discovery). */
async function render(page: Page, href: string): Promise<{ html: string; text: string } | null> {
  try {
    await page.goto(href, { waitUntil: 'domcontentloaded', timeout: 25000 })
    await page.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {})
    const text = await page.innerText('body').catch(() => '')
    const html = await page.content().catch(() => '')
    const clean = text.replace(/\s+/g, ' ').trim()
    if (!clean) return null
    return { html, text: clean.slice(0, 4000) }
  } catch {
    return null
  }
}

export interface SiteCrawl {
  text: string
  pages: string[]
  /** Social profiles linked from the site (platform -> profile URL). */
  socials: Record<string, string>
}

// Social profile links a brand puts in its header/footer. First match per platform.
const SOCIAL_PATTERNS: { platform: string; re: RegExp }[] = [
  { platform: 'youtube', re: /https?:\/\/(?:www\.)?youtube\.com\/(?:@[\w.-]+|channel\/UC[\w-]+|c\/[\w.-]+|user\/[\w.-]+)/i },
  { platform: 'instagram', re: /https?:\/\/(?:www\.)?instagram\.com\/(?!p\/|reel\/|explore\/)[\w.][\w.-]*/i },
  { platform: 'linkedin', re: /https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in|school)\/[\w.-]+/i },
  { platform: 'tiktok', re: /https?:\/\/(?:www\.)?tiktok\.com\/@[\w.-]+/i },
  { platform: 'x', re: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!intent\/|share|home)[\w]+/i },
  { platform: 'facebook', re: /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share\.php)[\w.-]+/i },
]

function extractSocials(html: string, found: Record<string, string>): void {
  for (const { platform, re } of SOCIAL_PATTERNS) {
    if (found[platform]) continue
    const m = re.exec(html)
    if (m) found[platform] = m[0]
  }
}

/** Crawl the homepage + top internal pages with a real browser. `maxPages` caps
 *  the internal pages pulled (homepage is always included). */
export async function crawlSite(url: string, maxPages = 6): Promise<SiteCrawl> {
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`
  let origin: string
  try {
    origin = new URL(href).origin
  } catch {
    return { text: '', pages: [], socials: {} }
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] })
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' })
    await ctx.addInitScript("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })")
    const page = await ctx.newPage()

    const home = await render(page, href)
    if (!home) return { text: '', pages: [], socials: {} }
    const parts = [`# ${origin}\n${home.text}`]
    const pages = [origin]
    const socials: Record<string, string> = {}
    extractSocials(home.html, socials)
    for (const link of internalLinks(home.html, origin, maxPages)) {
      const p = await render(page, link)
      if (p?.text) {
        parts.push(`# ${link}\n${p.text}`)
        pages.push(link)
        extractSocials(p.html, socials)
      }
    }
    return { text: parts.join('\n\n---\n\n').slice(0, 18000), pages, socials }
  } catch {
    return { text: '', pages: [], socials: {} }
  } finally {
    await browser?.close().catch(() => {})
  }
}
