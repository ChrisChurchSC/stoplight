import { CHANNELS } from './channels'
import { formatOf } from './presence'
import { assetRtbIds, rtbById } from './rtb'
import type { TrafficRow } from './types'

/**
 * Performance binds to the things that produced it. Every live asset carries a
 * real metric (engagement: likes + comments pulled from the channel); each asset
 * also maps to proof points (RTBs), a channel, a format, and an audience. Roll
 * the metric up by each of those dimensions and you can see WHAT is working —
 * which proof points and formats actually earn attention — and feed it back into
 * the Foundation. (Swap engagement for revenue/leads and the rollup is identical;
 * only the per-asset metric changes.)
 */
export interface PerfRow {
  key: string
  label: string
  posts: number
  engagement: number
  /** Average engagement per post — fairer across dimensions of different size. */
  avg: number
}

export interface BrandPerformance {
  measured: number
  totalEngagement: number
  byRtb: PerfRow[]
  byFormat: PerfRow[]
  byChannel: PerfRow[]
  byAudience: PerfRow[]
}

const eng = (r: TrafficRow): number => (r.engagement ? r.engagement.likes + r.engagement.comments : 0)

/** Roll engagement up by whatever keys a row maps to (a row can carry several
 *  RTBs, so it counts toward each). */
function rollup(rows: TrafficRow[], keyer: (r: TrafficRow) => { key: string; label: string }[]): PerfRow[] {
  const m = new Map<string, { label: string; posts: number; engagement: number }>()
  for (const r of rows) {
    if (!r.engagement) continue
    const e = eng(r)
    for (const { key, label } of keyer(r)) {
      const cur = m.get(key) ?? { label, posts: 0, engagement: 0 }
      cur.posts += 1
      cur.engagement += e
      m.set(key, cur)
    }
  }
  return [...m.entries()]
    .map(([key, v]) => ({ key, label: v.label, posts: v.posts, engagement: v.engagement, avg: Math.round(v.engagement / v.posts) }))
    .sort((a, b) => b.avg - a.avg)
}

export function brandPerformance(rows: TrafficRow[]): BrandPerformance {
  const measured = rows.filter((r) => r.engagement).length
  return {
    measured,
    totalEngagement: rows.reduce((a, r) => a + eng(r), 0),
    byRtb: rollup(rows, (r) =>
      assetRtbIds(r).map((id) => ({ key: id, label: rtbById(r.campaign, id)?.label ?? id })),
    ),
    byFormat: rollup(rows, (r) => [{ key: formatOf(r.channel), label: formatOf(r.channel) }]),
    byChannel: rollup(rows, (r) => [{ key: r.channel, label: CHANNELS[r.channel]?.label ?? r.channel }]),
    byAudience: rollup(rows, (r) => {
      const a = (r.audience ?? '').trim()
      return a ? [{ key: a, label: a }] : []
    }),
  }
}
