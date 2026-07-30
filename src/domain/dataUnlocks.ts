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
 * Data unlocks — a large, progressive catalog of insights you earn by pairing messaging
 * with data over time. Each unlock is gated: some need a floor of content, some need
 * metrics, some need tags or a connected source, and many need months of accumulated
 * history before the insight is trustworthy. An unlock opens only when every gate is met,
 * and the card then carries its actual finding, computed live off the brand's own library.
 * The catalog is the point: most of it is locked today and lights up on its own as the
 * brand keeps publishing, tagging, connecting, and measuring. Same signal, once there is
 * enough of it, held long enough to mean something.
 */

export type UnlockCategory =
  | 'Foundations'
  | 'Message performance'
  | 'Audience'
  | 'Audience precision'
  | 'Channel & flow'
  | 'Channel expansion'
  | 'Paid media'
  | 'Search, SEO & AEO'
  | 'Timing & cadence'
  | 'Trends over time'
  | 'Conversion & funnel'
  | 'Forecasting'
  | 'Money & mission'
  | 'Seasonality & maturity'

export const CATEGORY_ORDER: UnlockCategory[] = [
  'Foundations',
  'Message performance',
  'Audience',
  'Audience precision',
  'Channel & flow',
  'Channel expansion',
  'Paid media',
  'Search, SEO & AEO',
  'Timing & cadence',
  'Trends over time',
  'Conversion & funnel',
  'Forecasting',
  'Money & mission',
  'Seasonality & maturity',
]

export interface DataUnlock {
  id: string
  category: UnlockCategory
  title: string
  reveal: string
  metric: string // the binding gate's metric
  current: number
  threshold: number
  unlocked: boolean
  progress: number // 0..1 over the binding (least-satisfied) gate
  finding?: string
  /** A sample of the outcome this unlock will tell — shown on locked cards as a preview. */
  example?: string
  where?: string
  gated?: string // a short note on what still gates it (the binding gate), when locked
  /** The real data volumes this finding is computed over — one per gate (ingested content
   *  and brand inputs only), used to show its source line. */
  sources: { metric: string; current: number }[]
  /** An optional mini-visual of the finding's own numbers, rendered under the text. */
  visual?: UnlockVisual
}

/** A small chart that sits under a finding. Each is a single measure, so single-hue.
 *  bars = a ranked top-N; ratio = X of a whole; meter = one proportion (0..1). */
/** A good/warn/bad read on a value, so the visual can color it. Only set where a value
 *  has a clear direction (rising trend = good, high dead-end = bad); never on bars. */
export type Tone = 'good' | 'warn' | 'bad'
export type UnlockVisual =
  | { kind: 'bars'; data: { label: string; value: number; display: string }[] }
  | { kind: 'ratio'; part: number; whole: number; tone?: Tone }
  | { kind: 'meter'; value: number; tone?: Tone }
  | { kind: 'delta'; pct: number; tone?: Tone }

export interface DataProgress {
  unlocks: DataUnlock[]
  byCategory: { category: UnlockCategory; unlocks: DataUnlock[]; unlocked: number }[]
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

const LEVEL_NAMES = ['Scout', 'Analyst', 'Strategist', 'Oracle', 'Omniscient', 'Oracle Prime']
const LEVEL_FRACS = [0, 0.2, 0.4, 0.6, 0.8, 1]

// ── Row helpers ──
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
const subsOf = (r: TrafficRow): number =>
  typeof r.socialMetrics?.subscribers === 'number' ? r.socialMetrics.subscribers : 0
const dateMs = (r: TrafficRow): number =>
  r.publishedAt ? Date.parse(r.publishedAt) : typeof r.postedAt === 'number' ? r.postedAt : NaN
const clip = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s)
const avg = (arr: TrafficRow[], f: (r: TrafficRow) => number): number =>
  arr.length ? arr.reduce((s, r) => s + f(r), 0) / arr.length : 0
const pctChange = (from: number, to: number): number => (from > 0 ? Math.round(((to - from) / from) * 100) : 0)
const signed = (n: number): string => (n >= 0 ? `+${n}` : `${n}`)
const dayMs = 86_400_000

// ── The computation context: everything a gate or finding might need, computed once ──
interface Ctx {
  items: TrafficRow[]
  withMetrics: number
  withCopy: number
  tagged: number
  ctasDefined: number
  proofDefined: number
  audiencesDefined: number
  channelsUsed: number
  channelsWithMetrics: number
  postsWithSubs: number
  days: number
  connected: number
  systemsLinked: number
  reconciled: number
  totReach: number
  top10Share: number
  ownedPct: number
  deadEndReach: number
  qLift: number
  reachTrendPct: number
  engTrendPct: number
  subsTrendPct: number
  momentumPct: number
  postsPerWeek: number
  longestGapDays: number
  adConnected: number
  searchConnected: number
  webAssets: number
  sig: ReturnType<typeof computeLibrarySignals>
  cov: ReturnType<typeof computeMessageCoverage>
  flow: ReturnType<typeof contentFlow> | null
  aud: ReturnType<typeof computeAudienceCoverage>
  links: ReturnType<typeof extractLinks>
  pat: ReturnType<typeof computeMessagingPatterns>
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

function buildCtx(inp: UnlockInputs): Ctx {
  const { items, proofPoints, ctas, audiences, sources } = inp
  const withMetrics = items.filter(hasMetrics).length
  const withCopy = items.filter(hasCopy).length
  const tagged = items.filter((r) => (r.audience ?? '').trim()).length
  const ctasDefined = ctas.filter((c) => (c.label ?? '').trim()).length
  const proofDefined = proofPoints.filter((p) => (p.label ?? '').trim()).length
  const audiencesDefined = audiences.filter((a) => (a.name ?? a.label ?? '').trim()).length
  const channelsUsed = new Set(items.map((r) => String(r.channel))).size
  const channelsWithMetrics = new Set(items.filter(hasMetrics).map((r) => String(r.channel))).size
  const postsWithSubs = items.filter((r) => subsOf(r) > 0).length
  const connected = new Set(sources.map((s) => s.toLowerCase())).size
  const systemsLinked = (connected > 0 ? 1 : 0) + (inp.donorLinked ? 1 : 0)
  const adConnected = sources.filter((s) => /\bads?\b|adwords|_ads|paid|\bsem\b|\bppc\b/i.test(s)).length
  const searchConnected = sources.some((s) => /search.?console|\bgsc\b|google.?search|\bseo\b/i.test(s)) ? 1 : 0
  const webAssets = items.filter((r) => /web|site|search|blog|page|seo/i.test(String(r.channel))).length
  const reconciled = reconciliationStat(inp.allRows).reconciled

  // Temporal splits: sort dated posts, compare first half vs second half.
  const dated = items
    .map((r) => ({ r, t: dateMs(r) }))
    .filter((x) => !Number.isNaN(x.t))
    .sort((a, b) => a.t - b.t)
  const days = dated.length >= 2 ? Math.round((dated[dated.length - 1].t - dated[0].t) / dayMs) : 0
  const mid = Math.floor(dated.length / 2)
  const early = dated.slice(0, mid).map((x) => x.r)
  const late = dated.slice(mid).map((x) => x.r)
  const em = early.filter(hasMetrics)
  const lm = late.filter(hasMetrics)
  const reachTrendPct = pctChange(avg(em, reachOf), avg(lm, reachOf))
  const engTrendPct = pctChange(avg(em, engOf), avg(lm, engOf))
  const subsTrendPct = pctChange(avg(em, subsOf), avg(lm, subsOf))

  // Momentum: last 30 days vs the 30 before, by average reach per post.
  let momentumPct = 0
  if (dated.length) {
    const max = dated[dated.length - 1].t
    const last30 = dated.filter((x) => x.t > max - 30 * dayMs).map((x) => x.r).filter(hasMetrics)
    const prior30 = dated.filter((x) => x.t <= max - 30 * dayMs && x.t > max - 60 * dayMs).map((x) => x.r).filter(hasMetrics)
    momentumPct = pctChange(avg(prior30, reachOf), avg(last30, reachOf))
  }

  const postsPerWeek = days > 0 ? Math.round((dated.length / (days / 7)) * 10) / 10 : 0
  let longestGapDays = 0
  for (let i = 1; i < dated.length; i++) longestGapDays = Math.max(longestGapDays, Math.round((dated[i].t - dated[i - 1].t) / dayMs))

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

  const reaches = items.map(reachOf).sort((a, b) => b - a)
  const totReach = reaches.reduce((a, b) => a + b, 0)
  const top10 = Math.max(1, Math.ceil(reaches.length * 0.1))
  const top10Share = totReach ? Math.round((reaches.slice(0, top10).reduce((a, b) => a + b, 0) / totReach) * 100) : 0

  const OWNED = new Set(['email', 'site', 'web', 'newsletter', 'blog', 'website'])
  const ownedReach = items.filter((r) => OWNED.has(String(r.channel))).reduce((s, r) => s + reachOf(r), 0)
  const ownedPct = totReach ? Math.round((ownedReach / totReach) * 100) : 0

  const deadEndIds = new Set((flow?.deadEnds ?? []).map((a) => a.id))
  const deadEndReach = items.filter((r) => deadEndIds.has(r.id)).reduce((s, r) => s + reachOf(r), 0)

  const qRows = items.filter((r) => /\?/.test(copyOf(r)))
  const nqRows = items.filter((r) => !/\?/.test(copyOf(r)))
  const qLift = avg(nqRows, engOf) > 0 ? avg(qRows, engOf) / avg(nqRows, engOf) : 0

  return {
    items, withMetrics, withCopy, tagged, ctasDefined, proofDefined, audiencesDefined, channelsUsed,
    channelsWithMetrics, postsWithSubs, days, connected, systemsLinked, reconciled, totReach, top10Share,
    ownedPct, deadEndReach, qLift, reachTrendPct, engTrendPct, subsTrendPct, momentumPct, postsPerWeek,
    longestGapDays, adConnected, searchConnected, webAssets, sig, cov, flow, aud, links, pat,
  }
}

// ── A gate: a single requirement. An unlock opens when every gate is met. ──
interface Gate {
  metric: string
  current: number
  threshold: number
}
const G = (metric: string, current: number, threshold: number): Gate => ({ metric, current, threshold })
const timeG = (c: Ctx, days: number): Gate => G('days of history', c.days, days)

interface UnlockDef {
  id: string
  category: UnlockCategory
  title: string
  reveal: string
  gates: (c: Ctx) => Gate[]
  finding?: (c: Ctx) => string | undefined
  where?: string
}

// convenience accessors for findings
const num = (n: number) => n.toLocaleString()

const BASE_CATALOG: UnlockDef[] = [
  // ───────────────────────── Foundations ─────────────────────────
  {
    id: 'catalog', category: 'Foundations', title: 'Content catalog', where: 'Library › Catalog',
    reveal: 'Every post, video, and page in one browsable place, each with its real metrics.',
    gates: (c) => [G('assets ingested', c.items.length, 20)],
    finding: (c) => {
      const top = [...c.sig.channels].sort((a, b) => b.reach - a.reach)[0]
      return `${formatReach(c.totReach)} total reach across ${c.items.length} assets · biggest channel: ${channelName(top?.channel ?? '')} (${top?.reachLabel ?? '—'})`
    },
  },
  {
    id: 'patterns', category: 'Foundations', title: 'Messaging patterns', where: 'Library › Insights · Reports',
    reveal: 'Your verbal tics, the words only you use, and the lines you repeat word for word.',
    gates: (c) => [G('posts with copy', c.withCopy, 60)],
    finding: (c) => {
      const r = c.pat.repeats?.[0]
      const v = c.sig.vocabulary?.[0]
      return r ? `Most-repeated line: “${clip(r.text, 46)}” — ${r.count}×` : v ? `Signature phrase: “${v.phrase}” (${v.count} posts)` : undefined
    },
  },
  {
    id: 'register', category: 'Foundations', title: 'Register by surface',
    reveal: 'How your voice changes between social and owned copy — warmth vs formality, you vs we.',
    gates: (c) => [G('posts with copy', c.withCopy, 50)],
    finding: (c) => {
      const s = c.pat.surfaces?.find((x) => /social/i.test(x.surface))
      const o = c.pat.surfaces?.find((x) => /own|web|site/i.test(x.surface))
      if (!s && !o) return undefined
      const parts: string[] = []
      if (s) parts.push(`social is ${Math.round(s.firstPersonPct)}% first-person, ${Math.round(s.questionPct)}% questions`)
      if (o) parts.push(`owned is ${Math.round(o.definitionalPct)}% definitional`)
      return parts.join(' · ')
    },
  },
  {
    id: 'flow', category: 'Foundations', title: 'Content flow map', where: 'Library › Insights · Map',
    reveal: 'How your content links together and where every post sends people next.',
    gates: (c) => [G('posts mapped', c.items.length, 80)],
    finding: (c) => (c.flow ? `${c.flow.overall.deadEndPct}% of posts dead-end · the ones that connect mostly drive to ${c.flow.destinations[0]?.key ?? '—'} (${c.flow.destinations[0]?.count ?? 0})` : undefined),
  },
  {
    id: 'linkmap', category: 'Foundations', title: 'Link & destination map', where: 'Library › Insights · Map',
    reveal: 'Every place your copy points people — the platforms and pages you actually route to.',
    gates: (c) => [G('posts with copy', c.withCopy, 40)],
    finding: (c) => (c.links[0] ? `Copy points most often to ${c.links[0].host} (×${c.links[0].count})` : undefined),
  },
  {
    id: 'proof-coverage', category: 'Foundations', title: 'Proof-point coverage', where: 'Library › Insights',
    reveal: 'How many of your brand proof points ever actually appear in the copy, and which never do.',
    gates: (c) => [G('proof points defined', c.proofDefined, 5), G('posts with copy', c.withCopy, 40)],
    finding: (c) => `${c.cov.proof.used} of ${c.cov.proof.total} proof points appear in the copy · ${c.cov.proof.unused.length} never said`,
  },

  // ───────────────────────── Message performance ─────────────────────────
  {
    id: 'proof', category: 'Message performance', title: 'Proof-point performance', where: 'Library › Insights',
    reveal: 'Which of your proof points actually earn engagement, ranked by what the content drove.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 40)],
    finding: (c) => {
      const p = c.cov.proof.performing[0]
      return p ? `Top proof point: “${clip(p.label, 40)}” drove ${compact(p.outcome ?? 0)} across ${p.hits} posts` : undefined
    },
  },
  {
    id: 'hook-shapes', category: 'Message performance', title: 'Hook shapes', where: 'Library › Insights',
    reveal: 'Which title shape — question, how-to, provocative claim — earns the most.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => {
      const p = [...(c.sig.patterns ?? [])].sort((a, b) => b.avgReach - a.avgReach)[0]
      return p ? `Best-performing shape: ${p.shape} (avg ${formatReach(p.avgReach)}, ${p.count} posts)` : undefined
    },
  },
  {
    id: 'voice-lift', category: 'Message performance', title: 'Voice traits that lift',
    reveal: 'Which voice moves — speaking to “you”, commands, provocation — lift reach above par.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => {
      const v = [...(c.sig.voice ?? [])].sort((a, b) => b.lift - a.lift)[0]
      return v ? `“${v.trait}” titles pull ${v.lift.toFixed(1)}× the average reach` : undefined
    },
  },
  {
    id: 'length', category: 'Message performance', title: 'Length sweet spot',
    reveal: 'The title / copy length band that earns the most reach.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => {
      const b = [...(c.sig.lengthBands ?? [])].sort((a, b) => b.avgReach - a.avgReach)[0]
      return b ? `Sweet spot: ${b.band} (avg ${formatReach(b.avgReach)})` : undefined
    },
  },
  {
    id: 'openers', category: 'Message performance', title: 'Opening words',
    reveal: 'The words your best titles most often open with.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => {
      const o = [...(c.sig.openers ?? [])].sort((a, b) => b.avgReach - a.avgReach)[0]
      return o ? `Strongest opener: “${o.word}” (avg ${formatReach(o.avgReach)}, ${o.count}×)` : undefined
    },
  },
  {
    id: 'question-lift', category: 'Message performance', title: 'Question vs statement',
    reveal: 'Whether asking a question in the copy actually earns more than stating.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => (c.qLift > 0 ? `Posts that ask a question earn ${c.qLift.toFixed(1)}× the engagement` : undefined),
  },
  {
    id: 'cta', category: 'Message performance', title: 'CTA effectiveness', where: 'Library › Insights',
    reveal: 'Which calls to action you actually make in the copy, and which you never say out loud.',
    gates: (c) => [G('CTAs defined', c.ctasDefined, 3)],
    finding: (c) => {
      const used = [...c.cov.cta.items].filter((x) => x.hits > 0).sort((a, b) => b.hits - a.hits)[0]
      const never = c.cov.cta.items.filter((x) => x.hits === 0).length
      return used ? `Most-made ask: “${clip(used.label, 30)}” (${used.hits} posts)${never ? ` · ${never} never said` : ''}` : never ? `${never} defined CTAs are never actually said` : undefined
    },
  },
  {
    id: 'asks', category: 'Message performance', title: 'The asks you make',
    reveal: 'The calls to action pulled from your body copy, ranked by the engagement they earn.',
    gates: (c) => [G('posts with copy', c.withCopy, 60)],
    finding: (c) => {
      const a = [...(c.sig.asks ?? [])].sort((x, y) => y.avgEng - x.avgEng)[0]
      return a ? `Best-earning ask: “${clip(a.ask, 32)}” (avg ${compact(a.avgEng)} eng, ${a.count} posts)` : undefined
    },
  },
  {
    id: 'concentration', category: 'Message performance', title: 'Reach concentration',
    reveal: 'How top-heavy your reach is — the share that comes from your best handful of posts.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 50)],
    finding: (c) => `Your top 10% of posts drive ${c.top10Share}% of all reach`,
  },
  {
    id: 'breakouts', category: 'Message performance', title: 'Breakout detector',
    reveal: 'The posts that vastly outran their channel’s typical reach — your repeatable winners.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 60)],
    finding: (c) => {
      const b = c.sig.breakouts?.[0]
      return b ? `Biggest breakout: “${clip(b.title, 40)}” (${formatReach(b.reach)})` : undefined
    },
  },

  // ───────────────────────── Audience ─────────────────────────
  {
    id: 'audience', category: 'Audience', title: 'Audience resonance',
    reveal: 'Which segment responds to which message, so you write to the person and not the crowd.',
    gates: (c) => [G('assets tagged to an audience', c.tagged, 40)],
    finding: (c) => {
      const a = c.aud.defined?.find((d) => d.count > 0)
      return a ? `Most content speaks to ${a.label} (${a.count} assets) · ${c.aud.tagged}/${c.aud.total} tagged` : undefined
    },
  },
  {
    id: 'audience-coverage', category: 'Audience', title: 'Segment coverage',
    reveal: 'Whether every named audience actually has content, or some are starved.',
    gates: (c) => [G('audiences defined', c.audiencesDefined, 3), G('assets tagged', c.tagged, 30)],
    finding: (c) => {
      const covered = c.aud.defined.filter((d) => d.count > 0).length
      const starved = c.aud.defined.filter((d) => d.count === 0)
      return `${covered}/${c.aud.defined.length} segments have content${starved.length ? ` · starved: ${starved.slice(0, 2).map((s) => s.label).join(', ')}` : ''}`
    },
  },
  {
    id: 'topics', category: 'Audience', title: 'Topic performance', where: 'Library › Insights',
    reveal: 'Which subjects and themes drive subscribers, not just which get posted most.',
    gates: (c) => [G('posts with copy', c.withCopy, 60)],
    finding: (c) => {
      const t = c.sig.topics?.[0]
      return t ? `Top subject: ${t.topic} — ${compact(t.subs)} subs across ${t.count} posts` : undefined
    },
  },
  {
    id: 'off-list', category: 'Audience', title: 'Audience drift',
    reveal: 'Content tagged to audiences that are not in your defined set — where targeting is wandering.',
    gates: (c) => [G('assets tagged', c.tagged, 40)],
    finding: (c) => (c.aud.offList.length ? `${c.aud.offList.length} off-list tags · biggest: “${c.aud.offList[0].label}” (${c.aud.offList[0].count})` : 'No drift: every tag maps to a defined audience'),
  },
  {
    id: 'proof-per-audience', category: 'Audience', title: 'Proof by audience',
    reveal: 'Which proof point lands with which segment — the message-to-market match, measured.',
    gates: (c) => [G('assets tagged', c.tagged, 80), G('assets with metrics', c.withMetrics, 80)],
  },

  // ───────────────────────── Channel & flow ─────────────────────────
  {
    id: 'attribution', category: 'Channel & flow', title: 'Channel attribution', where: 'Library › Insights',
    reveal: 'Which channel earns the reach and which drives subscribers, measured side by side.',
    gates: (c) => [G('channels with metrics', c.channelsWithMetrics, 3)],
    finding: (c) => {
      const r = [...c.sig.channels].sort((a, b) => b.reach - a.reach)[0]
      const s = [...c.sig.channels].filter((x) => x.subs > 0).sort((a, b) => b.subs - a.subs)[0]
      return r ? `${channelName(r.channel)} earns the most reach${s ? `; ${channelName(s.channel)} drives the most subscribers` : ''}` : undefined
    },
  },
  {
    id: 'channel-roles', category: 'Channel & flow', title: 'Channel roles',
    reveal: 'What each channel actually does for you — reach, engagement, or subscribers.',
    gates: (c) => [G('channels with metrics', c.channelsWithMetrics, 3)],
    finding: (c) => {
      const rolled = [...c.sig.channels].sort((a, b) => b.reach - a.reach).slice(0, 3)
      return rolled.length ? rolled.map((r) => `${channelName(r.channel)}: ${r.role}`).join(' · ') : undefined
    },
  },
  {
    id: 'dead-end-cost', category: 'Channel & flow', title: 'Dead-end cost',
    reveal: 'How much reach evaporates on posts that link nowhere onward — the price of not asking.',
    gates: (c) => [G('posts mapped', c.items.length, 80), G('assets with metrics', c.withMetrics, 40)],
    finding: (c) => (c.flow ? `${formatReach(c.deadEndReach)} of reach lands on dead-end posts (${c.flow.deadEnds.length} posts link nowhere)` : undefined),
  },
  {
    id: 'destination-mix', category: 'Channel & flow', title: 'Destination mix',
    reveal: 'Where your copy actually routes people — the split across newsletter, podcast, site, donate.',
    gates: (c) => [G('posts with copy', c.withCopy, 60)],
    finding: (c) => {
      const d = c.flow?.destinations?.slice(0, 3)
      return d?.length ? `Routes mostly to ${d.map((x) => `${x.key} (${x.count})`).join(', ')}` : undefined
    },
  },
  {
    id: 'cross-channel', category: 'Channel & flow', title: 'Cross-channel lift', where: 'Reports',
    reveal: 'Whether one channel feeds the others: does YouTube move the site and the newsletter?',
    gates: (c) => [G('connected data sources', c.connected, 3)],
    finding: (c) => `Owned channels (site, email) carry ${c.ownedPct}% of reach; the rest lives on platforms you don't own`,
  },

  // ───────────────────────── Timing & cadence ─────────────────────────
  {
    id: 'best-day', category: 'Timing & cadence', title: 'Best day to post', where: 'Library › Insights',
    reveal: 'Your best weekday, learned from what actually earned reach.',
    gates: (c) => [timeG(c, 45), G('assets with metrics', c.withMetrics, 30)],
    finding: (c) => {
      const d = c.sig.days?.[0]
      return d ? `Best day: ${d.day} (avg ${formatReach(d.avgReach)} reach)` : undefined
    },
  },
  {
    id: 'rhythm', category: 'Timing & cadence', title: 'Posting rhythm',
    reveal: 'How often you actually publish, and how steady it is.',
    gates: (c) => [timeG(c, 60)],
    finding: (c) => `${c.postsPerWeek} posts/week on average over ${c.days} days`,
  },
  {
    id: 'gaps', category: 'Timing & cadence', title: 'Cadence gaps',
    reveal: 'Your longest silence — the gaps where the audience went cold.',
    gates: (c) => [timeG(c, 90)],
    finding: (c) => `Longest gap between posts: ${c.longestGapDays} days`,
  },
  {
    id: 'cadence-phrases', category: 'Timing & cadence', title: 'Promised cadence',
    reveal: 'The publishing cadence you promise in the copy (“every other Thursday”) vs what you keep.',
    gates: (c) => [G('posts with copy', c.withCopy, 60)],
    finding: (c) => (c.sig.cadence?.length ? `You promise: ${c.sig.cadence.slice(0, 2).join(', ')}` : 'No cadence promised in the copy yet'),
  },
  {
    id: 'day-x-message', category: 'Timing & cadence', title: 'Message × day',
    reveal: 'Which kind of message works best on which day — the calendar-level pattern.',
    gates: (c) => [timeG(c, 120), G('assets with metrics', c.withMetrics, 80)],
  },

  // ───────────────────────── Trends over time ─────────────────────────
  {
    id: 'reach-trend', category: 'Trends over time', title: 'Reach trend',
    reveal: 'Whether your reach per post is climbing or sliding across your history.',
    gates: (c) => [timeG(c, 90), G('assets with metrics', c.withMetrics, 40)],
    finding: (c) => `Reach per post is ${c.reachTrendPct >= 0 ? 'up' : 'down'} ${signed(c.reachTrendPct)}% from your first half to your latest`,
  },
  {
    id: 'engagement-trend', category: 'Trends over time', title: 'Engagement trend',
    reveal: 'Whether people are responding more or less to your copy over time.',
    gates: (c) => [timeG(c, 90), G('assets with metrics', c.withMetrics, 40)],
    finding: (c) => `Engagement per post is ${signed(c.engTrendPct)}% across your history`,
  },
  {
    id: 'momentum', category: 'Trends over time', title: 'Momentum',
    reveal: 'The last 30 days vs the 30 before — are you accelerating right now?',
    gates: (c) => [timeG(c, 60), G('assets with metrics', c.withMetrics, 30)],
    finding: (c) => `Last 30 days vs the prior 30: reach per post ${signed(c.momentumPct)}%`,
  },
  {
    id: 'subs-trend', category: 'Trends over time', title: 'Subscriber trend',
    reveal: 'Whether your content is converting to subscribers at a rising or falling rate.',
    gates: (c) => [timeG(c, 90), G('posts reporting subscribers', c.postsWithSubs, 20)],
    finding: (c) => `Subscribers per post are ${signed(c.subsTrendPct)}% over time`,
  },
  {
    id: 'message-durability', category: 'Trends over time', title: 'Message durability',
    reveal: 'Which messages still work and which have decayed — the shelf life of your best lines.',
    gates: (c) => [timeG(c, 120), G('assets with metrics', c.withMetrics, 80)],
  },
  {
    id: 'voice-drift', category: 'Trends over time', title: 'Voice drift',
    reveal: 'How your language has shifted over time — the words you have picked up and dropped.',
    gates: (c) => [timeG(c, 150), G('posts with copy', c.withCopy, 100)],
  },
  {
    id: 'evergreen', category: 'Trends over time', title: 'Evergreen vs spike',
    reveal: 'Which posts keep earning long after publishing vs which spiked and died.',
    gates: (c) => [timeG(c, 120), G('connected data sources', c.connected, 2), G('assets with metrics', c.withMetrics, 80)],
  },

  // ───────────────────────── Conversion & funnel ─────────────────────────
  {
    id: 'subscribers', category: 'Conversion & funnel', title: 'Subscriber drivers', where: 'Library › Insights',
    reveal: 'The specific content that converts viewers to subscribers, by subscribe rate.',
    gates: (c) => [G('posts reporting subscribers', c.postsWithSubs, 15)],
    finding: (c) => {
      const conv = c.sig.converters?.[0]
      return conv ? `Best converter: “${clip(conv.title, 42)}” at ${((conv.rate ?? 0) * 100).toFixed(2)}% subscribe rate` : undefined
    },
  },
  {
    id: 'owned-conversion', category: 'Conversion & funnel', title: 'Reach → owned audience',
    reveal: 'What share of your reach you actually keep as an audience you own and can re-reach.',
    gates: (c) => [G('connected data sources', c.connected, 2), timeG(c, 60)],
  },
  {
    id: 'form-funnel', category: 'Conversion & funnel', title: 'Form & signup funnel',
    reveal: 'Where people fall out between reach, form-start, and completed signup.',
    gates: (c) => [G('connected data sources', c.connected, 2), timeG(c, 30)],
  },
  {
    id: 'dead-end-recovery', category: 'Conversion & funnel', title: 'Dead-end recovery',
    reveal: 'Your highest-reach posts with no next step — the fastest conversions to win back.',
    gates: (c) => [G('posts mapped', c.items.length, 80)],
    finding: (c) => (c.flow ? `${c.flow.deadEnds.length} dead-end posts carrying ${formatReach(c.deadEndReach)} of reach are one link away from converting` : undefined),
  },

  // ───────────────────────── Forecasting ─────────────────────────
  {
    id: 'content-gaps', category: 'Forecasting', title: 'Content gaps',
    reveal: 'The proof points and topics you never post — a made-for-you list of what to write next.',
    gates: (c) => [G('proof points defined', c.proofDefined, 5), G('posts with copy', c.withCopy, 60)],
    finding: (c) => (c.cov.proof.unused.length ? `${c.cov.proof.unused.length} proof points you have never posted, starting with “${clip(c.cov.proof.unused[0].label, 40)}”` : 'Every proof point has been used at least once'),
  },
  {
    id: 'forecast', category: 'Forecasting', title: 'Reach forecasting',
    reveal: 'A predicted reach range for a post before you publish it, from your own track record.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 200), timeG(c, 90)],
  },
  {
    id: 'best-next-post', category: 'Forecasting', title: 'Best next post',
    reveal: 'A recommended angle, channel, and hook for your next post, from what has driven subscribers.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 120), timeG(c, 90)],
  },
  {
    id: 'saturation', category: 'Forecasting', title: 'Channel saturation',
    reveal: 'Whether more posting on a channel is still working or hitting diminishing returns.',
    gates: (c) => [timeG(c, 120), G('assets with metrics', c.withMetrics, 100)],
  },

  // ───────────────────────── Money & mission ─────────────────────────
  {
    id: 'donor-path', category: 'Money & mission', title: 'Donor conversion path',
    reveal: 'The whole path from reach to owned audience to donor, once the donor system is linked.',
    gates: (c) => [G('systems linked (analytics + donor)', c.systemsLinked, 2)],
  },
  {
    id: 'message-to-donation', category: 'Money & mission', title: 'Message → donation',
    reveal: 'Which messages and campaigns precede donation spikes — content ROI in dollars.',
    gates: (c) => [G('systems linked (analytics + donor)', c.systemsLinked, 2), timeG(c, 90)],
  },
  {
    id: 'donor-cohorts', category: 'Money & mission', title: 'Donor cohorts & LTV',
    reveal: 'How donor cohorts retain and what they are worth over time.',
    gates: (c) => [G('systems linked (analytics + donor)', c.systemsLinked, 2), timeG(c, 365)],
  },

  // ───────────────────────── Seasonality & maturity ─────────────────────────
  {
    id: 'seasonality', category: 'Seasonality & maturity', title: 'Seasonality',
    reveal: 'Seasonal lift and the times of year your content and asks land best.',
    gates: (c) => [timeG(c, 365)],
  },
  {
    id: 'yoy', category: 'Seasonality & maturity', title: 'Year-over-year',
    reveal: 'This year vs last, message by message and channel by channel.',
    gates: (c) => [timeG(c, 365), G('assets with metrics', c.withMetrics, 150)],
  },
  {
    id: 'maturity', category: 'Seasonality & maturity', title: 'Maturity curve',
    reveal: 'The long arc of the brand: how reach, conversion, and message mix have matured.',
    gates: (c) => [timeG(c, 540)],
  },
]

// ── Channel expansion: channels not tried yet (or barely) surface as locked opportunities,
//    each opening into a performance read once you have posted there enough to measure. ──
const EXPANSION_CHANNELS: { id: string; label: string; re: RegExp; threshold: number; reveal: string }[] = [
  { id: 'exp-linkedin', label: 'LinkedIn, at cadence', re: /linkedin/i, threshold: 30, reveal: 'A handful of posts and a frozen follower count tells you nothing. A real weekly cadence would say whether LinkedIn converts the professional audience you sell to.' },
  { id: 'exp-tiktok', label: 'TikTok', re: /tiktok/i, threshold: 15, reveal: 'Whether the short-form engine that broke out on YouTube Shorts transfers to a second discovery feed with its own audience.' },
  { id: 'exp-x', label: 'X / Twitter', re: /twitter|(^|[^a-z])x([^a-z]|$)/i, threshold: 20, reveal: 'Whether your category conversation on X drives real traffic and puts you in front of journalists and buyers.' },
  { id: 'exp-threads', label: 'Threads', re: /threads/i, threshold: 20, reveal: 'A text-first feed adjacent to your Instagram audience: does the same message land in a different room?' },
  { id: 'exp-reddit', label: 'Reddit', re: /reddit/i, threshold: 10, reveal: 'Whether the subreddits built around your category convert people who are already searching for it.' },
  { id: 'exp-substack', label: 'Substack / Notes', re: /substack/i, threshold: 12, reveal: 'A native-discovery newsletter platform where recommendations from adjacent writers grow the owned list you keep.' },
  { id: 'exp-sms', label: 'SMS / text list', re: /\bsms\b|text/i, threshold: 8, reveal: 'The highest-intent owned channel there is: whether a text list moves donors and event RSVPs the way email cannot.' },
  { id: 'exp-podcast-guest', label: 'Podcast guesting', re: /guest/i, threshold: 5, reveal: 'Appearing on other shows borrows audiences of exactly your listener for the cost of an hour. Which shows drive subscribers?' },
  { id: 'exp-own-podcast', label: 'Own podcast, at cadence', re: /podcast/i, threshold: 10, reveal: 'Whether your own show, on a steady cadence, builds a compounding owned audience or just a back catalog.' },
  { id: 'exp-pr', label: 'Earned media / PR', re: /press|earned|media hit/i, threshold: 6, reveal: 'Whether the inbound press you get unprompted would compound into real coverage if you actually pitched.' },
  { id: 'exp-partnerships', label: 'Partnerships & co-marketing', re: /partner|collab|co-?market/i, threshold: 4, reveal: 'Co-published content with an aligned organisation puts you in front of their trust and their list.' },
  { id: 'exp-referral', label: 'Member-get-member referral', re: /referral|refer a/i, threshold: 3, reveal: 'Whether your most engaged people will bring the next ones, the cheapest growth there is.' },
  { id: 'exp-community', label: 'Community (Discord / circle)', re: /discord|community|circle|slack/i, threshold: 3, reveal: 'A place for your audience to gather between posts: does an owned community lift retention?' },
]
const channelExpansionUnlocks: UnlockDef[] = EXPANSION_CHANNELS.map((d) => ({
  id: d.id,
  category: 'Channel expansion',
  title: d.label,
  reveal: d.reveal,
  gates: (c) => [G('posts on this channel', c.items.filter((r) => d.re.test(String(r.channel))).length, d.threshold)],
  finding: (c) => {
    const roll = c.sig.channels.find((ch) => d.re.test(String(ch.channel)))
    return roll ? `${channelName(roll.channel)}: ${roll.reachLabel} reach across ${roll.count} posts · ${roll.role.toLowerCase()}` : undefined
  },
}))

// ── Paid media: the distribution frontier a purely organic brand has never spent on. Every
//    unlock is gated on connecting an ad platform, so the category maps the paid opportunity.
//    Reveals here stay brand-neutral: this catalog renders for every brand, so a number or a
//    vertical borrowed from one of them would be read by everyone else as their own. ──
const PAID_UNLOCKS: UnlockDef[] = [
  { id: 'paid-social', category: 'Paid media', title: 'Paid social', reveal: 'Whether putting spend behind your best organic posts reaches the funders you can’t reach for free.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-search', category: 'Paid media', title: 'Paid search (SEM)', reveal: 'Buy the category queries you rank for but lose: the impressions that never turn into a click.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-youtube', category: 'Paid media', title: 'YouTube ads', reveal: 'Put spend behind the long-form that drives subscribers, aimed at the audience it already reaches.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-display', category: 'Paid media', title: 'Display & programmatic', reveal: 'Cheap reach across the open web: does it build awareness or just impressions?', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-retargeting', category: 'Paid media', title: 'Retargeting', reveal: 'Recover the people who watched or visited and then left without signing up, by far the larger group.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-sponsorship', category: 'Paid media', title: 'Podcast & newsletter sponsorships', reveal: 'Borrow the trust of a show or list whose audience is already your donor — measured in signups.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-creator', category: 'Paid media', title: 'Paid creator partnerships', reveal: 'Whether a creator your audience already follows can introduce you to their list profitably.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-vs-organic', category: 'Paid media', title: 'Paid vs organic efficiency', reveal: 'Which dollar and which hour works harder — the trade you can only see once both run.', gates: (c) => [G('connected ad platforms', c.adConnected, 1), G('assets with metrics', c.withMetrics, 40)] },
  { id: 'paid-cac-sub', category: 'Paid media', title: 'Cost per subscriber', reveal: 'What it actually costs to add one owned-audience member through paid — your real growth price.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
  { id: 'paid-cac-donor', category: 'Paid media', title: 'Cost per donor & payback', reveal: 'The number that decides the whole paid question: what a donor costs and how fast they pay back.', gates: (c) => [G('connected ad platforms', c.adConnected, 1), G('systems linked (analytics + donor)', c.systemsLinked, 2)] },
  { id: 'paid-lookalike', category: 'Paid media', title: 'Lookalike expansion', reveal: 'Build a paid audience that looks like your best converters and your existing donors.', gates: (c) => [G('connected ad platforms', c.adConnected, 1), G('posts reporting subscribers', c.postsWithSubs, 15)] },
  { id: 'paid-geo', category: 'Paid media', title: 'Geo-targeted paid', reveal: 'Concentrate spend on the regions your own reporting says your best audience already sits in.', gates: (c) => [G('connected ad platforms', c.adConnected, 1)] },
]

// ── Audience precision: moving from a few broad personas to hyper-specific segments. ──
const AUDIENCE_PRECISION: UnlockDef[] = [
  { id: 'aud-micro', category: 'Audience precision', title: 'Micro-segments', reveal: 'Beyond broad personas: segments narrow enough (one role, one city, one trigger) to write to individually.', gates: (c) => [G('audiences defined', c.audiencesDefined, 10)], finding: (c) => `${c.audiencesDefined} segments defined and growing more specific` },
  { id: 'aud-abm', category: 'Audience precision', title: 'ABM named accounts', reveal: 'Track engagement account by account — which specific funds and offices are actually reading you.', gates: (c) => [G('audiences defined', c.audiencesDefined, 8), G('assets tagged', c.tagged, 80)] },
  { id: 'aud-persona-channel', category: 'Audience precision', title: 'Persona × channel fit', reveal: 'Which segment to reach on which channel — the map of where each audience actually lives.', gates: (c) => [G('assets tagged', c.tagged, 80), G('channels with metrics', c.channelsWithMetrics, 3)] },
  { id: 'aud-firmographic', category: 'Audience precision', title: 'Firmographic segments', reveal: 'Group funders by type and size (family office vs foundation vs DAF) and message each on its terms.', gates: (c) => [G('audiences defined', c.audiencesDefined, 8), G('assets tagged', c.tagged, 60)] },
  { id: 'aud-lifecycle', category: 'Audience precision', title: 'Lifecycle segments', reveal: 'New vs returning vs donor — different messages for strangers, followers, and supporters.', gates: (c) => [G('systems linked (analytics + donor)', c.systemsLinked, 2)] },
  { id: 'aud-lookalike', category: 'Audience precision', title: 'Lookalike of best converters', reveal: 'A profile of the people who actually subscribe and give, to go find more of them.', gates: (c) => [G('posts reporting subscribers', c.postsWithSubs, 15), G('assets with metrics', c.withMetrics, 80)] },
  { id: 'aud-geo-wealth', category: 'Audience precision', title: 'Geographic concentration', reveal: 'The cities and regions you already over-index in, ranked, so you can target where you are strong.', gates: (c) => [G('connected data sources', c.connected, 1)], finding: (c) => `Geography is live across ${c.connected} sources; the concentration is ready to target` },
  { id: 'aud-overlap', category: 'Audience precision', title: 'Audience overlap', reveal: 'Where your segments blur into each other, so you stop paying twice to reach the same person.', gates: (c) => [G('audiences defined', c.audiencesDefined, 8), G('assets tagged', c.tagged, 100)] },
]

// ── Search, SEO & AEO: the keyword and answer-engine frontier. ──
const SEO_UNLOCKS: UnlockDef[] = [
  { id: 'seo-titles', category: 'Search, SEO & AEO', title: 'SEO title & meta coverage', reveal: 'How many pages carry an intentional search title and description vs default text.', gates: (c) => [G('web / search pages in library', c.webAssets, 20)], finding: (c) => `${c.webAssets} web pages ingested with their SEO title and meta` },
  { id: 'seo-rankings', category: 'Search, SEO & AEO', title: 'Keyword rankings', reveal: 'Every query you rank for and where you sit — the map of the search demand you already touch.', gates: (c) => [G('search source connected', c.searchConnected, 1)] },
  { id: 'seo-gap', category: 'Search, SEO & AEO', title: 'Keyword & concept gaps', reveal: 'Queries you rank for but lose: the category language that draws impressions and no clicks.', gates: (c) => [G('search source connected', c.searchConnected, 1)] },
  { id: 'seo-branded', category: 'Search, SEO & AEO', title: 'Branded vs non-branded', reveal: 'How much of your search comes from your name vs the idea — the difference between fame and demand.', gates: (c) => [G('search source connected', c.searchConnected, 1)] },
  { id: 'seo-ctr', category: 'Search, SEO & AEO', title: 'CTR by query', reveal: 'Which titles earn the click at the position they hold — where a rewrite pays off fastest.', gates: (c) => [G('search source connected', c.searchConnected, 1)] },
  { id: 'seo-rank-trend', category: 'Search, SEO & AEO', title: 'Rank movement over time', reveal: 'Which pages are climbing and which are slipping — SEO is a trend, not a snapshot.', gates: (c) => [G('search source connected', c.searchConnected, 1), timeG(c, 90)] },
  { id: 'seo-content-fit', category: 'Search, SEO & AEO', title: 'Content ↔ query fit', reveal: 'Whether each page targets a real query, and which pages have no search purpose at all.', gates: (c) => [G('search source connected', c.searchConnected, 1), G('web / search pages', c.webAssets, 20)] },
  { id: 'aeo-presence', category: 'Search, SEO & AEO', title: 'AEO / AI-answer presence', reveal: 'Whether AI answer engines name you when someone asks the questions your category is built on.', gates: () => [G('AEO tracking connected', 0, 1)] },
  { id: 'aeo-coverage', category: 'Search, SEO & AEO', title: 'Answer-content coverage', reveal: 'Whether you have the plain question-and-answer pages the answer engines pull from.', gates: (c) => [G('web / search pages', c.webAssets, 30), G('posts with copy', c.withCopy, 60)], finding: (c) => `${c.webAssets} pages could carry structured answers for the concept queries people already ask` },
  { id: 'seo-authority', category: 'Search, SEO & AEO', title: 'Internal linking & authority', reveal: 'How authority flows across your pages — which need links to climb from page two to page one.', gates: (c) => [G('web / search pages', c.webAssets, 25), G('posts with copy', c.withCopy, 60)] },
  { id: 'seo-nonbrand', category: 'Search, SEO & AEO', title: 'Non-brand demand growth', reveal: 'Whether the idea itself is drawing more searchers over time, independent of your name.', gates: (c) => [G('search source connected', c.searchConnected, 1), timeG(c, 120)] },
]

const CATALOG: UnlockDef[] = [
  ...BASE_CATALOG,
  ...channelExpansionUnlocks,
  ...PAID_UNLOCKS,
  ...AUDIENCE_PRECISION,
  ...SEO_UNLOCKS,
]

// A concrete sample of the outcome each unlock will tell — shown on locked cards so the
// payoff is tangible before you've earned it. Illustrative, not this brand's real numbers.
const UNLOCK_EXAMPLES: Record<string, string> = {
  catalog: '“1.1M reach across 175 assets; biggest channel: Instagram”',
  patterns: '“Most-repeated line: ‘Join the movement’ — 20×”',
  register: '“Social is 65% first-person; owned is 44% definitional”',
  flow: '“52% of posts dead-end; the rest drive to the podcast”',
  linkmap: '“Copy points most often to instagram.com”',
  'proof-coverage': '“19 of 53 proof points appear in the copy; 34 never said”',
  proof: '“‘A movement you can join’ drove 1.1k across 20 posts”',
  'hook-shapes': '“How-to titles pull the most reach; questions the most engagement”',
  'voice-lift': '“‘Provocation’ titles pull 5× average reach”',
  length: '“11+ word titles earn the most reach”',
  openers: '“Titles opening with ‘How’ perform best”',
  'question-lift': '“Posts that ask a question earn 4× the engagement”',
  cta: '“Most-made ask: ‘Listen to the podcast’; 3 CTAs never said”',
  asks: '“‘Subscribe’ earns the most engagement of any ask”',
  concentration: '“Your top 10% of posts drive 93% of reach”',
  breakouts: '“Your biggest breakout beat its channel median 40×”',
  audience: '“Most content speaks to Impact Investors (62 assets)”',
  'audience-coverage': '“5 of 7 segments have content; 2 are starved”',
  topics: '“‘Community ownership’ drives the most subscribers”',
  'off-list': '“12 posts tagged to audiences not in your set”',
  'proof-per-audience': '“‘Patient capital’ lands with funders, not donors”',
  attribution: '“YouTube earns the most reach; long-form drives subs”',
  'channel-roles': '“Instagram: reach · Email: retention · YouTube: subscribers”',
  'dead-end-cost': '“480k of reach lands on posts that link nowhere”',
  'destination-mix': '“Copy routes mostly to podcast, then newsletter, then donate”',
  'cross-channel': '“Owned channels carry 4% of reach; the rest lives on platforms”',
  'best-day': '“Best day to post: Monday (avg 23k reach)”',
  rhythm: '“3.2 posts/week on average”',
  gaps: '“Longest silence between posts: 18 days”',
  'cadence-phrases': '“You promise ‘every other Thursday’”',
  'day-x-message': '“Questions land best on Mondays; how-tos on Thursdays”',
  'reach-trend': '“Reach per post is up 24% across your history”',
  'engagement-trend': '“Engagement per post is down 8% over time”',
  momentum: '“Last 30 days vs the prior 30: reach per post +40%”',
  'subs-trend': '“Subscribers per post are up 15% over time”',
  'message-durability': '“‘A better bank’ still works; ‘do-gooders’ has decayed”',
  'voice-drift': '“You ask fewer questions than you did six months ago”',
  evergreen: '“3 posts still earn views months later; the rest spiked and died”',
  subscribers: '“Best converter: ‘How Moral Ambition…’ at a 0.04% subscribe rate”',
  'owned-conversion': '“You keep 0.002% of reach as an audience you own”',
  'form-funnel': '“62% of form-starts never finish signup”',
  'dead-end-recovery': '“91 high-reach posts are one link from converting”',
  'content-gaps': '“34 proof points you’ve never posted, starting with…”',
  forecast: '“This post will likely land 20k–35k views”',
  'best-next-post': '“Post a long-form ‘better bank’ explainer on YouTube next”',
  saturation: '“A 4th weekly Instagram post adds almost no new reach”',
  'donor-path': '“3% of newsletter joiners become donors within 60 days”',
  'message-to-donation': '“‘Community Ownership Fund’ posts precede donation spikes”',
  'donor-cohorts': '“2025 donors give 1.8× more in year two”',
  seasonality: '“Giving asks land 2× better in November”',
  yoy: '“Reach is up 3× vs this month last year”',
  maturity: '“Reach per post has tripled since launch”',
  'exp-linkedin': '“LinkedIn: 12k reach across 30 posts, funder engagement”',
  'exp-tiktok': '“TikTok: 80k reach across 15 posts, a second reach engine”',
  'exp-x': '“X: 9k reach, drives site visits and journalist follows”',
  'exp-threads': '“Threads: 6k reach, warm to your Instagram audience”',
  'exp-reddit': '“Reddit: 4k reach from r/cooperatives, high intent”',
  'exp-substack': '“Substack: 800 new subscribers from recommendations”',
  'exp-sms': '“SMS: 40% open rate, your best RSVP driver”',
  'exp-podcast-guest': '“3 guest spots drove 120 subscribers”',
  'exp-own-podcast': '“Your show adds 200 owned listeners a month”',
  'exp-pr': '“6 press hits reached 400k and 3 funder inquiries”',
  'exp-partnerships': '“A CDFI co-post reached 20k of their list”',
  'exp-referral': '“1 in 8 supporters brought a new one”',
  'exp-community': '“Community members give 3× more often”',
  'paid-social': '“Paid social reaches funders at $12 per 1k”',
  'paid-search': '“You capture the 178 concept queries you now lose”',
  'paid-youtube': '“YouTube ads add subscribers at $0.40 each”',
  'paid-display': '“Display: cheap reach but 0.1% engaged”',
  'paid-retargeting': '“Retargeting recovers 8% of the visitors who left”',
  'paid-sponsorship': '“A podcast sponsorship drove 300 signups”',
  'paid-creator': '“A creator intro added 1.2k subscribers”',
  'paid-vs-organic': '“Organic reach costs half what paid does per view”',
  'paid-cac-sub': '“$3 to add one newsletter subscriber via paid”',
  'paid-cac-donor': '“$85 to acquire a donor; payback in 4 months”',
  'paid-lookalike': '“A lookalike of your donors converts 2× better”',
  'paid-geo': '“Spend in CA/NY/MA reaches funders at half the cost”',
  'aud-micro': '“‘NYC family offices, ESG mandate’ open 3× more”',
  'aud-abm': '“4 named funds are reading you weekly”',
  'aud-persona-channel': '“Reach funders on LinkedIn, donors on email”',
  'aud-firmographic': '“Family offices respond to patient-capital language”',
  'aud-lifecycle': '“Returning visitors convert 3× better than new ones”',
  'aud-lookalike': '“Your best converters are 45+, US, on desktop”',
  'aud-geo-wealth': '“Target CA, NY, MA, Singapore — where the money is”',
  'aud-overlap': '“40% of your ‘funders’ overlap with ‘press’”',
  'seo-titles': '“66 of 80 pages have an intentional title and meta”',
  'seo-rankings': '“You rank for 57 queries, most on page one’s floor”',
  'seo-gap': '“178 concept queries draw impressions and zero clicks”',
  'seo-branded': '“80% of search is your name, 20% the idea”',
  'seo-ctr': '“Your home title earns 4% at position 11 — a rewrite wins”',
  'seo-rank-trend': '“/about is climbing; /storytelling is slipping”',
  'seo-content-fit': '“9 pages target no real search query”',
  'aeo-presence': '“ChatGPT cites you for ‘community ownership’ 1 in 5 times”',
  'aeo-coverage': '“You answer 12 of the 30 questions people actually ask”',
  'seo-authority': '“Your home page needs 3 internal links to reach page one”',
  'seo-nonbrand': '“Non-brand demand for the idea is up 30% this year”',
}

/** Top-N ranked bars from a list, by value, positive only. */
function vbars<T>(rows: T[] | undefined, get: (r: T) => { label: string; value: number; display: string }, n = 4): UnlockVisual | undefined {
  const data = (rows ?? []).map(get).filter((d) => d.value > 0).sort((a, b) => b.value - a.value).slice(0, n)
  return data.length ? { kind: 'bars', data } : undefined
}

// Tone bands. up = higher is better (coverage); down = higher is worse (dead-end);
// delta = a signed change. Each pairs with a visible number, never color alone.
const upTone = (v: number): Tone => (v >= 0.66 ? 'good' : v >= 0.33 ? 'warn' : 'bad')
const downTone = (v: number): Tone => (v <= 0.25 ? 'good' : v <= 0.5 ? 'warn' : 'bad')
const deltaTone = (pct: number): Tone => (pct >= 5 ? 'good' : pct <= -5 ? 'bad' : 'warn')
const rtone = (part: number, whole: number): Tone => upTone(whole ? part / whole : 0)

/** The mini-visual for a finding, keyed by unlock id — the same numbers the finding text
 *  reads, drawn from the ingested library. Only chartable findings return one. */
function unlockVisual(id: string, c: Ctx): UnlockVisual | undefined {
  switch (id) {
    // Foundations
    case 'flow': {
      if (!c.flow) return undefined
      const v = c.flow.overall.deadEndPct / 100
      return { kind: 'meter', value: v, tone: downTone(v) }
    }
    case 'linkmap':
      return vbars(c.links, (l) => ({ label: l.host, value: l.count, display: `×${l.count}` }))
    case 'proof-coverage':
      return { kind: 'ratio', part: c.cov.proof.used, whole: c.cov.proof.total, tone: rtone(c.cov.proof.used, c.cov.proof.total) }
    // Message performance
    case 'proof':
      return vbars(c.cov.proof.performing, (p) => ({ label: p.label, value: p.outcome ?? 0, display: compact(p.outcome ?? 0) }))
    case 'hook-shapes':
      return vbars(c.sig.patterns, (p) => ({ label: p.shape, value: p.avgReach, display: formatReach(p.avgReach) }))
    case 'voice-lift':
      return vbars(c.sig.voice, (v) => ({ label: v.trait, value: v.lift, display: `${v.lift.toFixed(1)}×` }))
    case 'length':
      return vbars(c.sig.lengthBands, (b) => ({ label: b.band, value: b.avgReach, display: formatReach(b.avgReach) }))
    case 'openers':
      return vbars(c.sig.openers, (o) => ({ label: o.word, value: o.avgReach, display: formatReach(o.avgReach) }))
    case 'asks':
      return vbars(c.sig.asks, (a) => ({ label: a.ask, value: a.avgEng, display: compact(a.avgEng) }))
    case 'cta': {
      const used = c.cov.cta.items.filter((x) => x.hits > 0).length
      return { kind: 'ratio', part: used, whole: c.cov.cta.items.length, tone: rtone(used, c.cov.cta.items.length) }
    }
    case 'concentration':
      return { kind: 'meter', value: c.top10Share / 100 }
    // Audience
    case 'audience':
      return { kind: 'ratio', part: c.aud.tagged, whole: c.aud.total, tone: rtone(c.aud.tagged, c.aud.total) }
    case 'audience-coverage': {
      const covered = c.aud.defined.filter((d) => d.count > 0).length
      return { kind: 'ratio', part: covered, whole: c.aud.defined.length, tone: rtone(covered, c.aud.defined.length) }
    }
    case 'topics':
      return vbars(c.sig.topics, (t) => ({ label: t.topic, value: t.subs, display: compact(t.subs) }))
    // Channel & flow
    case 'destination-mix':
      return vbars(c.flow?.destinations, (d) => ({ label: d.key, value: d.count, display: `${d.count}` }))
    case 'cross-channel':
      return { kind: 'meter', value: c.ownedPct / 100, tone: upTone(c.ownedPct / 100) }
    // Timing
    case 'best-day':
      return vbars(c.sig.days, (d) => ({ label: d.day, value: d.avgReach, display: formatReach(d.avgReach) }))
    // Conversion
    case 'subscribers':
      return vbars(c.sig.converters, (cv) => ({ label: cv.title, value: cv.rate ?? 0, display: `${((cv.rate ?? 0) * 100).toFixed(2)}%` }))
    // Trends over time — signed change from a center baseline
    case 'reach-trend':
      return { kind: 'delta', pct: c.reachTrendPct, tone: deltaTone(c.reachTrendPct) }
    case 'engagement-trend':
      return { kind: 'delta', pct: c.engTrendPct, tone: deltaTone(c.engTrendPct) }
    case 'momentum':
      return { kind: 'delta', pct: c.momentumPct, tone: deltaTone(c.momentumPct) }
    case 'subs-trend':
      return { kind: 'delta', pct: c.subsTrendPct, tone: deltaTone(c.subsTrendPct) }
    default:
      return undefined
  }
}

export function computeDataUnlocks(inp: UnlockInputs): DataProgress {
  const c = buildCtx(inp)

  const unlocks: DataUnlock[] = CATALOG.map((def) => {
    const gates = def.gates(c)
    const unlocked = gates.every((g) => g.current >= g.threshold)
    // The binding gate is the least-satisfied one; its progress drives the bar and label.
    const binding = gates
      .map((g) => ({ g, ratio: g.threshold ? g.current / g.threshold : 1 }))
      .sort((a, b) => a.ratio - b.ratio)[0]
    const progress = Math.max(0, Math.min(1, binding?.ratio ?? 0))
    const finding = unlocked && def.finding ? def.finding(c) : undefined
    return {
      id: def.id, category: def.category, title: def.title, reveal: def.reveal,
      metric: binding?.g.metric ?? '', current: binding?.g.current ?? 0, threshold: binding?.g.threshold ?? 0,
      unlocked, progress, finding, example: UNLOCK_EXAMPLES[def.id], where: def.where,
      gated: unlocked ? undefined : binding?.g.metric,
      sources: gates.map((g) => ({ metric: g.metric, current: g.current })),
      visual: unlocked && finding ? unlockVisual(def.id, c) : undefined,
    }
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

  const byCategory = CATEGORY_ORDER.map((category) => {
    const list = unlocks.filter((u) => u.category === category)
    return { category, unlocks: list, unlocked: list.filter((u) => u.unlocked).length }
  }).filter((g) => g.unlocks.length > 0)

  return {
    unlocks, byCategory, unlockedCount, total, pctComplete: total ? unlockedCount / total : 0,
    level: level + 1, levelName: LEVEL_NAMES[level] ?? 'Omniscient', nextLevelAt, points, maxPoints: total * 100, next,
  }
}

void num
