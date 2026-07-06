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
  | 'Channel & flow'
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
  'Channel & flow',
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
  where?: string
  gated?: string // a short note on what still gates it (the binding gate), when locked
}

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
    longestGapDays, sig, cov, flow, aud, links, pat,
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

const CATALOG: UnlockDef[] = [
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
    id: 'patterns', category: 'Foundations', title: 'Messaging patterns', where: 'Library › Signals · Reports',
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
    id: 'flow', category: 'Foundations', title: 'Content flow map', where: 'Library › Map',
    reveal: 'How your content links together and where every post sends people next.',
    gates: (c) => [G('posts mapped', c.items.length, 80)],
    finding: (c) => (c.flow ? `${c.flow.overall.deadEndPct}% of posts dead-end · the ones that connect mostly drive to ${c.flow.destinations[0]?.key ?? '—'} (${c.flow.destinations[0]?.count ?? 0})` : undefined),
  },
  {
    id: 'linkmap', category: 'Foundations', title: 'Link & destination map', where: 'Library › Map',
    reveal: 'Every place your copy points people — the platforms and pages you actually route to.',
    gates: (c) => [G('posts with copy', c.withCopy, 40)],
    finding: (c) => (c.links[0] ? `Copy points most often to ${c.links[0].host} (×${c.links[0].count})` : undefined),
  },
  {
    id: 'proof-coverage', category: 'Foundations', title: 'Proof-point coverage', where: 'Library › Signals',
    reveal: 'How many of your brand proof points ever actually appear in the copy, and which never do.',
    gates: (c) => [G('proof points defined', c.proofDefined, 5), G('posts with copy', c.withCopy, 40)],
    finding: (c) => `${c.cov.proof.used} of ${c.cov.proof.total} proof points appear in the copy · ${c.cov.proof.unused.length} never said`,
  },

  // ───────────────────────── Message performance ─────────────────────────
  {
    id: 'proof', category: 'Message performance', title: 'Proof-point performance', where: 'Library › Signals',
    reveal: 'Which of your proof points actually earn engagement, ranked by what the content drove.',
    gates: (c) => [G('assets with metrics', c.withMetrics, 40)],
    finding: (c) => {
      const p = c.cov.proof.performing[0]
      return p ? `Top proof point: “${clip(p.label, 40)}” drove ${compact(p.outcome ?? 0)} across ${p.hits} posts` : undefined
    },
  },
  {
    id: 'hook-shapes', category: 'Message performance', title: 'Hook shapes', where: 'Library › Signals',
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
    id: 'cta', category: 'Message performance', title: 'CTA effectiveness', where: 'Library › Signals',
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
    id: 'topics', category: 'Audience', title: 'Topic performance', where: 'Library › Signals',
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
    id: 'attribution', category: 'Channel & flow', title: 'Channel attribution', where: 'Library › Signals',
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
    id: 'best-day', category: 'Timing & cadence', title: 'Best day to post', where: 'Library › Signals',
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
    id: 'subscribers', category: 'Conversion & funnel', title: 'Subscriber drivers', where: 'Library › Signals',
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
      unlocked, progress, finding, where: def.where,
      gated: unlocked ? undefined : binding?.g.metric,
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
