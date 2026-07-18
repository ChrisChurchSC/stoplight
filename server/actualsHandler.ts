/**
 * /api/actuals?brand=<name> → BrandActuals JSON, pulled from Summer's Forward API (the managed
 * lakehouse marts: GA4, Search Console, LinkedIn Pages, YouTube). This is the real seam behind
 * VITE_ACTUALS_URL — the app calibrates reach + fills Insights from what this returns.
 *
 * Server-side only (the Summer token stays private). Config via env:
 *   - SUMMER_API_TOKEN   — bearer token for fwd.summer.io
 *   - SUMMER_API_BASE    — default https://fwd.summer.io/api/v1
 *   - SUMMER_PROJECT_MAP — JSON { "<brand lower>": { "project": "prj_…", "db": "dbc_…" } }
 * Returns null (→ 204) when unconfigured or the brand has no mapped project, so the client falls
 * back to the mock provider honestly.
 */

const BASE = process.env.SUMMER_API_BASE || 'https://fwd.summer.io/api/v1'
const SINCE_DAYS = 90

interface ChannelActual {
  channel: string
  label: string
  reachUnit: string
  reach: number
  assets?: number
  reachPerAsset?: number
  engagement?: number
  clicks?: number
  conversions?: number
  revenue?: number
}
interface BrandActuals {
  updatedAt: number
  source: string
  sources?: string[]
  channels: ChannelActual[]
}

function projectFor(brand: string): { project: string; db: string } | null {
  try {
    const map = JSON.parse(process.env.SUMMER_PROJECT_MAP || '{}') as Record<string, { project: string; db: string }>
    const hit = map[brand.trim().toLowerCase()]
    return hit?.project && hit?.db ? hit : null
  } catch {
    return null
  }
}

async function runQuery(project: string, db: string, sql: string): Promise<Record<string, number | string>[]> {
  const res = await fetch(`${BASE}/projects/${project}/db-connections/${db}/query`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${process.env.SUMMER_API_TOKEN}`,
    },
    body: JSON.stringify({ sql, inline_json: true, max_inline_rows: 200 }),
  })
  if (!res.ok) throw new Error(`summer query ${res.status}`)
  const data = (await res.json()) as { inline_results?: { rows?: Record<string, number | string>[] } }
  return data.inline_results?.rows ?? []
}

const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)
const since = () => {
  const d = new Date()
  d.setDate(d.getDate() - SINCE_DAYS)
  return d.toISOString().slice(0, 10)
}

/** Each mart → a ChannelActual. Any that errors (schema absent for this brand) is skipped. */
async function ga4(p: string, db: string, from: string): Promise<ChannelActual | null> {
  try {
    const rows = await runQuery(p, db, `SELECT SUM(sessions) sessions, SUM(engaged_sessions) engaged, SUM(conversions) conversions, SUM(total_revenue) revenue FROM marts.google_analytics_4_2.traffic_acquisition_session_default_channel_grouping_report WHERE date_day >= CAST('${from}' AS DATE)`)
    const r = rows[0]
    if (!r) return null
    return { channel: 'website', label: 'Website (GA4)', reachUnit: 'sessions', reach: n(r.sessions), engagement: n(r.engaged), conversions: n(r.conversions), revenue: n(r.revenue) }
  } catch {
    return null
  }
}
async function gsc(p: string, db: string, from: string): Promise<ChannelActual | null> {
  try {
    const rows = await runQuery(p, db, `SELECT SUM(impressions) impressions, SUM(clicks) clicks FROM marts.google_search_console_2.site_report_by_site WHERE date_day >= CAST('${from}' AS DATE)`)
    const r = rows[0]
    if (!r) return null
    return { channel: 'search', label: 'Search (GSC)', reachUnit: 'impressions', reach: n(r.impressions), clicks: n(r.clicks) }
  } catch {
    return null
  }
}
async function linkedin(p: string, db: string, from: string): Promise<ChannelActual | null> {
  try {
    const rows = await runQuery(p, db, `SELECT SUM(impressions) impressions, SUM(clicks) clicks, SUM(likes) likes, SUM(comments) comments, SUM(shares) shares, COUNT(DISTINCT date_day) days FROM marts.linkedin_company_pages_2.page_report WHERE date_day >= CAST('${from}' AS DATE)`)
    const r = rows[0]
    if (!r) return null
    return { channel: 'linkedin', label: 'LinkedIn', reachUnit: 'impressions', reach: n(r.impressions), clicks: n(r.clicks), engagement: n(r.likes) + n(r.comments) + n(r.shares) }
  } catch {
    return null
  }
}
async function youtube(p: string, db: string, from: string): Promise<ChannelActual | null> {
  try {
    const rows = await runQuery(p, db, `SELECT SUM(views) views, SUM(likes) likes, SUM(comments) comments, SUM(shares) shares, SUM(subscribers_gained) subs, COUNT(DISTINCT video_id) videos FROM marts.youtube_analytics_2.channel_report WHERE date_day >= CAST('${from}' AS DATE)`)
    const r = rows[0]
    if (!r) return null
    const videos = n(r.videos)
    return { channel: 'youtube', label: 'YouTube', reachUnit: 'views', reach: n(r.views), assets: videos || undefined, reachPerAsset: videos ? Math.round(n(r.views) / videos) : undefined, engagement: n(r.likes) + n(r.comments) + n(r.shares) }
  } catch {
    return null
  }
}

/** Fetch a brand's real channel actuals from Summer. Returns null when unconfigured / unmapped. */
export async function runActuals(brand: string): Promise<BrandActuals | null> {
  if (!process.env.SUMMER_API_TOKEN) return null
  const cfg = projectFor(brand)
  if (!cfg) return null
  const from = since()
  const channels = (await Promise.all([
    ga4(cfg.project, cfg.db, from),
    gsc(cfg.project, cfg.db, from),
    linkedin(cfg.project, cfg.db, from),
    youtube(cfg.project, cfg.db, from),
  ])).filter((c): c is ChannelActual => !!c && c.reach > 0)
  if (!channels.length) return null
  return {
    updatedAt: Date.now(),
    source: 'Summer · Forward API',
    sources: ['google_analytics_4', 'google_search_console', 'linkedin_company_pages', 'youtube_analytics'],
    channels,
  }
}
