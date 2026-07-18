import { clientForCampaign } from './clients'
import type { TrafficRow } from './types'

/**
 * "Which journeys worked for which audiences over time." Groups posted assets by
 * (campaign × audience), buckets by quarter or month, and ranks the winning journey per audience
 * in each bucket, so a repeat winner (the campaign that keeps outperforming for an audience) stands
 * out. Reads the same measured metrics as the rest of Insights, so it fills in as analytics sync;
 * empty until posted assets carry performance.
 */

/** Measured reach for a row (views/impressions/opens/reach, else the largest metric). */
function reachOf(r: TrafficRow): number {
  const m = r.socialMetrics ?? {}
  for (const k of ['views', 'impressions', 'opens', 'reach'] as const) {
    if (typeof m[k] === 'number') return m[k] as number
  }
  const nums = Object.values(m).filter((v) => typeof v === 'number') as number[]
  return nums.length ? Math.max(...nums) : 0
}

/** Measured outcome for a row (engagement, else likes+comments, else clicks). */
function outcomeOf(r: TrafficRow): number {
  const m = r.socialMetrics ?? {}
  if (typeof m.engagement === 'number' && m.engagement > 0) return m.engagement
  const likes = typeof m.likes === 'number' ? m.likes : 0
  const comments = typeof m.comments === 'number' ? m.comments : 0
  if (likes + comments > 0) return likes + comments
  if (typeof m.clicks === 'number') return m.clicks
  return 0
}

/** When the asset went live: postedAt, else the scheduled time. */
function timeOf(r: TrafficRow): number | null {
  if (typeof r.postedAt === 'number') return r.postedAt
  const t = r.scheduledAt ? Date.parse(r.scheduledAt) : NaN
  return Number.isNaN(t) ? null : t
}

const quarterLabel = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()} Q${Math.floor(d.getMonth() / 3) + 1}`
}
const monthLabel = (ms: number): string => {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export interface JourneyStat {
  campaign: string
  /** The value it was ranked by (outcome or reach). */
  value: number
  reach: number
  outcome: number
  assets: number
}
export interface AudienceJourneys {
  audience: string
  /** Time bucket → journeys ranked desc by the chosen metric. */
  perBucket: Record<string, JourneyStat[]>
  /** The campaign that ranked #1 in the most buckets (≥2), the repeat winner. */
  winner: { campaign: string; bucketsWon: number } | null
  /** Total value across all buckets, for ordering audiences. */
  total: number
}
export interface JourneyLearning {
  /** Time buckets present in the data, chronological. */
  buckets: string[]
  audiences: AudienceJourneys[]
  bucket: 'quarter' | 'month'
  rankBy: 'outcome' | 'reach'
  hasData: boolean
}

export function learnJourneysByAudience(
  rows: TrafficRow[],
  opts: { client: string; bucket?: 'quarter' | 'month'; rankBy?: 'outcome' | 'reach' },
): JourneyLearning {
  const bucket = opts.bucket ?? 'quarter'
  const rankBy = opts.rankBy ?? 'outcome'
  const label = bucket === 'quarter' ? quarterLabel : monthLabel

  // Posted/live assets with an audience + campaign in this client that carry measured performance.
  const value = (r: TrafficRow) => (rankBy === 'reach' ? reachOf(r) : outcomeOf(r))
  const rel = rows.filter((r) => {
    const aud = (r.audience ?? '').trim()
    const camp = (r.campaign ?? '').trim()
    if (!aud || !camp) return false
    if (opts.client && clientForCampaign(camp) !== opts.client) return false
    if (timeOf(r) == null) return false
    return value(r) > 0
  })

  const acc = new Map<string, Map<string, Map<string, JourneyStat>>>() // audience → bucket → campaign
  const bucketSet = new Set<string>()
  for (const r of rel) {
    const aud = (r.audience ?? '').trim()
    const camp = (r.campaign ?? '').trim()
    const b = label(timeOf(r)!)
    bucketSet.add(b)
    const byB = acc.get(aud) ?? new Map()
    acc.set(aud, byB)
    const byC = byB.get(b) ?? new Map<string, JourneyStat>()
    byB.set(b, byC)
    const cur = byC.get(camp) ?? { campaign: camp, value: 0, reach: 0, outcome: 0, assets: 0 }
    cur.outcome += outcomeOf(r)
    cur.reach += reachOf(r)
    cur.value += value(r)
    cur.assets += 1
    byC.set(camp, cur)
  }

  const buckets = [...bucketSet].sort() // '2025 Q1' / '2025-01' both sort chronologically
  const audiences: AudienceJourneys[] = [...acc.entries()]
    .map(([audience, byB]) => {
      const perBucket: Record<string, JourneyStat[]> = {}
      const wins = new Map<string, number>()
      let total = 0
      for (const b of buckets) {
        const byC = byB.get(b)
        const ranked = byC ? [...byC.values()].sort((a, c) => c.value - a.value) : []
        perBucket[b] = ranked
        total += ranked.reduce((s, x) => s + x.value, 0)
        if (ranked[0]) wins.set(ranked[0].campaign, (wins.get(ranked[0].campaign) ?? 0) + 1)
      }
      const top = [...wins.entries()].sort((a, c) => c[1] - a[1])[0]
      const winner = top && top[1] >= 2 ? { campaign: top[0], bucketsWon: top[1] } : null
      return { audience, perBucket, winner, total }
    })
    .sort((a, c) => c.total - a.total)

  return { buckets, audiences, bucket, rankBy, hasData: rel.length > 0 }
}
