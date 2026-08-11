import {
  AGGREGATORS,
  isPullWindow,
  type AggregatorPullResult,
  type AggregatorSource,
  type AggregatorStatus,
  type PullWindow,
} from '../src/domain/aggregator.js'
import { googleConfigured, googleServices, runGooglePull } from './channelPull.js'

/**
 * Pull a real table out of an aggregator's warehouse.
 *
 * THREE OPERATIONS, one endpoint: `status` (what is connected), `sources` (what it holds), `pull`
 * (fetch one named question). They are one handler because they share the credential read, and the
 * credential is the entire difficulty: it lives here and must never be sent to the browser.
 *
 * WHY THE CLIENT CANNOT NAME THE CONNECTION. A pull takes a project id and a pull id, and the server
 * resolves the database connection itself. The obvious shape, where the client passes back the
 * `{project, connection}` pair it was given, would let anything that can reach this endpoint run our
 * SQL against a connection of its choosing. The extra `/user` round trip buys that off.
 *
 * WHY THE SQL LIVES HERE AND NOT IN THE CARD. Two reasons. Interpolating a user-supplied window into
 * SQL is only safe because `isPullWindow` narrows it to one of three integers before it gets near a
 * query. And a marketer asking "how did search do" should not be debugging a GROUP BY: the card
 * offers named questions, and the mapping from question to SQL is a server concern.
 *
 * Every statement below was run against a real Summer warehouse before it was written down, which is
 * why the table names survive contact: `site_report_by_page` has no `page` column, `page_report`
 * does, and `keyword_site_report_by_page` holds queries rather than pages. None of that is guessable.
 */

const SUMMER_BASE = (process.env.SUMMER_API_BASE || 'https://fwd.summer.io/api/v1').replace(/\/+$/, '')
/** Row ceiling per pull. A data set is for reading, and a canvas card previewing 10,000 rows helps nobody. */
const MAX_ROWS = 500

const noKey = (): Error => Object.assign(new Error('NO_KEY'), { code: 'NO_KEY' })

/** Summer's `/user`: orgs → projects → lakehouse (the managed connection and its mart schemas). */
interface SummerUser {
  orgs?: {
    name?: string | null
    projects?: {
      id?: string
      name?: string
      lakehouse?: {
        managed_ducklake_db_connection_id?: string
        mart_schemas?: { service?: string; schema_name?: string }[]
      } | null
    }[]
  }[]
}

async function summerGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${SUMMER_BASE}${path}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`summer ${res.status}`)
  return (await res.json()) as T
}

/** Every project with a managed lakehouse, flattened. Projects without one cannot be queried. */
async function summerSources(token: string): Promise<AggregatorSource[]> {
  const user = await summerGet<SummerUser>('/user', token)
  const out: AggregatorSource[] = []
  for (const org of user.orgs ?? []) {
    for (const p of org.projects ?? []) {
      const lake = p.lakehouse
      if (!p.id || !lake?.managed_ducklake_db_connection_id) continue
      const services = (lake.mart_schemas ?? []).map((m) => m.service ?? '').filter(Boolean)
      out.push({
        id: p.id,
        label: org.name ? `${p.name ?? p.id} · ${org.name}` : (p.name ?? p.id),
        services,
      })
    }
  }
  return out
}

/** Resolve a project id to its connection and mart schemas. Server-side by design (see the header). */
async function summerProject(
  token: string,
  projectId: string,
): Promise<{ connectionId: string; schemaFor: (service: string) => string | null }> {
  const user = await summerGet<SummerUser>('/user', token)
  for (const org of user.orgs ?? []) {
    for (const p of org.projects ?? []) {
      if (p.id !== projectId) continue
      const conn = p.lakehouse?.managed_ducklake_db_connection_id
      if (!conn) break
      const marts = p.lakehouse?.mart_schemas ?? []
      return {
        connectionId: conn,
        schemaFor: (service) => marts.find((m) => m.service === service)?.schema_name ?? null,
      }
    }
  }
  throw new Error('NO_PROJECT')
}

interface SummerQueryResponse {
  status?: string
  error?: string | null
  inline_error?: string | null
  inline_truncated?: boolean
  inline_results?: {
    columns?: { name?: string; type?: string }[]
    rows?: Record<string, unknown>[]
  } | null
}

/**
 * Run SQL and flatten to a grid.
 *
 * `inline_json` exists for callers that cannot fetch the presigned result URL, which is exactly a
 * serverless function with no object-store credentials. Without it the response is a link to a
 * parquet file we have no way to read.
 */
async function summerQuery(
  token: string,
  projectId: string,
  connectionId: string,
  sql: string,
): Promise<{ columns: string[]; rows: string[][]; truncated: boolean }> {
  const res = await fetch(`${SUMMER_BASE}/projects/${projectId}/db-connections/${connectionId}/query`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', accept: 'application/json' },
    body: JSON.stringify({ sql, inline_json: true, max_inline_rows: MAX_ROWS }),
  })
  if (!res.ok) throw new Error(`summer query ${res.status}`)
  const body = (await res.json()) as SummerQueryResponse
  if (body.status === 'error') throw new Error(body.error || 'query failed')
  const inline = body.inline_results
  // A null inline_results with a 200 means the server could not produce one and is pointing at the
  // presigned URL instead. We cannot read that here, so this is a failure rather than an empty table:
  // returning zero rows would read as "your warehouse has no data", which is a different claim.
  if (!inline) throw new Error(body.inline_error || 'no inline results')

  const columns = (inline.columns ?? []).map((c) => c.name ?? '').filter(Boolean)
  const rows = (inline.rows ?? []).map((r) =>
    columns.map((c) => {
      const v = r[c]
      if (v === null || v === undefined) return ''
      // Objects (DuckDB STRUCT/LIST) would otherwise stringify to "[object Object]" in a cell.
      return typeof v === 'object' ? JSON.stringify(v) : String(v)
    }),
  )
  return { columns, rows, truncated: !!body.inline_truncated }
}

/**
 * The named questions, as SQL.
 *
 * `days` is already narrowed to 30 | 90 | 365 by the caller, and `schema` comes from the warehouse's
 * own mart listing rather than from the request, so neither is attacker-controlled.
 */
function pullSql(pullId: string, schema: string, days: PullWindow): string | null {
  const since = `date_day >= current_date - INTERVAL ${days} DAY`
  switch (pullId) {
    case 'gsc-queries':
      // Position is impression-weighted: a flat avg() treats a day with one impression the same as a
      // day with a thousand, which is not what "average position" means anywhere else it is reported.
      return `SELECT query AS "Query",
       round(sum(clicks))::BIGINT AS "Clicks",
       round(sum(impressions))::BIGINT AS "Impressions",
       round(100.0*sum(clicks)/nullif(sum(impressions),0), 1) AS "CTR %",
       round(sum(position*impressions)/nullif(sum(impressions),0), 1) AS "Avg position"
FROM marts.${schema}.keyword_site_report_by_site
WHERE ${since} AND query IS NOT NULL
GROUP BY 1 ORDER BY "Clicks" DESC, "Impressions" DESC LIMIT ${MAX_ROWS}`
    case 'gsc-pages':
      return `SELECT page AS "Page",
       round(sum(clicks))::BIGINT AS "Clicks",
       round(sum(impressions))::BIGINT AS "Impressions",
       round(100.0*sum(clicks)/nullif(sum(impressions),0), 1) AS "CTR %",
       round(sum(position*impressions)/nullif(sum(impressions),0), 1) AS "Avg position"
FROM marts.${schema}.page_report
WHERE ${since} AND page IS NOT NULL
GROUP BY 1 ORDER BY "Clicks" DESC LIMIT ${MAX_ROWS}`
    case 'ga4-channels':
      return `SELECT session_default_channel_grouping AS "Channel",
       round(sum(sessions))::BIGINT AS "Sessions",
       round(sum(total_users))::BIGINT AS "Users",
       round(100.0*sum(engaged_sessions)/nullif(sum(sessions),0), 1) AS "Engaged %",
       round(sum(conversions))::BIGINT AS "Conversions"
FROM marts.${schema}.traffic_acquisition_session_default_channel_grouping_report
WHERE ${since}
GROUP BY 1 ORDER BY "Sessions" DESC LIMIT ${MAX_ROWS}`
    case 'ga4-pages':
      return `SELECT page_path AS "Page",
       round(sum(screen_page_views))::BIGINT AS "Views",
       round(sum(total_users))::BIGINT AS "Users",
       round(sum(user_engagement_duration)/nullif(sum(total_users),0), 1) AS "Engagement per user (sec)"
FROM marts.${schema}.pages_path_report
WHERE ${since} AND page_path IS NOT NULL
GROUP BY 1 ORDER BY "Views" DESC LIMIT ${MAX_ROWS}`
    case 'yt-videos':
      // Average view length is derived from the totals rather than averaged across days, for the same
      // reason as search position: a day with three views should not weigh as much as a day with 3,000.
      return `SELECT video_title AS "Video",
       round(sum(views))::BIGINT AS "Views",
       round(sum(watch_time_minutes))::BIGINT AS "Watch time (min)",
       round(sum(watch_time_minutes)*60/nullif(sum(views),0), 1) AS "Avg view (sec)",
       round(sum(subscribers_gained))::BIGINT AS "Subs gained"
FROM marts.${schema}.channel_report
WHERE ${since} AND video_title IS NOT NULL
GROUP BY 1 ORDER BY "Views" DESC LIMIT ${MAX_ROWS}`
    case 'li-posts':
      // post_report is per-post, not per-day: it carries created_at and no date_day, so the window
      // reads from the post's own date.
      return `SELECT strftime(created_at, '%Y-%m-%d') AS "Posted",
       left(replace(replace(commentary, chr(10), ' '), chr(13), ' '), 80) AS "Post",
       round(sum(impressions))::BIGINT AS "Impressions",
       round(sum(clicks))::BIGINT AS "Clicks",
       round(sum(likes+comments+shares))::BIGINT AS "Reactions",
       round(100.0*avg(engagement_rate), 2) AS "Engagement %"
FROM marts.${schema}.post_report
WHERE created_at >= current_date - INTERVAL ${days} DAY
GROUP BY 1,2 ORDER BY "Impressions" DESC LIMIT ${MAX_ROWS}`
    default:
      return null
  }
}

/**
 * WHAT THE ROWS ACTUALLY COVER.
 *
 * The named pulls group by dimension and drop the date, so the grid cannot answer this and the
 * request is not a substitute: Search Console lags a few days, and a mart whose connector broke in
 * May still returns rows and still gets stamped now. One cheap min/max per pull, against the same
 * table and the same window, so a data set can say what it spans rather than implying today.
 */
function coverageSql(pullId: string, schema: string, days: PullWindow): string | null {
  const table: Record<string, string> = {
    'gsc-queries': 'keyword_site_report_by_site',
    'gsc-pages': 'page_report',
    'ga4-channels': 'traffic_acquisition_session_default_channel_grouping_report',
    'ga4-pages': 'pages_path_report',
    'yt-videos': 'channel_report',
    'li-posts': 'post_report',
  }
  const t = table[pullId]
  if (!t) return null
  // post_report is per post and carries created_at rather than a date_day column.
  const col = pullId === 'li-posts' ? 'created_at' : 'date_day'
  return `SELECT min(${col})::VARCHAR AS "from", max(${col})::VARCHAR AS "to"
FROM marts.${schema}.${t}
WHERE ${col} >= current_date - INTERVAL ${days} DAY`
}

/** Which service a pull needs, kept beside the SQL so the two cannot drift apart. */
const PULL_SERVICE: Record<string, string> = {
  'gsc-queries': 'google_search_console',
  'gsc-pages': 'google_search_console',
  'ga4-channels': 'google_analytics_4',
  'ga4-pages': 'google_analytics_4',
  'yt-videos': 'youtube_analytics',
  'li-posts': 'linkedin_company_pages',
}

export async function runAggregator(body: unknown): Promise<unknown> {
  const { op, provider, source, pull, days, brand, workspace, website } = (body ?? {}) as {
    op?: unknown
    provider?: unknown
    source?: unknown
    pull?: unknown
    days?: unknown
    /** Channel pulls resolve their property/site/channel from the brand, the way actuals already do. */
    brand?: unknown
    workspace?: unknown
    website?: unknown
  }

  // STATUS is deliberately not an error when nothing is connected: "no key" is the answer, not a
  // failure, and the card needs it to say which providers are reachable.
  if (op === 'status') {
    const status: AggregatorStatus = {
      providers: AGGREGATORS.map((a) => ({
        id: a.id,
        implemented: a.implemented,
        // Google has three token paths (OAuth refresh, service account, per-workspace connection), so
        // "is the env var set" is the wrong question for it and it answers for itself.
        configured: a.implemented && (a.id === 'google' ? googleConfigured() : !!process.env[a.envVar]),
      })),
    }
    return status
  }

  /**
   * DIRECT CHANNELS. Same ops, same question ids, different transport: no SQL and no project, so a
   * "source" here is the brand whose property/site/channel the pull resolves to.
   */
  if (provider === 'google') {
    const brandName = typeof brand === 'string' ? brand : ''
    const ctx = { workspaceId: typeof workspace === 'string' ? workspace : undefined, website: typeof website === 'string' ? website : undefined }

    if (op === 'sources') {
      if (!brandName) throw new Error('BAD_REQUEST')
      const services = await googleServices(brandName, ctx)
      // One source, the connected account, described by what it can answer for THIS brand. An empty
      // services list is a real answer: connected, but nothing of this brand's resolves.
      return { sources: [{ id: brandName, label: `${brandName} · Google`, services }] }
    }

    if (op === 'pull') {
      const pullId = typeof pull === 'string' ? pull : ''
      const src = typeof source === 'string' ? source : brandName
      if (!pullId || !src) throw new Error('BAD_REQUEST')
      const window: PullWindow = isPullWindow(days) ? days : 90
      const grid = await runGooglePull(pullId, src, window, ctx)
      // coverage rides along with the rows. Building this result without it was how every table
      // pulled straight from Google ended up unable to say what it spanned, while the warehouse
      // route two branches down had answered that question since the day it shipped.
      const result: AggregatorPullResult = {
        columns: grid.columns,
        rows: grid.rows,
        truncated: grid.truncated,
        coverage: grid.coverage,
      }
      return result
    }

    throw new Error('BAD_REQUEST')
  }

  if (provider !== 'summer') throw new Error('UNKNOWN_PROVIDER')
  const token = process.env.SUMMER_API_TOKEN
  if (!token) throw noKey()

  if (op === 'sources') return { sources: await summerSources(token) }

  if (op === 'pull') {
    const projectId = typeof source === 'string' ? source : ''
    const pullId = typeof pull === 'string' ? pull : ''
    if (!projectId || !pullId) throw new Error('BAD_REQUEST')
    const window: PullWindow = isPullWindow(days) ? days : 90

    const service = PULL_SERVICE[pullId]
    if (!service) throw new Error('UNKNOWN_PULL')

    const { connectionId, schemaFor } = await summerProject(token, projectId)
    const schema = schemaFor(service)
    // The pull list is already filtered to the project's services, so this is a stale-selection
    // guard rather than the common path: say what is missing instead of failing on a SQL error.
    if (!schema) throw new Error('NOT_CONNECTED')

    const sql = pullSql(pullId, schema, window)
    if (!sql) throw new Error('UNKNOWN_PULL')

    // Naming is left to the caller: the card knows the pull's label and the source's label, and this
    // handler would only be reassembling strings it was handed.
    const { columns, rows, truncated } = await summerQuery(token, projectId, connectionId, sql)

    // Best effort: a warehouse that will not answer this leaves coverage absent, which the app says
    // out loud rather than filling in with the window we asked for.
    let coverage: { from: string; to: string } | undefined
    const covSql = coverageSql(pullId, schema, window)
    if (covSql) {
      try {
        const cov = await summerQuery(token, projectId, connectionId, covSql)
        /**
         * VALIDATED, NOT TRUSTED BY POSITION.
         *
         * Reading rows[0][0] and rows[0][1] blind turned an unexpected response into
         * coverage {from: 'world with', to: '443'}, which would then have been rendered as a date and
         * used to decide staleness. A made up date presented as fact is the exact failure this whole
         * field exists to prevent, so the columns must be the ones asked for and both values must
         * parse as real dates, or there is no coverage.
         */
        const iFrom = cov.columns.findIndex((c) => c.toLowerCase() === 'from')
        const iTo = cov.columns.findIndex((c) => c.toLowerCase() === 'to')
        const from = iFrom >= 0 ? (cov.rows[0]?.[iFrom] ?? '').slice(0, 10) : ''
        const to = iTo >= 0 ? (cov.rows[0]?.[iTo] ?? '').slice(0, 10) : ''
        const dated = (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))
        if (dated(from) && dated(to)) coverage = { from, to }
      } catch {
        // Leave it undefined. An unknown span is a real state and a better answer than a guess.
      }
    }

    const result: AggregatorPullResult = { columns, rows, truncated, coverage }
    return result
  }

  throw new Error('BAD_REQUEST')
}
