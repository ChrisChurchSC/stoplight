import type { TrafficRow } from './types'
import { formatReach } from './journeyPerf'
import {
  channelName,
  compact,
  computeAudienceCoverage,
  computeLibrarySignals,
  computeMessageCoverage,
  computeMessagingPatterns,
  contentFlow,
  extractLinks,
  reconciliationStat,
} from './contentSignals'

/**
 * Data unlocks — the gamified read on the Library. Every insight Hyperfocus can give
 * a brand sits on a floor of data: you can't rank proof points off three posts or
 * forecast reach off a handful of metrics. This turns that floor into a progression the
 * brand climbs by ingesting, tagging, connecting, and publishing. Each unlock has a real
 * threshold and a live current value computed off the brand's own content, so the bars
 * fill as data grows and the locked insights open on their own. And once an insight is
 * unlocked, the card carries its actual finding — not "done", but what it found.
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
  finding?: string // the actual insight, once unlocked
  where?: string // where the full read lives in the app
}

export interface DataProgress {
  unlocks: DataUnlock[]
  byTier: { tier: UnlockTier; unlocks: DataUnlock[] }[]
  unlockedCount: number
  total: number
  pctComplete: number
  level: number
  levelName: string
  nextLevelAt: number
  points: number
  maxPoints: number
  next?: DataUnlock
}

const LEVEL_NAMES = ['Scout', 'Analyst', 'Strategist', 'Oracle', 'Omniscient']
const LEVEL_FRACS = [0, 0.2, 0.45, 0.7, 1]

const hasMetrics = (r: TrafficRow): boolean =>
  !!r.socialMetrics && Object.values(r.socialMetrics).some((v) => typeof v === 'number' && v > 0)
const hasCopy = (r: TrafficRow): boolean =>
  Object.values(r.messaging ?? {}).some((v) => typeof v === 'string' && v.trim().split(/\s+/).length >= 6)
const copyOf = (r: TrafficRow): string =>
  Object.values(r.messaging ?? {})
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
const reachOf = (r: TrafficRow): number => {
  const m = r.socialMetrics
  if (!m) return 0
  if (typeof m.views === 'number') return m.views
  if (typeof m.impressions === 'number') return m.impressions
  if (typeof m.reach === 'number') return m.reach
  const nums = Object.values(m).filter((v): v is number => typeof v === 'number')
  return nums.length ? Math.max(...nums) : 0
}
const engOf = (r: TrafficRow): number => {
  const m = r.socialMetrics
  if (!m) return 0
  if (typeof m.engagement === 'number') return m.engagement
  return (typeof m.likes === 'number' ? m.likes : 0) + (typeof m.comments === 'number' ? m.comments : 0)
}
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const avg = (arr: TrafficRow[], f: (r: TrafficRow) => number): number =>
  arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0

const dayMs = 86_400_000
function spanDays(rows: TrafficRow[]): number {
  const ts: number[] = []
  for (const r of rows) {
    const t = r.publishedAt ? Date.parse(r.publishedAt) : typeof r.postedAt === 'number' ? r.postedAt : NaN
    if (!Number.isNaN(t)) ts.push(t)
  }
  return ts.length < 2 ? 0 : Math.round((Math.max(...ts) - Math.min(...ts)) / dayMs)
}

export interface UnlockInputs {
  items: TrafficRow[]
  allRows: TrafficRow[]
  proofPoints: { label?: string }[]
  ctas: { label?: string }[]
  audiences: { name?: string; label?: string }[]
  sources: string[]
  donorLinked?: boolean
}

export function computeDataUnlocks(inp: UnlockInputs): DataProgress {
  const { items, allRows, proofPoints, ctas, audiences, sources } = inp

  // ── Progress counters ──
  const withMetrics = items.filter(hasMetrics).length
  const withCopy = items.filter(hasCopy).length
  const channelsWithMetrics = new Set(items.filter(hasMetrics).map((r) => String(r.channel))).size
  const tagged = items.filter((r) => (r.audience ?? '').trim()).length
  const ctasDefined = ctas.filter((c) => (c.label ?? '').trim()).length
  const postsWithSubs = items.filter((r) => typeof r.socialMetrics?.subscribers === 'number' && r.socialMetrics.subscribers > 0).length
  const days = spanDays(items)
  const recon = reconciliationStat(allRows)
  const connected = new Set(sources.map((s) => s.toLowerCase())).size
  const systemsLinked = (connected > 0 ? 1 : 0) + (inp.donorLinked ? 1 : 0)

  // ── Findings: the actual reads, computed once off the library ──
  const sig = computeLibrarySignals(items)
  const cov = computeMessageCoverage(
    items,
    proofPoints.map((p) => ({ label: p.label ?? '' })),
    ctas.map((c) => ({ label: c.label ?? '' })),
  )
  const flow = items.length ? contentFlow(items) : null
  const aud = computeAudienceCoverage(items, audiences)
  const links = extractLinks(items)
  const pat = computeMessagingPatterns(items)

  const chByReach = [...sig.channels].sort((a, b) => b.reach - a.reach)
  const chBySubs = [...sig.channels].filter((c) => c.subs > 0).sort((a, b) => b.subs - a.subs)
  const topProof = cov.proof.performing[0]
  const topDest = flow?.destinations?.[0]
  const topRepeat = pat.repeats?.[0]
  const topVocab = sig.vocabulary?.[0]
  const topVoice = [...(sig.voice ?? [])].sort((a, b) => b.lift - a.lift)[0]
  const bestDay = sig.days?.[0]
  const topAud = aud.defined?.find((d) => d.count > 0)
  const topLink = links?.[0]
  const topConv = sig.converters?.[0]
  const topTopic = sig.topics?.[0]
  const usedCtas = [...cov.cta.items].filter((c) => c.hits > 0).sort((a, b) => b.hits - a.hits)
  const neverCtas = cov.cta.items.filter((c) => c.hits === 0).length

  const reaches = items.map(reachOf).sort((a, b) => b - a)
  const totReach = reaches.reduce((a, b) => a + b, 0)
  const top10 = Math.max(1, Math.ceil(reaches.length * 0.1))
  const top10Share = totReach ? Math.round((reaches.slice(0, top10).reduce((a, b) => a + b, 0) / totReach) * 100) : 0

  const qRows = items.filter((r) => /\?/.test(copyOf(r)))
  const nqRows = items.filter((r) => !/\?/.test(copyOf(r)))
  const qEng = avg(qRows, engOf)
  const nqEng = avg(nqRows, engOf)
  const qLift = nqEng > 0 ? qEng / nqEng : 0

  const OWNED = new Set(['email', 'site', 'web', 'newsletter', 'blog', 'website'])
  const ownedReach = items.filter((r) => OWNED.has(String(r.channel))).reduce((s, r) => s + reachOf(r), 0)
  const ownedPct = totReach ? Math.round((ownedReach / totReach) * 100) : 0

  const F: Record<string, string> = {
    catalog: `${formatReach(totReach)} total reach · biggest channel by reach: ${channelName(chByReach[0]?.channel ?? '')} (${chByReach[0]?.reachLabel ?? '—'})`,
    patterns: topRepeat
      ? `Most-repeated line: “${clip(topRepeat.text, 46)}” — ${topRepeat.count}×`
      : topVocab
        ? `Signature phrase: “${topVocab.phrase}” (${topVocab.count} posts)`
        : '',
    proof: topProof
      ? `Top proof point: “${clip(topProof.label, 40)}” drove ${compact(topProof.outcome ?? 0)} across ${topProof.hits} posts · ${cov.proof.used}/${cov.proof.total} stated`
      : `${cov.proof.used} of ${cov.proof.total} proof points appear in the copy`,
    flow: flow
      ? `${flow.overall.deadEndPct}% of posts dead-end · the ones that connect mostly drive to ${topDest?.key ?? '—'} (${topDest?.count ?? 0})`
      : '',
    linkmap: topLink ? `Copy points most often to ${topLink.host} (×${topLink.count})` : '',
    concentration: `Your top 10% of posts drive ${top10Share}% of all reach`,
    attribution: chByReach[0]
      ? `${channelName(chByReach[0].channel)} earns the most reach${chBySubs[0] ? `; ${channelName(chBySubs[0].channel)} drives the most subscribers` : ''}`
      : '',
    engagement: qLift > 0
      ? `Posts that ask a question earn ${qLift.toFixed(1)}× the engagement (${compact(qEng)} vs ${compact(nqEng)})`
      : topVoice
        ? `“${topVoice.trait}” titles get ${topVoice.lift.toFixed(1)}× average reach`
        : '',
    topics: topTopic ? `Top subject: ${topTopic.topic} — ${compact(topTopic.subs)} subs across ${topTopic.count} posts` : '',
    audience: topAud ? `Most content speaks to ${topAud.label} (${topAud.count} assets) · ${aud.tagged}/${aud.total} tagged` : '',
    cadence: bestDay ? `Best day to post: ${bestDay.day} (avg ${formatReach(bestDay.avgReach)} reach)` : '',
    cta: usedCtas[0]
      ? `Most-made ask: “${clip(usedCtas[0].label, 32)}” (${usedCtas[0].hits} posts)${neverCtas ? ` · ${neverCtas} CTA${neverCtas > 1 ? 's' : ''} never said` : ''}`
      : neverCtas
        ? `${neverCtas} defined CTA${neverCtas > 1 ? 's are' : ' is'} never actually said`
        : '',
    subscribers: topConv ? `Best converter: “${clip(topConv.title, 42)}” at ${((topConv.rate ?? 0) * 100).toFixed(2)}% subscribe rate` : '',
    connect: `Owned channels (site, email) carry ${ownedPct}% of reach; the rest lives on platforms you don't own`,
  }

  // ── The unlock catalog ──
  const raw: (Omit<DataUnlock, 'unlocked' | 'progress' | 'finding'> & { key?: string })[] = [
    // Foundations
    { id: 'catalog', tier: 'Foundations', title: 'Content catalog', reveal: 'Every post, video, and page in one browsable place, each with its real metrics.', metric: 'assets ingested', current: items.length, threshold: 20, where: 'Library › Catalog' },
    { id: 'patterns', tier: 'Foundations', title: 'Messaging patterns', reveal: 'Your verbal tics, the words only you use, and the lines you repeat word for word.', metric: 'posts with copy', current: withCopy, threshold: 60, where: 'Library › Signals · Reports' },
    { id: 'proof', tier: 'Foundations', title: 'Proof-point performance', reveal: 'Which of your proof points actually earn engagement, ranked by what the content drove.', metric: 'assets with metrics', current: withMetrics, threshold: 40, where: 'Library › Signals' },
    { id: 'flow', tier: 'Foundations', title: 'Content flow map', reveal: 'How your content links together and where every post sends people next.', metric: 'posts mapped', current: items.length, threshold: 80, where: 'Library › Map' },
    { id: 'linkmap', tier: 'Foundations', title: 'Link & destination map', reveal: 'Every place your copy points people — the platforms and pages you actually route to.', metric: 'posts with copy', current: withCopy, threshold: 40, where: 'Library › Map' },
    { id: 'concentration', tier: 'Foundations', title: 'Reach concentration', reveal: 'How top-heavy your reach is — the share that comes from your best handful of posts.', metric: 'assets with metrics', current: withMetrics, threshold: 50 },
    // Signal
    { id: 'attribution', tier: 'Signal', title: 'Channel attribution', reveal: 'Which channel earns the reach and which drives subscribers, measured side by side.', metric: 'channels with metrics', current: channelsWithMetrics, threshold: 3, where: 'Library › Signals' },
    { id: 'engagement', tier: 'Signal', title: 'Engagement drivers', reveal: 'What lifts engagement — questions vs statements, length, the shapes that make people act.', metric: 'assets with metrics', current: withMetrics, threshold: 60, where: 'Library › Signals' },
    { id: 'topics', tier: 'Signal', title: 'Topic performance', reveal: 'Which subjects and themes drive subscribers, not just which get posted most.', metric: 'posts with copy', current: withCopy, threshold: 60, where: 'Library › Signals' },
    { id: 'audience', tier: 'Signal', title: 'Audience resonance', reveal: 'Which segment responds to which message, so you write to the person and not the crowd.', metric: 'assets tagged to an audience', current: tagged, threshold: 40 },
    { id: 'cadence', tier: 'Signal', title: 'Cadence & timing', reveal: 'Your best day and posting rhythm, learned from what actually earned reach.', metric: 'days of dated history', current: days, threshold: 60, where: 'Library › Signals' },
    { id: 'cta', tier: 'Signal', title: 'CTA effectiveness', reveal: 'Which calls to action you actually make in the copy, and which you never say out loud.', metric: 'CTAs defined', current: ctasDefined, threshold: 3, where: 'Library › Signals' },
    { id: 'subscribers', tier: 'Signal', title: 'Subscriber drivers', reveal: 'The specific content that converts viewers to subscribers, by subscribe rate.', metric: 'posts reporting subscribers', current: postsWithSubs, threshold: 15, where: 'Library › Signals' },
    // Strategy
    { id: 'connect', tier: 'Strategy', title: 'Cross-channel lift', reveal: 'Whether one channel feeds the others: does YouTube move the site and the newsletter?', metric: 'connected data sources', current: connected, threshold: 3, where: 'Reports' },
    { id: 'reconcile', tier: 'Strategy', title: 'Plan vs actual', reveal: 'Planned cards auto-match to the posts they became and inherit their measured metrics.', metric: 'reconciled cards', current: recon.reconciled, threshold: 15 },
    { id: 'forecast', tier: 'Strategy', title: 'Reach forecasting', reveal: 'A predicted reach range for a post before you publish it, from your own track record.', metric: 'assets with metrics', current: withMetrics, threshold: 200 },
    { id: 'funnel', tier: 'Strategy', title: 'Donor conversion path', reveal: 'The whole path from reach to owned audience to donor, once the donor system is linked.', metric: 'systems linked (analytics + donor)', current: systemsLinked, threshold: 2 },
    { id: 'seasonality', tier: 'Strategy', title: 'Seasonality & year-over-year', reveal: 'Seasonal lift and year-over-year trend lines, once a full year of history is in.', metric: 'days of history', current: days, threshold: 365 },
  ]

  const unlocks: DataUnlock[] = raw.map((u) => {
    const progress = Math.max(0, Math.min(1, u.threshold ? u.current / u.threshold : 0))
    const unlocked = u.current >= u.threshold
    const finding = unlocked && F[u.id] ? F[u.id] : undefined
    return { id: u.id, tier: u.tier, title: u.title, reveal: u.reveal, metric: u.metric, current: u.current, threshold: u.threshold, where: u.where, unlocked, progress, finding }
  })

  const unlockedCount = unlocks.filter((u) => u.unlocked).length
  const total = unlocks.length
  const floors = LEVEL_FRACS.map((f) => Math.ceil(total * f))
  floors[0] = 0
  let level = 0
  for (let i = 0; i < floors.length; i++) if (unlockedCount >= floors[i]) level = i
  const nextLevelAt = level < floors.length - 1 ? floors[level + 1] : total
  const points = unlocks.reduce((s, u) => s + Math.round(u.progress * 100), 0)
  const next = unlocks.filter((u) => !u.unlocked).sort((a, b) => b.progress - a.progress)[0]

  const tiers: UnlockTier[] = ['Foundations', 'Signal', 'Strategy']
  const byTier = tiers.map((tier) => ({ tier, unlocks: unlocks.filter((u) => u.tier === tier) }))

  return {
    unlocks, byTier, unlockedCount, total, pctComplete: total ? unlockedCount / total : 0,
    level: level + 1, levelName: LEVEL_NAMES[level], nextLevelAt, points, maxPoints: total * 100, next,
  }
}
