import type { MetricSnapshot } from './metricSnapshot'

/**
 * ONE ASSET'S NUMBERS OVER TIME, out of the append-only snapshot store.
 *
 * Every reading ever taken is kept rather than overwritten (see setLiveMetrics), which is the whole
 * reason the panel can show a shape instead of a figure. A single number tells you a post got 41,000
 * impressions; the shape tells you whether that happened in the first day or is still climbing three
 * weeks later, and those are different posts to have made.
 *
 * Pure, and separate from the reader, because the interesting parts are the two judgements below and
 * neither is visible from a query: which readings are the same reading, and what counts as a change.
 *
 * See docs/live-asset-mode-plan.md.
 */

export interface TrendPoint {
  /** ms epoch, so the caller can space points by real time rather than by index. */
  at: number
  value: number
}

export interface MetricTrend {
  metric: string
  /** Oldest first. Always at least one point, or the metric is not in the list at all. */
  points: TrendPoint[]
  latest: number
  first: number
  /**
   * The change since the PREVIOUS reading, not since the first.
   *
   * Undefined when there is only one point, deliberately: a first reading has nothing to be a change
   * from, and rendering "+41,000" beside it would state a rise that was really an arrival.
   */
  delta?: number
}

/**
 * @param assetId the row id. Snapshots are keyed by scopeId at `scope: 'asset'`, which the store has
 *   carried since long before anything wrote one.
 */
export function assetTrend(snapshots: readonly MetricSnapshot[], assetId: string): MetricTrend[] {
  const byMetric = new Map<string, Map<number, number>>()
  for (const s of snapshots) {
    if (s.scope !== 'asset' || s.scopeId !== assetId) continue
    if (typeof s.value !== 'number' || !Number.isFinite(s.value)) continue
    const at = Date.parse(s.capturedAt)
    if (!Number.isFinite(at)) continue
    /**
     * KEYED BY TIMESTAMP, so two readings of one moment are one point.
     *
     * setLiveMetrics writes every metric of a submission at one `at`, and correcting a typo writes
     * the whole set again. Without this the correction is a second point at the same instant: a
     * vertical line on the chart and a delta between a number and the number that replaced it.
     * Last wins, which is the correction.
     */
    const m = byMetric.get(s.metric) ?? new Map<number, number>()
    m.set(at, s.value)
    byMetric.set(s.metric, m)
  }

  const out: MetricTrend[] = []
  for (const [metric, points] of byMetric) {
    const sorted = [...points.entries()].sort((a, b) => a[0] - b[0]).map(([at, value]) => ({ at, value }))
    if (!sorted.length) continue
    const latest = sorted[sorted.length - 1].value
    out.push({
      metric,
      points: sorted,
      latest,
      first: sorted[0].value,
      delta: sorted.length > 1 ? latest - sorted[sorted.length - 2].value : undefined,
    })
  }
  // Alphabetical, so the panel's order does not change under the reader as new metrics arrive.
  return out.sort((a, b) => a.metric.localeCompare(b.metric))
}

/**
 * The points as an SVG polyline in a unit box, oldest to newest.
 *
 * X IS TIME, NOT INDEX. Readings are taken whenever somebody types them in, so three points across a
 * month and three across an afternoon are different shapes, and spacing them evenly would draw them
 * identically. A set of readings that all share one timestamp falls back to even spacing rather than
 * dividing by zero.
 *
 * Y IS ANCHORED TO ZERO unless the values go below it. A sparkline scaled to its own min exaggerates
 * a rounding wobble into a cliff, which is the most common way a small chart lies. A flat series
 * therefore draws flat, and it draws mid-box rather than on the floor, where it would read as an
 * axis rather than as data.
 */
export function sparkPath(points: readonly TrendPoint[], w: number, h: number): string {
  if (!points.length) return ''
  const xs = points.map((p) => p.at)
  const t0 = Math.min(...xs)
  const span = Math.max(...xs) - t0
  const values = points.map((p) => p.value)
  const top = Math.max(...values, 0)
  const floor = Math.min(...values, 0)
  const range = top - floor
  const x = (i: number) => (points.length === 1 ? w / 2 : span > 0 ? ((points[i].at - t0) / span) * w : (i / (points.length - 1)) * w)
  const y = (v: number) => (range > 0 ? h - ((v - floor) / range) * h : h / 2)
  return points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(2)} ${y(p.value).toFixed(2)}`).join(' ')
}
