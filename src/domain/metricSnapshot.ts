import type { BrandActuals } from './actuals'
import type { TrafficRow } from './types'

/**
 * A single measured data point, append-only. The app's durable time-series: every metrics sync
 * APPENDS snapshots here instead of overwriting, so we keep history (trends) not just the latest
 * value. `campaign` + `audience` are denormalized onto asset snapshots so "which journey worked for
 * which persona over time" is a direct query. Persisted to Supabase `metric_snapshots` when a backend
 * is configured, else a capped localStorage ring.
 */
export interface MetricSnapshot {
  brand: string
  /** What the point measures against. */
  scope: 'brand' | 'channel' | 'campaign' | 'asset'
  /** Channel id / campaign name / asset id / brand — the thing the value belongs to. */
  scopeId: string
  /** Denormalized for per-persona journey queries (asset snapshots). */
  campaign?: string
  audience?: string
  /** reach | engagement | clicks | conversions | revenue | subscribers | … */
  metric: string
  value: number
  unit?: string
  /** Where it came from — ga4, linkedin, summer, mock… */
  source?: string
  /** ISO timestamp the point was captured. */
  capturedAt: string
}

const push = (out: MetricSnapshot[], base: Omit<MetricSnapshot, 'metric' | 'value'>, metric: string, value: unknown) => {
  if (typeof value === 'number' && value !== 0) out.push({ ...base, metric, value })
}

/** Channel-level snapshots from a brand's aggregated actuals (one set per pull). */
export function snapshotsFromActuals(brand: string, data: BrandActuals, capturedAt: string): MetricSnapshot[] {
  const out: MetricSnapshot[] = []
  const source = data.source
  for (const c of data.channels) {
    const base = { brand, scope: 'channel' as const, scopeId: String(c.channel), source, capturedAt }
    push(out, { ...base }, 'reach', c.reach)
    push(out, base, 'engagement', c.engagement)
    push(out, base, 'clicks', c.clicks)
    push(out, base, 'conversions', c.conversions)
    push(out, base, 'revenue', c.revenue)
  }
  return out
}

/** Asset-level snapshots from posted rows that carry measured metrics — the per-persona signal. */
export function snapshotsFromAssets(brand: string, rows: TrafficRow[], capturedAt: string, source = 'reconcile'): MetricSnapshot[] {
  const out: MetricSnapshot[] = []
  for (const r of rows) {
    const m = r.socialMetrics
    if (!m) continue
    const base = {
      brand,
      scope: 'asset' as const,
      scopeId: r.id,
      campaign: (r.campaign ?? '').trim() || undefined,
      audience: (r.audience ?? '').trim() || undefined,
      source,
      capturedAt,
    }
    for (const [k, v] of Object.entries(m)) push(out, base, k, v)
  }
  return out
}
