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
 * exist in this environment. The coverage probe is covered by tests that replay these shapes
 * (channelCoverage.test.ts); the three pull builders and the socket are not.
 */

export interface ChannelGrid {
  columns: string[]
  rows: string[][]
  truncated: boolean
  /**
   * WHAT THE ROWS ACTUALLY COVER, as opposed to when we asked for them.
   *
   * Absent when the probe could not answer. That is a real state and it is said out loud rather
   * than filled in with the window we requested.
   */
  coverage?: { from: string; to: string }
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

/**
 * WHAT THE ROWS COVER, asked of the same API that returned them.
 *
 * WHY A SECOND REQUEST. The named pulls are dimensioned by page, query or video and drop the date
 * entirely, so the grid cannot answer this, and adding date as a second dimension would multiply
 * every row by the window and blow the row cap on the first day. The window we asked for is not a
 * substitute either: Search Console lags two to three days behind, GA4's "today" is a partial day,
 * and neither says so in the response to a dimensioned report. Until this existed, every table
 * pulled straight from Google had no coverage at all, so it could not say what it spanned and its
 * staleness counted from the moment of the REQUEST rather than from the end of the data.
 *
 * ONE REQUEST PER PULL, dimensioned by date and nothing else, so it comes back at most one row per
 * day of the window. Best effort by construction: every caller runs it inside a try and keeps the
 * table when it fails, because a pull that lands its rows and cannot date them is far better than
 * one that throws.
 */
export async function googleCoverage(
  service: 'ga4' | 'gsc' | 'yt',
  target: string,
  token: string,
  days: PullWindow,
): Promise<{ from: string; to: string } | undefined> {
  const auth = { authorization: `Bearer ${token}` }
  let dates: string[] = []

  if (service === 'gsc') {
    const res = await fetch(
      `https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(target)}/searchAnalytics/query`,
      {
        method: 'POST',
        headers: { ...auth, 'content-type': 'application/json' },
        body: JSON.stringify({
          startDate: isoDaysAgo(days),
          endDate: isoDaysAgo(0),
          dimensions: ['date'],
          rowLimit: MAX_ROWS,
        }),
      },
    )
    if (!res.ok) throw new Error(`search console coverage ${res.status}`)
    const j = (await res.json()) as { rows?: { keys?: string[] }[] }
    dates = (j.rows ?? []).map((r) => r.keys?.[0] ?? '')
  } else if (service === 'ga4') {
    const property = target.replace(/^properties\//, '')
    const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({
        dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
        dimensions: [{ name: 'date' }],
        // A report needs a metric even when the metric is not what is being asked for. Sessions is
        // present on every property; which one it is does not matter, only which days come back.
        metrics: [{ name: 'sessions' }],
        limit: MAX_ROWS,
      }),
    })
    if (!res.ok) throw new Error(`ga4 coverage ${res.status}`)
    const j = (await res.json()) as { rows?: { dimensionValues?: { value?: string }[] }[] }
    // GA4's date dimension is YYYYMMDD with no separators, unlike every other date in this file.
    dates = (j.rows ?? []).map((r) => {
      const v = r.dimensionValues?.[0]?.value ?? ''
      return /^\d{8}$/.test(v) ? `${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}` : v
    })
  } else {
    const res = await fetch(
      `https://youtubeanalytics.googleapis.com/v2/reports?ids=channel==${encodeURIComponent(target)}` +
        `&startDate=${isoDaysAgo(days)}&endDate=${isoDaysAgo(0)}&dimensions=day&metrics=views&sort=day&maxResults=${MAX_ROWS}`,
      { headers: auth },
    )
    if (!res.ok) throw new Error(`youtube coverage ${res.status}`)
    const j = (await res.json()) as { columnHeaders?: { name?: string }[]; rows?: (string | number)[][] }
    const i = (j.columnHeaders ?? []).findIndex((h) => h.name === 'day')
    dates = i >= 0 ? (j.rows ?? []).map((r) => String(r[i] ?? '')) : []
  }

  /**
   * VALIDATED, NOT TRUSTED BY POSITION. The warehouse route learned this the hard way: reading a
   * probe's cells blind turned an unexpected response into coverage {from: 'world with', to: '443'},
   * which would then have been rendered as a date and used to decide staleness. A made up date
   * presented as fact is the exact failure coverage exists to prevent, so every value has to parse
   * as a real date or there is no coverage at all.
   */
  const dated = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
  // ISO dates sort correctly as strings, which is the whole reason this format is worth insisting on.
  const valid = dates.filter(dated).sort()
  if (!valid.length) return undefined
  return { from: valid[0], to: valid[valid.length - 1] }
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

  let grid: ChannelGrid
  if (service === 'gsc') grid = await gscPull(target, token, pullId === 'gsc-queries' ? 'query' : 'page', days)
  else if (service === 'yt') grid = await ytPull(target, token, days)
  else {
    const spec = GA4_SPECS[pullId]
    if (!spec) throw new Error('UNKNOWN_PULL')
    grid = await ga4Pull(target, token, spec, days)
  }

  /**
   * Best effort, and deliberately after the rows have landed. A table nobody can date is worth
   * having; a probe that throws must never cost the user the pull it was describing.
   */
  try {
    const coverage = await googleCoverage(service, target, token, days)
    if (coverage) grid = { ...grid, coverage }
  } catch {
    // Leave it absent. An unknown span is a real state and a better answer than a guess.
  }
  return grid
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
