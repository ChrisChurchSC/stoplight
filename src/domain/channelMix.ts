import type { ChannelId } from './types'

/**
 * Channel-mix recommender. Given a goal and a budget, it recommends how to split
 * spend across channels. The score for each channel blends two things: published
 * industry benchmarks (CPM, click-through, conversion) and THIS brand's own proven
 * performance (the organic reach/engagement it already earns on the platform). So a
 * channel the brand is already winning on organically gets more of the budget when
 * you amplify it with paid, rather than the plan being a generic benchmark split.
 *
 * The benchmarks are starting values, deliberately conservative and editable; the
 * math is transparent so a planner can sanity-check every number.
 */

export type MixGoal = 'reach' | 'engagement' | 'conversions'
export type MixRisk = 'conservative' | 'balanced' | 'aggressive'

/** A brand's real, measured performance on one channel (from the content library). */
export interface ChannelPerf {
  channel: ChannelId
  reach: number
  /** Engagement rate, 0..1. */
  engRate: number
  posts: number
}

export interface MixChannel {
  channel: ChannelId
  label: string
  kind: 'paid' | 'owned' | 'organic'
  /** $ per 1000 impressions. */
  cpm: number
  /** Click-through rate, 0..1. */
  ctr: number
  /** Conversion rate of a click, 0..1. */
  cvr: number
  /** Organic channels whose proven performance informs this channel. */
  provenFrom: ChannelId[]
}
type Bench = MixChannel

// Starting 2026 benchmarks (editable). CPM/CTR/CVR are mid-range planning defaults.
const BENCH: Bench[] = [
  { channel: 'meta-ads', label: 'Meta Ads (IG / Facebook)', kind: 'paid', cpm: 9, ctr: 0.011, cvr: 0.02, provenFrom: ['instagram', 'facebook'] },
  { channel: 'youtube-ads', label: 'YouTube Ads', kind: 'paid', cpm: 12, ctr: 0.007, cvr: 0.012, provenFrom: ['youtube'] },
  { channel: 'tiktok-ads', label: 'TikTok Ads', kind: 'paid', cpm: 7, ctr: 0.01, cvr: 0.012, provenFrom: ['tiktok'] },
  { channel: 'google-search', label: 'Google Search', kind: 'paid', cpm: 38, ctr: 0.035, cvr: 0.045, provenFrom: ['website'] },
  { channel: 'linkedin-ads', label: 'LinkedIn Ads', kind: 'paid', cpm: 33, ctr: 0.005, cvr: 0.028, provenFrom: ['linkedin'] },
  { channel: 'email', label: 'Email (owned list)', kind: 'owned', cpm: 2, ctr: 0.025, cvr: 0.05, provenFrom: ['email'] },
]

/** The default benchmark channels every mix starts with (not user-added extras). */
export const BENCH_CHANNEL_IDS: ChannelId[] = BENCH.map((b) => b.channel)

const RISK_POWER: Record<MixRisk, number> = { conservative: 2, balanced: 1.3, aggressive: 0.85 }
const MAX_SHARE = 0.45
const MIN_SHARE = 0.05
const REACH_FACTOR = 0.75 // impressions -> unique reach

export interface MixAllocation {
  channel: ChannelId
  label: string
  kind: string
  cpm: number
  ctr: number
  cvr: number
  pct: number
  dollars: number
  impressions: number
  reach: number
  conversions: number
  rationale: string
}

/** Per-channel benchmark overrides (the editable spreadsheet cells). */
export type MixOverrides = Partial<Record<ChannelId, Partial<{ cpm: number; ctr: number; cvr: number }>>>

/** A saved, named media mix — a goal/budget/risk scenario per brand, selectable. */
export interface MediaMix {
  id: string
  brand: string
  name: string
  goal: MixGoal
  budget: number
  risk: MixRisk
  overrides: MixOverrides
  /** User-added channels beyond the default benchmark set. */
  extraChannels?: MixChannel[]
}
export interface MixResult {
  allocations: MixAllocation[]
  totalReach: number
  totalConversions: number
  costPerConversion: number
}

export interface MixInput {
  goal: MixGoal
  budget: number
  risk: MixRisk
  perf: ChannelPerf[]
  overrides?: MixOverrides
  extraChannels?: MixChannel[]
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function recommendChannelMix(input: MixInput): MixResult {
  const perfBy = new Map(input.perf.map((p) => [p.channel, p]))
  // Apply overrides to the default benchmarks, then append any user-added channels.
  const bench: MixChannel[] = [
    ...BENCH.map((b) => ({ ...b, ...(input.overrides?.[b.channel] ?? {}) })),
    ...(input.extraChannels ?? []),
  ]
  const totalReach = input.perf.reduce((a, p) => a + p.reach, 0) || 1
  const engd = input.perf.filter((p) => p.engRate > 0)
  const avgEng = engd.length ? engd.reduce((a, p) => a + p.engRate, 0) / engd.length : 0.01

  // How strong the brand already is on this channel's platform (blended toward neutral
  // so a channel with no organic history is a measured bet, not zeroed out).
  const strength = (b: Bench): number => {
    let share = 0
    for (const src of b.provenFrom) share += (perfBy.get(src)?.reach ?? 0) / totalReach
    const baseline = 1 / bench.length
    return clamp(0.5 + 0.5 * (share / baseline), 0.4, 2.2)
  }
  const engStrength = (b: Bench): number => {
    const src = b.provenFrom.map((c) => perfBy.get(c)).filter((p): p is ChannelPerf => !!p && p.engRate > 0)
    if (!src.length) return 1
    const e = src.reduce((a, p) => a + p.engRate, 0) / src.length
    return clamp(e / avgEng, 0.4, 2.2)
  }

  const score = (b: Bench): number => {
    const impPerDollar = 1000 / b.cpm
    if (input.goal === 'reach') return impPerDollar * strength(b)
    if (input.goal === 'engagement') return impPerDollar * b.ctr * engStrength(b) * strength(b)
    return impPerDollar * b.ctr * b.cvr * strength(b)
  }

  const pw = RISK_POWER[input.risk]
  const weighted = bench.map((b) => ({ b, w: Math.pow(score(b), pw) }))
  const wSum = weighted.reduce((a, x) => a + x.w, 0) || 1
  let shares = weighted.map((x) => ({ b: x.b, s: x.w / wSum }))
  shares = shares.map((x) => ({ b: x.b, s: Math.min(MAX_SHARE, x.s) }))
  shares = shares.map((x) => ({ b: x.b, s: x.s < MIN_SHARE ? 0 : x.s }))
  const s2 = shares.reduce((a, x) => a + x.s, 0) || 1
  shares = shares.map((x) => ({ b: x.b, s: x.s / s2 }))

  const allocations = shares
    .map((x): MixAllocation => {
      const dollars = x.s * input.budget
      const impressions = dollars / x.b.cpm * 1000
      return {
        channel: x.b.channel,
        label: x.b.label,
        kind: x.b.kind,
        cpm: x.b.cpm,
        ctr: x.b.ctr,
        cvr: x.b.cvr,
        pct: +(x.s * 100).toFixed(1),
        dollars: Math.round(dollars),
        impressions: Math.round(impressions),
        reach: Math.round(impressions * REACH_FACTOR),
        conversions: Math.round(impressions * x.b.ctr * x.b.cvr),
        rationale: rationaleFor(x.b, perfBy, totalReach),
      }
    })
    .sort((a, b) => b.dollars - a.dollars)

  const totalReachOut = allocations.reduce((a, x) => a + x.reach, 0)
  const totalConversions = allocations.reduce((a, x) => a + x.conversions, 0)
  return {
    allocations,
    totalReach: totalReachOut,
    totalConversions,
    costPerConversion: totalConversions ? Math.round(input.budget / totalConversions) : 0,
  }
}

function rationaleFor(b: Bench, perfBy: Map<ChannelId, ChannelPerf>, totalReach: number): string {
  const reach = b.provenFrom.reduce((a, c) => a + (perfBy.get(c)?.reach ?? 0), 0)
  if (reach > 0) {
    const share = Math.round((reach / totalReach) * 100)
    const src = b.provenFrom[0]
    return `Your organic ${src} already drives ${share}% of proven reach. Paid amplification compounds a channel that works.`
  }
  if (b.channel === 'email') return 'Owned list, near-zero cost and the highest conversion rate. Cheap dollars that convert.'
  if (b.channel === 'google-search') return 'High-intent demand capture. Best for conversion goals even without organic history.'
  return 'No brand history here yet. A measured test bet against the benchmark.'
}
