/**
 * /api/actuals?brand=<name> → BrandActuals JSON. Two real sources, tried in order:
 *   1. GA4-direct (free, service account) — see ga4Actuals.ts. Preferred when configured.
 *   2. Supermetrics API (static API key, paid tier) — the multi-source fallback below.
 * This is the real seam behind VITE_ACTUALS_URL — the app calibrates reach + fills Insights from
 * what this returns. Server-side only (keys stay private). Returns null → 204 when neither is set.
 *
 * Config via env:
 *   - SUPERMETRICS_API_KEY  — the API key generated on the Supermetrics Hub.
 *   - SUPERMETRICS_BASE     — default https://api.supermetrics.com
 *   - SUPERMETRICS_SINCE_DAYS — window, default 90
 *   - SUPERMETRICS_QUERIES  — JSON map of brand → the channel queries to run, e.g.:
 *       {
 *         "world within": [
 *           { "channel": "website", "label": "Website (GA4)", "reachUnit": "sessions",
 *             "ds_id": "GA4", "ds_accounts": "properties/123456",
 *             "metrics": { "reach": "sessions", "conversions": "conversions", "revenue": "totalRevenue", "engagement": "engagedSessions" } },
 *           { "channel": "linkedin", "label": "LinkedIn", "reachUnit": "impressions",
 *             "ds_id": "LICP", "ds_accounts": "urn:li:organization:999",
 *             "metrics": { "reach": "impressions", "clicks": "clicks", "engagement": "engagement" } }
 *         ]
 *       }
 *   Each entry's `metrics` maps a BrandActuals field → the Supermetrics field name for that source.
 * Returns null (→ 204) when unconfigured / no data, so the client stays on the mock honestly.
 */

import { runGoogleActuals } from './ga4Actuals.js'
import { runResendActuals } from './resendActuals.js'
import { resolveGoogle } from './googleResolve.js'

const BASE = process.env.SUPERMETRICS_BASE || 'https://api.supermetrics.com'
const SINCE_DAYS = Number(process.env.SUPERMETRICS_SINCE_DAYS) || 90

type MetricKey = 'reach' | 'engagement' | 'clicks' | 'conversions' | 'revenue'
interface ChannelQuery {
  channel: string
  label: string
  reachUnit: string
  ds_id: string
  ds_accounts: string
  metrics: Partial<Record<MetricKey, string>>
  /** Optional extra Supermetrics filter string. */
  filter?: string
}
interface ChannelActual {
  channel: string
  label: string
  reachUnit: string
  reach: number
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

function queriesFor(brand: string): ChannelQuery[] {
  try {
    const map = JSON.parse(process.env.SUPERMETRICS_QUERIES || '{}') as Record<string, ChannelQuery[]>
    return map[brand.trim().toLowerCase()] ?? []
  } catch {
    return []
  }
}

const since = (): string => {
  const d = new Date()
  d.setDate(d.getDate() - SINCE_DAYS)
  return d.toISOString().slice(0, 10)
}
const n = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0)

/** Run one channel's Supermetrics query and roll it into a ChannelActual. Null if it errors / empty. */
async function runChannel(q: ChannelQuery, from: string): Promise<ChannelActual | null> {
  const fields = [...new Set(Object.values(q.metrics))].filter(Boolean) as string[]
  if (!fields.length) return null
  try {
    const res = await fetch(`${BASE}/enterprise/v2/query/data/json`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${process.env.SUPERMETRICS_API_KEY}`,
      },
      body: JSON.stringify({
        ds_id: q.ds_id,
        ds_accounts: q.ds_accounts,
        start_date: from,
        end_date: 'today',
        fields: fields.join(','),
        ...(q.filter ? { filter: q.filter } : {}),
        max_rows: 100000,
        settings: { no_headers: true },
      }),
    })
    if (!res.ok) throw new Error(`supermetrics ${res.status}`)
    const json = (await res.json()) as { data?: unknown[][] }
    const rows = Array.isArray(json.data) ? json.data : []
    if (!rows.length) return null
    // Sum each field's column across the returned rows (fields order === column order).
    const idx = (field: string) => fields.indexOf(field)
    const sum = (field?: string): number => (field && idx(field) >= 0 ? rows.reduce((s, r) => s + n(r[idx(field)]), 0) : 0)
    const out: ChannelActual = { channel: q.channel, label: q.label, reachUnit: q.reachUnit, reach: sum(q.metrics.reach) }
    if (q.metrics.engagement) out.engagement = sum(q.metrics.engagement)
    if (q.metrics.clicks) out.clicks = sum(q.metrics.clicks)
    if (q.metrics.conversions) out.conversions = sum(q.metrics.conversions)
    if (q.metrics.revenue) out.revenue = sum(q.metrics.revenue)
    return out.reach > 0 ? out : null
  } catch {
    return null
  }
}

/** Fetch a brand's real channel actuals. When a workspace id is given, reads that workspace's STORED
 *  Google/Resend connection (per-brand auto-matched); otherwise the single-tenant env maps. Merges
 *  Google (GA4/GSC/YouTube) + Resend (email); Supermetrics is the last-resort fallback. */
export async function runActuals(
  brand: string,
  ctx?: { workspaceId?: string; website?: string },
): Promise<BrandActuals | null> {
  const override = ctx?.workspaceId ? await resolveGoogle(ctx.workspaceId, brand, ctx.website).catch(() => null) : null
  const [google, resend] = await Promise.all([
    runGoogleActuals(brand, override ?? undefined).catch(() => null),
    runResendActuals(brand, ctx?.workspaceId).catch(() => null),
  ])
  const collected = [google, resend].filter((r): r is BrandActuals => !!r)
  if (collected.length) {
    return {
      updatedAt: Date.now(),
      source: collected.length === 1 ? collected[0].source : 'Multi',
      sources: [...new Set(collected.flatMap((r) => r.sources ?? [r.source]))],
      channels: collected.flatMap((r) => r.channels),
    }
  }
  if (!process.env.SUPERMETRICS_API_KEY) return null
  const queries = queriesFor(brand)
  if (!queries.length) return null
  const from = since()
  const channels = (await Promise.all(queries.map((q) => runChannel(q, from)))).filter((c): c is ChannelActual => !!c)
  if (!channels.length) return null
  return {
    updatedAt: Date.now(),
    source: 'Supermetrics',
    sources: [...new Set(queries.map((q) => q.ds_id))],
    channels,
  }
}
