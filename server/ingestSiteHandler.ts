/**
 * Server-side "ingest a brand's site content" — fetches the brand's website (homepage + a handful of
 * pages from its sitemap) with plain global fetch and extracts the real content (title, description,
 * a snippet of copy) per page. Serverless-safe: NO Playwright, just fetch + regex, so it runs on
 * Vercel functions (unlike the full crawler). Returns items shaped for normalizeImportItem; the
 * client imports them into the Library via importAssets(brand, CONTENT_LIBRARY_CAMPAIGN, items, 'site').
 */

const UA = 'Mozilla/5.0 (compatible; BreadcrumbsBot/1.0; +https://breadcrumbs.app)'

interface Page {
  url: string
  title: string
  description: string
  text: string
}

function firstMatch(html: string, res: RegExp[]): string {
  for (const re of res) {
    const m = html.match(re)
    if (m && m[1]) return m[1].trim()
  }
  return ''
}

function extract(html: string): { title: string; description: string; text: string } {
  const title = firstMatch(html, [/<title[^>]*>([^<]*)<\/title>/i, /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']*)["']/i])
  const description = firstMatch(html, [
    /<meta[^>]+name=["']description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']*)["']/i,
    /<meta[^>]+name=["']twitter:description["'][^>]+content=["']([^"']*)["']/i,
  ])
  // Visible-ish text: drop scripts/styles/head, strip tags, collapse whitespace.
  const body = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { title, description, text: body.slice(0, 600) }
}

async function fetchPage(url: string): Promise<Page | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000), redirect: 'follow' })
    if (!res.ok) return null
    const ct = res.headers.get('content-type') || ''
    if (!ct.includes('text/html') && ct !== '') return null
    const html = await res.text()
    const { title, description, text } = extract(html)
    if (!title && !description && !text) return null
    return { url, title, description, text }
  } catch {
    return null
  }
}

async function sitemapUrls(origin: string): Promise<string[]> {
  try {
    const res = await fetch(new URL('/sitemap.xml', origin).href, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(6000) })
    if (!res.ok) return []
    const xml = await res.text()
    return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1].trim())
  } catch {
    return []
  }
}

const SKIP = /\.(jpg|jpeg|png|gif|webp|svg|pdf|xml|css|js|ico|zip|mp4|woff2?)($|\?)/i

export async function runIngestSite(body: unknown): Promise<unknown> {
  const { url } = (body ?? {}) as { url?: string }
  const raw = (url ?? '').trim()
  if (!raw) return { items: [] }
  const norm = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let origin = ''
  try {
    origin = new URL(norm).origin
  } catch {
    return { items: [] }
  }

  const pages: Page[] = []
  const home = await fetchPage(norm)
  if (home) pages.push(home)

  // A few more pages from the sitemap (same origin, page-like), capped so it stays fast.
  const locs = await sitemapUrls(origin)
  const candidates = [...new Set(locs)]
    .filter((l) => {
      try {
        return new URL(l).origin === origin
      } catch {
        return false
      }
    })
    .filter((l) => l !== norm && l !== `${norm}/` && !SKIP.test(l))
    .slice(0, 6)

  for (const l of candidates) {
    if (pages.length >= 7) break
    const p = await fetchPage(l)
    if (p && (p.title || p.description || p.text)) pages.push(p)
  }

  // Shape each page as an item normalizeImportItem understands (title, primaryText, description, url).
  const items = pages
    .filter((p) => p.title || p.description || p.text)
    .map((p) => ({
      title: p.title || new URL(p.url).pathname.replace(/\//g, ' ').trim() || 'Page',
      primaryText: p.description || p.text,
      description: p.description || undefined,
      url: p.url,
      channel: 'website',
    }))

  return { items }
}
