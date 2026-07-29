import { accessToken } from './ga4Actuals.js'
import { resolveGoogle } from './googleResolve.js'
import type { PullWindow } from '../src/domain/aggregator.js'

/**
 * The same named questions as the warehouse route, asked straight at Google.
 *
 * WHY THIS EXISTS SEPARATELY. A warehouse gives you SQL over a modelled table; a platform API gives
 * you one report endpoint with its own dimension vocabulary and its own idea of a row. The questions
 * are deliberately identical either way ("Top search queries" means the same thing), so this file is
 * the translation from that shared vocabulary into three quite different request shapes.
 *
 * WHAT IT REUSES RATHER THAN REBUILDS. Token minting is ga4Actuals' `accessToken` (OAuth refresh
 * token, falling back to a service-account JWT) and per-workspace resolution is googleResolve, both
 * of which already run against these APIs for the brand metrics panel. The request and response
 * shapes below are taken from that same working code, not from memory: GA4 answers with
 * `rows[].dimensionValues[]/metricValues[]`, Search Console with `rows[].keys[]` plus flat metrics,
 * and YouTube with `columnHeaders[]` and positional `rows[][]`. Three different shapes, one grid out.
 *
 * WHAT IT CANNOT DO. Nothing here is verified against a live Google account: no Google credentials
 * exist in this environment. Everything up to the socket is covered by tests that replay these
 * shapes; the socket is not.
 */

export interface ChannelGrid {
  columns: string[]
  rows: string[][]
  truncated: boolean
}

/** Which Google service answers each question, and so which id has to resolve for it to be offered. */
export const GOOGLE_PULL_SERVICE: Record<string, 'ga4' | 'gsc' | 'yt'> = {
  'gsc-queries': 'gsc',
  'gsc-pages': 'gsc',
  'ga4-channels': 'ga4',
  'ga4-pages': 'ga4',
  'yt-videos': 'yt',
}

const MAX_ROWS = 500
const num = (v: unknown): number => Number(v) || 0
const isoDaysAgo = (days: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return d.toISOString().slice(0, 10)
}
/** One decimal, without trailing ".0" on whole numbers. */
const dec = (n: number): string => (Number.isInteger(n) ? String(n) : n.toFixed(1))

/**
 * The ids a brand's Google pulls run against.
 *
 * Tried in the order the actuals panel already uses: the workspace's stored connection first (what a
 * user connected in the app), then the single-tenant env maps. `website` lets Search Console pick the
 * right property when an account holds several.
 */
export async function googleTargets(
  brand: string,
  opts?: { workspaceId?: string; website?: string },
): Promise<{ token?: string; ga4?: string; gsc?: string; yt?: string }> {
  // The stored connection carries its OWN token alongside the ids it resolved, and the two must stay
  // together: a workspace's property id queried with the single-tenant env token is a 403 at best and
  // somebody else's numbers at worst.
  if (opts?.workspaceId) {
    const resolved = await resolveGoogle(opts.workspaceId, brand, opts.website)
    if (resolved) return { token: resolved.token, ga4: resolved.ga4, gsc: resolved.gsc, yt: resolved.yt }
  }
  const map = (envName: string): string | undefined => {
    try {
      const m = JSON.parse(process.env[envName] || '{}') as Record<string, string>
      return m[brand.trim().toLowerCase()] || undefined
    } catch {
      return undefined
    }
  }
  const token = (await accessToken()) ?? undefined
  return { token, ga4: map('GA4_PROPERTY_MAP'), gsc: map('GSC_SITE_MAP'), yt: map('YT_CHANNEL_MAP') }
}

/** Search Console: one query, dimensioned by query or by page. */
async function gscPull(site: string, token: string, dimension: 'query' | 'page', days: PullWindow): Promise<ChannelGrid> {
  const res = await fetch(
    `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: isoDaysAgo(days),
        endDate: isoDaysAgo(0),
        dimensions: [dimension],
        rowLimit: MAX_ROWS,
      }),
    },
  )
  if (!res.ok) throw new Error(`search console ${res.status}`)
  const j = (await res.json()) as {
    rows?: { keys?: string[]; clicks?: number; impressions?: number; ctr?: number; position?: number }[]
  }
  const rows = (j.rows ?? []).map((r) => [
    r.keys?.[0] ?? '',
    String(Math.round(num(r.clicks))),
    String(Math.round(num(r.impressions))),
    // The API returns CTR as a fraction; every Search Console screen shows a percentage.
    dec(Math.round(num(r.ctr) * 1000) / 10),
    dec(Math.round(num(r.position) * 10) / 10),
  ])
  return {
    columns: [dimension === 'query' ? 'Query' : 'Page', 'Clicks', 'Impressions', 'CTR %', 'Avg position'],
    rows,
    truncated: rows.length >= MAX_ROWS,
  }
}

/** GA4: one runReport, with the dimension and metrics the question needs. */
async function ga4Pull(
  propertyRaw: string,
  token: string,
  spec: { dimension: string; metrics: string[]; columns: string[] },
  days: PullWindow,
): Promise<ChannelGrid> {
  const property = propertyRaw.replace(/^properties\//, '')
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [{ name: spec.dimension }],
      metrics: spec.metrics.map((name) => ({ name })),
      limit: MAX_ROWS,
    }),
  })
  if (!res.ok) throw new Error(`ga4 ${res.status}`)
  const j = (await res.json()) as {
    rows?: { dimensionValues?: { value?: string }[]; metricValues?: { value?: string }[] }[]
  }
  const rows = (j.rows ?? []).map((r) => [
    r.dimensionValues?.[0]?.value ?? '',
    ...spec.metrics.map((_, i) => {
      const v = num(r.metricValues?.[i]?.value)
      return Number.isInteger(v) ? String(v) : dec(Math.round(v * 10) / 10)
    }),
  ])
  return { columns: spec.columns, rows, truncated: rows.length >= MAX_ROWS }
}

/** YouTube Analytics: positional rows against columnHeaders, so order is read rather than assumed. */
async function ytPull(channelId: string, token: string, days: PullWindow): Promise<ChannelGrid> {
  const res = await fetch(
    `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${encodeURIComponent(channelId)}` +
      `&startDate=${isoDaysAgo(days)}&endDate=${isoDaysAgo(0)}` +
      `&dimensions=video&metrics=views,estimatedMinutesWatched,averageViewDuration,subscribersGained` +
      `&sort=-views&maxResults=${MAX_ROWS}`,
    { headers: { authorization: `Bearer ${token}` } },
  )
  if (!res.ok) throw new Error(`youtube ${res.status}`)
  const j = (await res.json()) as { columnHeaders?: { name?: string }[]; rows?: (string | number)[][] }
  const cols = (j.columnHeaders ?? []).map((h) => h.name ?? '')
  const at = (row: (string | number)[], name: string): string => {
    const i = cols.indexOf(name)
    return i >= 0 ? String(row[i] ?? '') : ''
  }
  // The API returns video IDs, not titles: a grid of opaque ids is not a data set anyone can read,
  // so the id is kept as its own column and labelled as such rather than dressed up as a name.
  const rows = (j.rows ?? []).map((r) => [
    at(r, 'video'),
    String(Math.round(num(at(r, 'views')))),
    String(Math.round(num(at(r, 'estimatedMinutesWatched')))),
    dec(Math.round(num(at(r, 'averageViewDuration')) * 10) / 10),
    String(Math.round(num(at(r, 'subscribersGained')))),
  ])
  return {
    columns: ['Video ID', 'Views', 'Watch time (min)', 'Avg view (sec)', 'Subs gained'],
    rows,
    truncated: rows.length >= MAX_ROWS,
  }
}

const GA4_SPECS: Record<string, { dimension: string; metrics: string[]; columns: string[] }> = {
  'ga4-channels': {
    dimension: 'sessionDefaultChannelGroup',
    metrics: ['sessions', 'totalUsers', 'engagedSessions', 'conversions'],
    columns: ['Channel', 'Sessions', 'Users', 'Engaged sessions', 'Conversions'],
  },
  'ga4-pages': {
    dimension: 'pagePath',
    metrics: ['screenPageViews', 'totalUsers', 'userEngagementDuration'],
    columns: ['Page', 'Views', 'Users', 'Engagement (sec)'],
  },
}

/** Run one named question directly against Google. Throws NOT_CONNECTED when nothing resolves. */
export async function runGooglePull(
  pullId: string,
  brand: string,
  days: PullWindow,
  opts?: { workspaceId?: string; website?: string },
): Promise<ChannelGrid> {
  const service = GOOGLE_PULL_SERVICE[pullId]
  if (!service) throw new Error('UNKNOWN_PULL')

  const targets = await googleTargets(brand, opts)
  const token = targets.token
  if (!token) throw Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' })

  const target = targets[service]
  if (!target) throw new Error('NOT_CONNECTED')

  if (service === 'gsc') return gscPull(target, token, pullId === 'gsc-queries' ? 'query' : 'page', days)
  if (service === 'yt') return ytPull(target, token, days)
  const spec = GA4_SPECS[pullId]
  if (!spec) throw new Error('UNKNOWN_PULL')
  return ga4Pull(target, token, spec, days)
}

/** Which questions this brand's Google connection can actually answer, as service ids. */
export async function googleServices(brand: string, opts?: { workspaceId?: string; website?: string }): Promise<string[]> {
  const t = await googleTargets(brand, opts)
  const out: string[] = []
  if (t.gsc) out.push('google_search_console')
  if (t.ga4) out.push('google_analytics_4')
  if (t.yt) out.push('youtube_analytics')
  return out
}

/** True when any Google token path is configured. Not a promise that a brand resolves to anything. */
export function googleConfigured(): boolean {
  return !!(
    (process.env.GA4_REFRESH_TOKEN && process.env.GA4_OAUTH_CLIENT_ID && process.env.GA4_OAUTH_CLIENT_SECRET) ||
    (process.env.GA4_CLIENT_EMAIL && process.env.GA4_PRIVATE_KEY) ||
    (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.GOOGLE_OAUTH_CLIENT_ID && process.env.GOOGLE_OAUTH_CLIENT_SECRET)
  )
}
