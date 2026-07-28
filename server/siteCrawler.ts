import { chromium, type Page } from 'playwright'

/**
 * Rendered site crawler for "Set up with Claude" and the website-channel ingest.
 * Discovers the brand's FULL public surface from its sitemap (robots.txt +
 * sitemap.xml, following sitemap indexes), unions that with links found on the
 * homepage, and renders the pages in a headless browser so JS-heavy and
 * bot-walled sites still yield their real copy. Sitemap-first means we capture
 * every public-facing page the site advertises, not just the high-signal few.
 * The brand's OWN public site, read at their request. Dev/server only.
 */

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

// Pages to read first when there are more public pages than the read cap — the
// messaging-bearing ones. Discovery still enumerates EVERY page; this only orders
// which get read when a large site exceeds maxPages.
const PRIORITY_PATHS = [
  'product', 'pricing', 'features', 'solutions', 'platform', 'use-case',
  'customers', 'about', 'how-it-works', 'services', 'case-stud', 'work', 'blog',
]

function rankPath(url: string): number {
  const p = url.toLowerCase()
  // Homepage first, then priority keywords, then shallower paths over deep ones.
  if (new URL(p).pathname.replace(/\/$/, '') === '') return 1000
  let s = 0
  PRIORITY_PATHS.forEach((kw, i) => {
    if (p.includes(kw)) s += PRIORITY_PATHS.length - i
  })
  s -= (p.match(/\//g)?.length ?? 0) // prefer shallower URLs on ties
  return s
}

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|pdf|zip|css|js|ico|woff2?|mp4|mov|xml|json|rss)$/i

/** True for a real public-facing page URL (not an asset or a machine endpoint). */
function isPageUrl(pathname: string): boolean {
  if (ASSET_RE.test(pathname)) return false
  if (/^\/(api|wp-json|cdn-cgi|_next\/data)\b/i.test(pathname)) return false
  return true
}

function internalLinks(html: string, origin: string): string[] {
  const found = new Set<string>()
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], origin)
      if (u.origin !== origin) continue
      const path = u.pathname.replace(/\/$/, '')
      if (!path) continue
      if (!isPageUrl(path)) continue
      found.add(u.origin + u.pathname)
    } catch {
      /* skip malformed href */
    }
  }
  return [...found]
}

/** All <loc> values in a sitemap/urlset XML. */
function locsFrom(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1])
}

type ReqGet = (url: string) => Promise<string | null>

/**
 * Enumerate every same-origin public page from the site's sitemaps. Seeds from
 * robots.txt `Sitemap:` directives plus the conventional /sitemap.xml and
 * /sitemap_index.xml, and follows sitemap indexes to their child sitemaps.
 */
async function discoverSitemapUrls(reqGet: ReqGet, origin: string): Promise<string[]> {
  const queue: string[] = []
  const robots = await reqGet(`${origin}/robots.txt`)
  if (robots) for (const m of robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)) queue.push(m[1].trim())
  queue.push(`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`)

  const pages = new Set<string>()
  const visited = new Set<string>()
  let i = 0
  // Bounded so a pathological sitemap can't run away.
  while (i < queue.length && visited.size < 25 && pages.size < 400) {
    const sm = queue[i++]
    if (visited.has(sm)) continue
    visited.add(sm)
    const xml = await reqGet(sm)
    if (!xml) continue
    const locs = locsFrom(xml)
    if (/<sitemapindex[\s>]/i.test(xml)) {
      // Index: each <loc> is a child sitemap to follow.
      for (const loc of locs) queue.push(loc)
    } else {
      for (const loc of locs) {
        try {
          const u = new URL(loc)
          if (u.origin === origin && isPageUrl(u.pathname)) pages.add(u.origin + u.pathname)
        } catch {
          /* skip malformed loc */
        }
      }
    }
  }
  return [...pages]
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
  /** Total public-facing pages discovered (may exceed pages read when capped). */
  discovered: number
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

/**
 * Crawl the brand's public site. Discovers every public page from the sitemap,
 * unions the homepage's internal links, and renders up to `maxPages` of them
 * (priority-ordered) in parallel. `discovered` reports the full count found even
 * when more pages exist than were read.
 */
export async function crawlSite(url: string, maxPages = 40): Promise<SiteCrawl> {
  const href = /^https?:\/\//.test(url) ? url : `https://${url}`
  let origin: string
  try {
    origin = new URL(href).origin
  } catch {
    return { text: '', pages: [], socials: {}, discovered: 0 }
  }

  let browser
  try {
    browser = await chromium.launch({ headless: true, args: ['--disable-blink-features=AutomationControlled', '--no-sandbox'] })
    const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 900 }, locale: 'en-US' })
    await ctx.addInitScript("Object.defineProperty(navigator, 'webdriver', { get: () => undefined })")
    const reqGet: ReqGet = async (u) => {
      try {
        const r = await ctx.request.get(u, { timeout: 8000 })
        if (!r.ok()) return null
        return await r.text()
      } catch {
        return null
      }
    }

    const page = await ctx.newPage()
    const home = await render(page, href)
    if (!home) return { text: '', pages: [], socials: {}, discovered: 0 }

    // Full public surface: sitemap pages ∪ homepage links ∪ the homepage itself.
    const sitemapUrls = await discoverSitemapUrls(reqGet, origin)
    const homeOrigin = origin // homepage canonical key
    const candidates = [...new Set([homeOrigin, ...sitemapUrls, ...internalLinks(home.html, origin)])]
    const discovered = candidates.length
    const ordered = candidates.sort((a, b) => rankPath(b) - rankPath(a))
    const toRead = ordered.slice(0, Math.max(1, maxPages))

    const socials: Record<string, string> = {}
    extractSocials(home.html, socials)

    // Render the rest in a small pool (homepage is already done).
    const rest = toRead.filter((u) => u !== homeOrigin)
    const rendered = new Map<string, string>()
    let idx = 0
    const worker = async () => {
      const p = await ctx.newPage()
      try {
        for (;;) {
          const j = idx++
          if (j >= rest.length) break
          const r = await render(p, rest[j])
          if (r?.text) {
            rendered.set(rest[j], r.text)
            extractSocials(r.html, socials)
          }
        }
      } finally {
        await p.close().catch(() => {})
      }
    }
    await Promise.all(Array.from({ length: Math.min(4, Math.max(1, rest.length)) }, worker))

    // Assemble in priority order, homepage first.
    const parts = [`# ${origin}\n${home.text}`]
    const pages = [origin]
    for (const u of rest) {
      const t = rendered.get(u)
      if (t) {
        parts.push(`# ${u}\n${t}`)
        pages.push(u)
      }
    }
    return { text: parts.join('\n\n---\n\n').slice(0, 150000), pages, socials, discovered }
  } catch {
    return { text: '', pages: [], socials: {}, discovered: 0 }
  } finally {
    await browser?.close().catch(() => {})
  }
}
