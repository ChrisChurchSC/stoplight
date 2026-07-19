/**
 * Server-side "ingest a brand's site content" — fetches the brand's website (homepage + a handful of
 * pages from its sitemap) with plain global fetch and extracts the real content (title, description,
 * a snippet of copy) per page. Serverless-safe: NO Playwright, just fetch + regex, so it runs on
 * Vercel functions (unlike the full crawler). Returns items shaped for normalizeImportItem; the
 * client imports them into the Library via importAssets(brand, CONTENT_LIBRARY_CAMPAIGN, items, 'site').
 */

import { resolveGoogle } from './googleResolve.js'

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

const isoDaysAgo = (n: number): string => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10)

/** Every ranking page of a Search Console property with its real search metrics, most impressions
 *  first. This is the authoritative page list (better than a sitemap) AND carries measured reach. */
async function gscPageMetrics(
  site: string,
  token: string,
  limit = 200,
): Promise<{ url: string; impressions: number; clicks: number }[]> {
  try {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ startDate: isoDaysAgo(90), endDate: isoDaysAgo(0), dimensions: ['page'], rowLimit: limit }),
      },
    )
    if (!res.ok) return []
    const j = (await res.json()) as { rows?: { keys?: string[]; clicks?: number; impressions?: number }[] }
    return (j.rows ?? [])
      .map((r) => ({ url: r.keys?.[0] ?? '', impressions: Number(r.impressions) || 0, clicks: Number(r.clicks) || 0 }))
      .filter((r) => r.url)
      .sort((a, b) => b.impressions - a.impressions)
  } catch {
    return []
  }
}

export async function runIngestSite(body: unknown): Promise<unknown> {
  const { url, brand, workspace, website } = (body ?? {}) as {
    url?: string
    brand?: string
    workspace?: string
    website?: string
  }
  const raw = (url ?? website ?? '').trim()
  if (!raw) return { items: [] }
  const norm = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  let origin = ''
  try {
    origin = new URL(norm).origin
  } catch {
    return { items: [] }
  }

  // Preferred page list: Search Console's ranking pages (authoritative + real per-page metrics),
  // available when the workspace has a Google connection. Falls back to the sitemap when it doesn't.
  let gscMetrics: Map<string, { impressions: number; clicks: number }> | null = null
  let gscUrls: string[] = []
  if (brand && workspace) {
    try {
      const g = await resolveGoogle(workspace, brand, norm)
      if (g?.token && g.gsc) {
        const pages = await gscPageMetrics(g.gsc, g.token)
        gscMetrics = new Map(pages.map((p) => [p.url, { impressions: p.impressions, clicks: p.clicks }]))
        gscUrls = pages.map((p) => p.url).filter((u) => {
          try {
            return new URL(u).origin === origin && !SKIP.test(u)
          } catch {
            return false
          }
        })
      }
    } catch {
      /* no GSC connection, fall back to the sitemap below */
    }
  }

  const home = await fetchPage(norm)

  const rawCandidates = gscUrls.length ? gscUrls : await sitemapUrls(origin)
  const candidates = [...new Set(rawCandidates)]
    .filter((l) => {
      try {
        return new URL(l).origin === origin
      } catch {
        return false
      }
    })
    .filter((l) => l !== norm && l !== `${norm}/` && !SKIP.test(l))
    .slice(0, gscUrls.length ? 25 : 6) // GSC's real list is worth crawling deeper than a blind sitemap

  // Fetch copy for each candidate in parallel so a full-site pull stays fast.
  const fetched = (await Promise.all(candidates.map((l) => fetchPage(l)))).filter(
    (p): p is Page => !!p && (!!p.title || !!p.description || !!p.text),
  )
  const pages: Page[] = [...(home ? [home] : []), ...fetched]

  // Shape each page for normalizeImportItem, attaching its real GSC metrics (matched with a trailing
  // slash fallback) so the ingested page carries measured reach.
  const metricFor = (u: string) => gscMetrics?.get(u) ?? gscMetrics?.get(u.endsWith('/') ? u.slice(0, -1) : `${u}/`)
  const items = pages
    .filter((p) => p.title || p.description || p.text)
    .map((p) => {
      const m = metricFor(p.url)
      return {
        title: p.title || new URL(p.url).pathname.replace(/\//g, ' ').trim() || 'Page',
        primaryText: p.description || p.text,
        description: p.description || undefined,
        url: p.url,
        channel: 'website',
        ...(m && (m.impressions || m.clicks) ? { metrics: { impressions: m.impressions, clicks: m.clicks } } : {}),
      }
    })

  return { items }
}
