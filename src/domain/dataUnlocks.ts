import type { TrafficRow } from './types'
import { contentFlow, reconciliationStat } from './contentSignals'

/**
 * Data unlocks — the gamified read on the Library. Every insight Hyperfocus can give
 * a brand needs a floor of data underneath it: you can't rank proof points with three
 * posts, or forecast reach off a handful of metrics. This turns that floor into a
 * progression. Each unlock has a real threshold and a live current value computed off
 * the brand's own content, so the bar fills as the brand ingests, tags, connects, and
 * publishes. Locked today, earned tomorrow — the same signal, once there's enough of it.
 */

export type UnlockTier = 'Foundations' | 'Signal' | 'Strategy'

export interface DataUnlock {
  id: string
  title: string
  reveal: string
  tier: UnlockTier
  metric: string
  current: number
  threshold: number
  unlocked: boolean
  progress: number // 0..1, clamped
  where?: string // where it lives in the app, once unlocked
}

export interface DataProgress {
  unlocks: DataUnlock[]
  byTier: { tier: UnlockTier; unlocks: DataUnlock[] }[]
  unlockedCount: number
  total: number
  pctComplete: number
  level: number
  levelName: string
  levelFloor: number // unlockedCount at which this level began
  nextLevelAt: number // unlockedCount needed for the next level (=== total when maxed)
  points: number
  maxPoints: number
  next?: DataUnlock // closest still-locked unlock
}

const LEVELS: { name: string; floor: number }[] = [
  { name: 'Scout', floor: 0 },
  { name: 'Analyst', floor: 3 },
  { name: 'Strategist', floor: 6 },
  { name: 'Oracle', floor: 9 },
  { name: 'Omniscient', floor: 12 },
]

const hasMetrics = (r: TrafficRow): boolean =>
  !!r.socialMetrics && Object.values(r.socialMetrics).some((v) => typeof v === 'number' && v > 0)

const hasCopy = (r: TrafficRow): boolean =>
  Object.values(r.messaging ?? {}).some((v) => typeof v === 'string' && v.trim().split(/\s+/).length >= 6)

const dayMs = 86_400_000
function spanDays(rows: TrafficRow[]): number {
  const ts: number[] = []
  for (const r of rows) {
    const iso = r.publishedAt ?? (r.postedAt ? undefined : undefined)
    const t = iso ? Date.parse(iso) : typeof r.postedAt === 'number' ? r.postedAt : NaN
    if (!Number.isNaN(t)) ts.push(t)
  }
  if (ts.length < 2) return 0
  return Math.round((Math.max(...ts) - Math.min(...ts)) / dayMs)
}

export interface UnlockInputs {
  items: TrafficRow[] // published library items
  allRows: TrafficRow[] // planned + published
  proofPoints: { label?: string }[]
  audiences: { name?: string; label?: string }[]
  sources: string[] // connected analytics sources (Summer)
  donorLinked?: boolean // a donor system-of-record (Neon) is wired
}

export function computeDataUnlocks(inp: UnlockInputs): DataProgress {
  const { items, allRows, proofPoints, audiences, sources } = inp
  const withMetrics = items.filter(hasMetrics).length
  const withCopy = items.filter(hasCopy).length
  const channelsUsed = new Set(items.map((r) => String(r.channel))).size
  const channelsWithMetrics = new Set(items.filter(hasMetrics).map((r) => String(r.channel))).size
  const tagged = items.filter((r) => (r.audience ?? '').trim()).length
  const audiencesDefined = audiences.filter((a) => (a.name ?? a.label ?? '').trim()).length
  const proofDefined = proofPoints.filter((p) => (p.label ?? '').trim()).length
  const days = spanDays(items)
  const recon = reconciliationStat(allRows)
  const deadEndPct = items.length ? contentFlow(items).overall.deadEndPct : 100
  const connected = new Set(sources.map((s) => s.toLowerCase())).size
  const analyticsLinked = connected > 0
  const systemsLinked = (analyticsLinked ? 1 : 0) + (inp.donorLinked ? 1 : 0)

  const raw: Omit<DataUnlock, 'unlocked' | 'progress'>[] = [
    // ── Foundations ──
    {
      id: 'catalog', tier: 'Foundations', title: 'Content catalog',
      reveal: 'Every post, video, and page in one browsable place, each with its real metrics.',
      metric: 'assets ingested', current: items.length, threshold: 20, where: 'Library › Catalog',
    },
    {
      id: 'patterns', tier: 'Foundations', title: 'Messaging patterns',
      reveal: 'Your verbal tics, the words only you use, and the lines you repeat word for word.',
      metric: 'posts with copy', current: withCopy, threshold: 60, where: 'Library › Signals · Reports',
    },
    {
      id: 'proof', tier: 'Foundations', title: 'Proof-point performance',
      reveal: 'Which of your proof points actually earn engagement, ranked by what the content drove.',
      metric: 'assets with metrics', current: withMetrics, threshold: 40, where: 'Library › Signals',
    },
    {
      id: 'flow', tier: 'Foundations', title: 'Content flow map',
      reveal: 'How your content links together and where every post sends people next.',
      metric: 'posts mapped', current: items.length, threshold: 80, where: 'Library › Map',
    },
    // ── Signal ──
    {
      id: 'attribution', tier: 'Signal', title: 'Channel attribution',
      reveal: 'Which channel earns the reach and which drives subscribers, measured side by side.',
      metric: 'channels with metrics', current: channelsWithMetrics, threshold: 3, where: 'Library › Signals',
    },
    {
      id: 'connect', tier: 'Signal', title: 'Cross-channel lift',
      reveal: 'Whether one channel feeds the others: does YouTube move the site and the newsletter?',
      metric: 'connected data sources', current: connected, threshold: 3, where: 'Reports',
    },
    {
      id: 'audience', tier: 'Signal', title: 'Audience resonance',
      reveal: 'Which segment responds to which message, so you write to the person and not the crowd.',
      metric: 'assets tagged to an audience', current: tagged, threshold: 40,
    },
    {
      id: 'cadence', tier: 'Signal', title: 'Cadence & timing',
      reveal: 'Your best day and posting rhythm, learned from what actually earned reach.',
      metric: 'days of dated history', current: days, threshold: 60, where: 'Library › Signals',
    },
    // ── Strategy ──
    {
      id: 'reconcile', tier: 'Strategy', title: 'Plan vs actual',
      reveal: 'Planned cards auto-match to the posts they became and inherit their measured metrics.',
      metric: 'reconciled cards', current: recon.reconciled, threshold: 15,
    },
    {
      id: 'forecast', tier: 'Strategy', title: 'Reach forecasting',
      reveal: 'A predicted reach range for a post before you publish it, from your own track record.',
      metric: 'assets with metrics', current: withMetrics, threshold: 200,
    },
    {
      id: 'funnel', tier: 'Strategy', title: 'Donor conversion path',
      reveal: 'The whole path from reach to owned audience to donor, once the donor system is linked.',
      metric: 'systems linked (analytics + donor)', current: systemsLinked, threshold: 2,
    },
    {
      id: 'seasonality', tier: 'Strategy', title: 'Seasonality & year-over-year',
      reveal: 'Seasonal lift and year-over-year trend lines, once a full year of history is in.',
      metric: 'days of history', current: days, threshold: 365,
    },
  ]

  // audiencesDefined / proofDefined / deadEndPct kept alongside for callers/tooltips.
  void audiencesDefined
  void proofDefined
  void deadEndPct
  void channelsUsed

  const unlocks: DataUnlock[] = raw.map((u) => {
    const progress = Math.max(0, Math.min(1, u.threshold ? u.current / u.threshold : 0))
    return { ...u, unlocked: u.current >= u.threshold, progress }
  })

  const unlockedCount = unlocks.filter((u) => u.unlocked).length
  const total = unlocks.length
  const level = LEVELS.reduce((acc, l, i) => (unlockedCount >= l.floor ? i : acc), 0)
  const levelName = LEVELS[level].name
  const levelFloor = LEVELS[level].floor
  const nextLevelAt = level < LEVELS.length - 1 ? LEVELS[level + 1].floor : total
  const points = unlocks.reduce((s, u) => s + Math.round(u.progress * 100), 0)
  const maxPoints = total * 100
  const next = unlocks
    .filter((u) => !u.unlocked)
    .sort((a, b) => b.progress - a.progress)[0]

  const tiers: UnlockTier[] = ['Foundations', 'Signal', 'Strategy']
  const byTier = tiers.map((tier) => ({ tier, unlocks: unlocks.filter((u) => u.tier === tier) }))

  return {
    unlocks, byTier, unlockedCount, total, pctComplete: total ? unlockedCount / total : 0,
    level: level + 1, levelName, levelFloor, nextLevelAt, points, maxPoints, next,
  }
}
