import { resolveAudienceId } from './assetProfile'
import { CHANNELS } from './channels'
import type { ChannelId, TrafficRow } from './types'

/**
 * Content signals — a "what's working" read over a brand's published library.
 * Once the whole body of work is ingested (with real metrics), this ranks content
 * by what drives the north-star outcome (subscribers) and surfaces the pattern, so
 * the next campaign is aimed instead of guessed.
 *
 * The core move is separating REACH from CONVERSION: the posts that get the most
 * views are usually not the ones that convert viewers to subscribers. Ranking by
 * subscribe rate (subs per view) is what reveals which topics and formats actually
 * grow the audience. Everything here is computed from the rows, nothing hardcoded.
 */

const STOP = new Set(
  ('the a an to of and or for in on is are be do does did into at as from with that this these those you your youll youre youve it its im we our us my i me so if not no can will would could should they them their there here how why what when who whom which a on off up out over under more most just get got make made take your also new now'.split(
    ' ',
  )),
)

/** Compact number: 36,425 → 36k, 3,074 → 3.1k. */
export const compact = (n: number): string =>
  n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(Math.round(n))

/** Subscribe rate as a small percentage: 0.00036 → "0.036%". */
export const ratePct = (n: number): string => `${(n * 100).toFixed(n < 0.01 ? 3 : 2)}%`

export interface SignalRow {
  id: string
  title: string
  channel: string
  reach: number
  reachLabel: string
  subs: number | null
  /** subscribers per view (0..1); null when the channel has no subscriber signal. */
  rate: number | null
  eng: number
}

export interface ChannelRoll {
  channel: string
  count: number
  reach: number
  reachLabel: string
  subs: number
  eng: number
  /** What this channel does for the brand, inferred from what it drives. */
  role: string
}

export interface ThemeRoll {
  term: string
  count: number
  subs: number
  reach: number
}

export interface PatternRow {
  /** Title shape, e.g. "Provocative claim", "Question", "How-to". */
  shape: string
  count: number
  /** Mean subscribe rate across pieces of this shape (0..1). */
  avgRate: number
  avgReach: number
  subs: number
  examples: string[]
}

export interface VoiceLift {
  /** A voice trait a title uses, e.g. 'Speaks to "you"', 'Command (imperative)'. */
  trait: string
  count: number
  avgReach: number
  avgRate: number
  /** Mean reach of titles with this trait over the corpus mean (1 = par). */
  lift: number
}

export interface LengthBand {
  band: string
  count: number
  avgReach: number
}

export interface OpenerRow {
  word: string
  count: number
  avgReach: number
}

export interface TopicRow {
  /** Subject cluster, e.g. 'Money & wealth', 'Belonging & community'. */
  topic: string
  count: number
  subs: number
  avgRate: number
  avgReach: number
  examples: string[]
}

export interface AskRow {
  /** The ask pulled from body copy, e.g. 'Rate & review', 'Listen / tune in'. */
  ask: string
  count: number
  avgEng: number
  examples: string[]
}

export interface PhraseRow {
  phrase: string
  count: number
}

export interface DayRow {
  day: string
  count: number
  avgReach: number
  subs: number
}

export interface LibrarySignals {
  hasSubs: boolean
  totalSubs: number
  /** Subscriber-attributed content (the channel that reports subs), by subscribe rate. */
  converters: SignalRow[]
  /** All content by raw reach — the contrast to converters. */
  topReach: SignalRow[]
  /** Pieces that vastly outperformed their channel's typical reach. */
  breakouts: SignalRow[]
  channels: ChannelRoll[]
  /** Title themes ranked by the subscribers they drove. */
  themes: ThemeRoll[]
  /** Title-shape patterns (question / how-to / claim) ranked by conversion. */
  patterns: PatternRow[]
  /** Voice traits (speaks-to-you, command, provocation) and how they lift reach. */
  voice: VoiceLift[]
  /** Title word-count bands vs reach. */
  lengthBands: LengthBand[]
  /** The words titles most open with, by reach. */
  openers: OpenerRow[]
  /** Subject clusters (money, vocation, belonging…) ranked by subscribers driven. */
  topics: TopicRow[]
  /** The ask / CTA pulled from body copy, by engagement. */
  asks: AskRow[]
  /** Recurring multi-word phrases across all copy — the brand's voice fingerprint. */
  vocabulary: PhraseRow[]
  /** Publish-cadence phrases found in the copy (e.g. "every other Thursday"). */
  cadence: string[]
  /** Reach + subs by weekday published. */
  days: DayRow[]
  /** How much of the library carries real body copy (drives the body-based reads). */
  bodyCoverage: { withCopy: number; total: number; avgWords: number }
  /** Plain-language reads generated from the above. */
  takeaways: string[]
}

function reachOf(r: TrafficRow): { value: number; label: string } {
  const m = r.socialMetrics ?? {}
  if (typeof m.views === 'number') return { value: m.views, label: 'views' }
  if (typeof m.impressions === 'number') return { value: m.impressions, label: 'impressions' }
  if (typeof m.opens === 'number') return { value: m.opens, label: 'opens' }
  if (typeof m.reach === 'number') return { value: m.reach, label: 'reach' }
  const nums = Object.entries(m).filter(([, v]) => typeof v === 'number') as [string, number][]
  if (nums.length) {
    const top = nums.sort((a, b) => b[1] - a[1])[0]
    return { value: top[1], label: top[0] }
  }
  return { value: 0, label: '' }
}

const engOf = (r: TrafficRow): number => {
  const m = r.socialMetrics ?? {}
  return (typeof m.engagement === 'number' ? m.engagement : 0) || (typeof m.likes === 'number' ? m.likes : 0) || 0
}

function toSignalRow(r: TrafficRow): SignalRow {
  const { value, label } = reachOf(r)
  const subs = typeof r.socialMetrics?.subscribers === 'number' ? (r.socialMetrics!.subscribers as number) : null
  return {
    id: r.id,
    title: r.assetName,
    channel: String(r.channel),
    reach: value,
    reachLabel: label,
    subs,
    rate: subs != null && value > 0 ? subs / value : null,
    eng: engOf(r),
  }
}

function median(nums: number[]): number {
  if (!nums.length) return 0
  const s = [...nums].sort((a, b) => a - b)
  const mid = Math.floor(s.length / 2)
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

function tokens(title: string): string[] {
  const words = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
  const grams = [...words]
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]} ${words[i + 1]}`)
  return [...new Set(grams)]
}

/** Classify a title by the hook shapes it uses (a title can be several at once). */
function titleShapes(title: string): string[] {
  const t = title.trim()
  const low = t.toLowerCase()
  const shapes: string[] = []
  const isQuestion = /\?\s*$/.test(t)
  if (isQuestion) shapes.push('Question')
  if (/^how\b/.test(low) || /\bhow to\b/.test(low)) shapes.push('How-to')
  if (/\byou\b|\byour\b|\byou'?ll\b|\byou'?re\b/.test(low)) shapes.push('Speaks to "you"')
  if (/\d|\bhundreds?\b|\bthousands?\b|\b100s\b|\b1000s\b/.test(low)) shapes.push('Number / scale')
  if (
    !isQuestion &&
    /\b(wasting|waste|wrong|nobody|no one|secret|proof|never|stop|worst|best|rich|richer|better|die|dying|fail|failing|truth|lie|lies|serious|seriously|matter|matters|revolution|broken|power|change|heroes?)\b/.test(
      low,
    )
  )
    shapes.push('Provocative claim')
  if (!shapes.length) shapes.push('Plain statement')
  return shapes
}

/** Group the subscriber-attributed content by title shape and rank shapes by how
 *  well they convert (mean subscribe rate), so you learn what kind of hook works. */
function computePatterns(rows: SignalRow[]): PatternRow[] {
  const map = new Map<
    string,
    { count: number; rateSum: number; rateN: number; reachSum: number; subs: number; examples: string[] }
  >()
  for (const s of rows) {
    for (const shape of titleShapes(s.title)) {
      const cur = map.get(shape) ?? { count: 0, rateSum: 0, rateN: 0, reachSum: 0, subs: 0, examples: [] }
      cur.count += 1
      if (s.rate != null) {
        cur.rateSum += s.rate
        cur.rateN += 1
      }
      cur.reachSum += s.reach
      cur.subs += s.subs ?? 0
      if (cur.examples.length < 2) cur.examples.push(s.title)
      map.set(shape, cur)
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([shape, v]) => ({
      shape,
      count: v.count,
      avgRate: v.rateN ? v.rateSum / v.rateN : 0,
      avgReach: v.reachSum / v.count,
      subs: v.subs,
      examples: v.examples,
    }))
    .sort((a, b) => b.avgRate - a.avgRate || b.subs - a.subs)
}

/** All the copy on a row (every messaging field), minus any field that just echoes the title. */
function bodyOf(r: TrafficRow): string {
  const vals = Object.values(r.messaging ?? {}).filter((v): v is string => typeof v === 'string' && !!v.trim())
  return vals.map((v) => v.trim()).filter((v) => v !== r.assetName.trim()).join('\n').trim()
}

/** A row's publish date, read local (a bare YYYY-MM-DD would drift a day in UTC). */
function dateOf(r: TrafficRow): Date | null {
  if (r.postedAt) {
    const d = new Date(r.postedAt)
    if (!Number.isNaN(d.getTime())) return d
  }
  const iso = r.publishedAt || r.scheduledAt
  if (iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(iso)
    if (!Number.isNaN(d.getTime())) return d
  }
  return null
}

// ── Voice: the writing traits a title uses, and how they move reach ──────────
const IMPERATIVE = new Set(
  'take find build make stop start reclaim change grow give get keep learn know meet read watch listen join rethink rediscover discover choose become create fix fund back stand fight win beat quit chase name'.split(
    ' ',
  ),
)

/** The voice traits a title uses (it can use several at once). */
function titleTraits(title: string): string[] {
  const t = title.trim()
  const low = t.toLowerCase()
  const traits: string[] = []
  if (/\byou\b|\byour\b|\byou'?ll\b|\byou'?re\b|\byourself\b/.test(low)) traits.push('Speaks to "you"')
  const first = low.replace(/^[^a-z0-9]+/, '').split(/\s+/)[0]
  if (IMPERATIVE.has(first)) traits.push('Command (imperative)')
  if (/\?\s*$/.test(t)) traits.push('Question')
  if (/\d|\bhundreds?\b|\bthousands?\b|\b100s\b|\b1000s\b/.test(low)) traits.push('Number / scale')
  if (
    /\b(wasting|waste|wrong|nobody|no one|secret|proof|never|stop|worst|best|rich|richer|better|die|dying|fail|failing|truth|lie|lies|serious|seriously|matter|matters|broken|power|heroes?)\b/.test(low)
  )
    traits.push('Provocation')
  return traits
}

function computeVoice(items: SignalRow[]): VoiceLift[] {
  const meanReach = items.length ? items.reduce((a, s) => a + s.reach, 0) / items.length : 0
  const map = new Map<string, { count: number; reachSum: number; rateSum: number; rateN: number }>()
  for (const s of items) {
    for (const tr of titleTraits(s.title)) {
      const cur = map.get(tr) ?? { count: 0, reachSum: 0, rateSum: 0, rateN: 0 }
      cur.count += 1
      cur.reachSum += s.reach
      if (s.rate != null) {
        cur.rateSum += s.rate
        cur.rateN += 1
      }
      map.set(tr, cur)
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([trait, v]) => ({
      trait,
      count: v.count,
      avgReach: v.reachSum / v.count,
      avgRate: v.rateN ? v.rateSum / v.rateN : 0,
      lift: meanReach ? v.reachSum / v.count / meanReach : 1,
    }))
    .sort((a, b) => b.lift - a.lift)
}

// ── Title length bands + opening words ───────────────────────────────────────
const bandOf = (words: number): string =>
  words <= 4 ? '1-4 words' : words <= 7 ? '5-7 words' : words <= 10 ? '8-10 words' : '11+ words'

function computeLengthBands(items: SignalRow[]): LengthBand[] {
  const order = ['1-4 words', '5-7 words', '8-10 words', '11+ words']
  const map = new Map<string, { count: number; reachSum: number }>()
  for (const s of items) {
    const band = bandOf(s.title.trim().split(/\s+/).filter(Boolean).length)
    const cur = map.get(band) ?? { count: 0, reachSum: 0 }
    cur.count += 1
    cur.reachSum += s.reach
    map.set(band, cur)
  }
  return order
    .filter((b) => map.has(b))
    .map((b) => ({ band: b, count: map.get(b)!.count, avgReach: map.get(b)!.reachSum / map.get(b)!.count }))
}

function computeOpeners(items: SignalRow[]): OpenerRow[] {
  const map = new Map<string, { count: number; reachSum: number }>()
  for (const s of items) {
    const first = s.title.trim().toLowerCase().replace(/^[^a-z0-9]+/, '').split(/\s+/)[0]
    if (!first) continue
    const cur = map.get(first) ?? { count: 0, reachSum: 0 }
    cur.count += 1
    cur.reachSum += s.reach
    map.set(first, cur)
  }
  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([word, v]) => ({ word, count: v.count, avgReach: v.reachSum / v.count }))
    .sort((a, b) => b.count - a.count || b.avgReach - a.avgReach)
    .slice(0, 6)
}

// ── Topic clusters: a generic subject taxonomy, ranked by what it converts ────
const TOPIC_LEXICON: [string, RegExp][] = [
  ['Money & wealth', /\b(rich|money|wealth|wealthy|bank|banking|salary|income|invest|expensive|afford|rent|billionaire|millionaire|donat)/i],
  ['Work & vocation', /\b(work|working|job|jobs|career|ambition|ambitious|talent|talented|vocation|calling|craft|professional|productiv|hustle)/i],
  ['Growth & audience', /\b(audience|grow|growth|influence|reach|follow|follower|subscrib|scale|build|building|brand)/i],
  ['Belonging & community', /\b(communit|belong|place|places|home|together|neighbou?r|village|local|connect|connection|lonel)/i],
  ['Purpose & change', /\b(change|world|better|impact|hero|heroes|movement|fair|fairer|justice|meaning|meaningful|matter|purpose|moral)/i],
]

function computeTopics(items: SignalRow[]): TopicRow[] {
  const map = new Map<
    string,
    { count: number; subs: number; rateSum: number; rateN: number; reachSum: number; examples: string[] }
  >()
  for (const s of items) {
    for (const [topic, re] of TOPIC_LEXICON) {
      if (!re.test(s.title)) continue
      const cur = map.get(topic) ?? { count: 0, subs: 0, rateSum: 0, rateN: 0, reachSum: 0, examples: [] }
      cur.count += 1
      cur.subs += s.subs ?? 0
      cur.reachSum += s.reach
      if (s.rate != null) {
        cur.rateSum += s.rate
        cur.rateN += 1
      }
      if (cur.examples.length < 2) cur.examples.push(s.title)
      map.set(topic, cur)
    }
  }
  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([topic, v]) => ({
      topic,
      count: v.count,
      subs: v.subs,
      avgRate: v.rateN ? v.rateSum / v.rateN : 0,
      avgReach: v.reachSum / v.count,
      examples: v.examples,
    }))
    .sort((a, b) => b.subs - a.subs || b.avgRate - a.avgRate || b.avgReach - a.avgReach)
}

// ── Body copy: the ask, cadence, and the recurring language ───────────────────
const ASK_LEXICON: [string, RegExp][] = [
  ['Subscribe', /\bsubscribe\b/i],
  ['Rate & review', /\b(rate (and|&) review|leave (a|us a) review|review the)\b/i],
  ['Listen / tune in', /\b(tune in|listen|new episode|out now|live now)\b/i],
  ['Watch', /\bwatch\b/i],
  ['Share / spread', /\b(share|spread the word|tell (a friend|your friends|everyone))\b/i],
  ['Learn more', /\b(learn more|read more|find out|get in touch|reach out)\b/i],
  ['Sign up / join', /\b(sign up|join|get involved|be part of)\b/i],
  ['Donate / support', /\b(donate|support us|chip in|give today|contribute)\b/i],
  ['Vote', /\bvot(e|ing)\b/i],
]

function computeAsks(rows: TrafficRow[]): AskRow[] {
  const map = new Map<string, { count: number; engSum: number; examples: string[] }>()
  for (const r of rows) {
    const body = bodyOf(r)
    if (!body) continue
    const clicks = typeof r.socialMetrics?.clicks === 'number' ? r.socialMetrics.clicks : 0
    const eng = engOf(r) || clicks
    for (const [ask, re] of ASK_LEXICON) {
      if (!re.test(body)) continue
      const cur = map.get(ask) ?? { count: 0, engSum: 0, examples: [] }
      cur.count += 1
      cur.engSum += eng
      if (cur.examples.length < 2) cur.examples.push(r.assetName)
      map.set(ask, cur)
    }
  }
  return [...map.entries()]
    .map(([ask, v]) => ({ ask, count: v.count, avgEng: v.count ? v.engSum / v.count : 0, examples: v.examples }))
    .sort((a, b) => b.count - a.count || b.avgEng - a.avgEng)
}

function computeCadence(rows: TrafficRow[]): string[] {
  const found = new Set<string>()
  const res = [
    /\bevery(?:\s+other)?\s+(?:day|week|month|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?\b/gi,
    /\b(?:weekly|bi-?weekly|daily|monthly|fortnightly)\b/gi,
  ]
  for (const r of rows) {
    const body = bodyOf(r)
    if (!body) continue
    for (const re of res) {
      const matches = body.match(re)
      if (matches) for (const m of matches) found.add(m.toLowerCase().replace(/\s+/g, ' ').trim())
    }
  }
  return [...found].slice(0, 6)
}

// Email send-log words that leak in from list/segment metadata ("Sent to All Emails",
// "non openers") — noise for a voice fingerprint, so drop any phrase containing one.
const VOCAB_IGNORE = new Set(
  'sent emails email openers opener non resend test unsent delivered clicked bounced unsubscribe segment recipients'.split(
    ' ',
  ),
)

/** Meaningful 2- and 3-word phrases (dropping grams that start or end on a stopword,
 *  which keeps "change the world" but discards "change the" / "the world"). */
function ngrams(text: string): string[] {
  const words = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean)
  const out: string[] = []
  for (let i = 0; i < words.length; i++) {
    for (const n of [2, 3]) {
      if (i + n > words.length) continue
      const gram = words.slice(i, i + n)
      if (gram.some((w) => w.length < 2 || VOCAB_IGNORE.has(w)) || STOP.has(gram[0]) || STOP.has(gram[gram.length - 1]))
        continue
      out.push(gram.join(' '))
    }
  }
  return out
}

function computeVocabulary(rows: TrafficRow[]): PhraseRow[] {
  const count = new Map<string, number>()
  for (const r of rows) {
    for (const g of ngrams(`${r.assetName}\n${bodyOf(r)}`)) count.set(g, (count.get(g) ?? 0) + 1)
  }
  return [...count.entries()]
    .filter(([, c]) => c >= 2)
    .map(([phrase, c]) => ({ phrase, count: c }))
    .sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
    .slice(0, 12)
}

// ── Messaging patterns: how the copy reads across channel surfaces ────────────
// The library usually spans very different surfaces (a social feed, owned web
// pages, email). This reads the language itself — the register each surface
// writes in, the vocabulary that lives on only one of them, and the copy that
// repeats verbatim — so you can see where a brand speaks in two different voices.

/** A channel's surface bucket, from its kind (organic → Social, owned → web, …). */
const SURFACE_LABEL: Record<string, string> = { organic: 'Social', owned: 'Owned & web', paid: 'Paid' }
const surfaceOf = (channel: string): string => SURFACE_LABEL[CHANNELS[channel as ChannelId]?.kind ?? ''] ?? 'Other'

/** All the copy on a row (every messaging field), straight apostrophes, for matching. */
function fullCopy(r: TrafficRow): string {
  const vals = Object.values(r.messaging ?? {}).filter((v): v is string => typeof v === 'string' && !!v.trim())
  return (vals.length ? vals.join('  ') : r.assetName).replace(/[’]/g, "'").trim()
}

export interface SurfaceRegister {
  surface: string
  assets: number
  /** Share of assets that use the first person ("we / our"), and the raw count. */
  firstPersonPct: number
  firstPersonN: number
  youPct: number
  youN: number
  questionPct: number
  questionN: number
  /** Share that uses a definitional "X is a / an …" construction. */
  definitionalPct: number
  definitionalN: number
  avgWords: number
}
export interface SoleTerm {
  phrase: string
  surface: string
  count: number
}
export interface RepeatRow {
  text: string
  count: number
  surface: string
}
export interface MessagingPatterns {
  /** The register profile of each surface (Social vs Owned vs Paid). */
  surfaces: SurfaceRegister[]
  /** Vocabulary concentrated on a single surface ("said here, not there"). */
  sole: SoleTerm[]
  /** Copy strings reused verbatim across assets — boilerplate. */
  repeats: RepeatRow[]
}

export function computeMessagingPatterns(rows: TrafficRow[]): MessagingPatterns {
  const bySurface = new Map<string, TrafficRow[]>()
  for (const r of rows) {
    const surf = surfaceOf(String(r.channel))
    bySurface.set(surf, [...(bySurface.get(surf) ?? []), r])
  }

  const WE = /\b(?:we|our|ours|us|we're|we've|we'll)\b/i
  const YOU = /\b(?:you|your|yours|you're|you'll|yourself)\b/i
  const DEF = /\b(?:is|are)\s+an?\b/i
  const pct = (n: number, d: number): number => (d ? Math.round((n / d) * 100) : 0)

  const surfaces: SurfaceRegister[] = [...bySurface.entries()]
    .filter(([, list]) => list.length >= 2)
    .map(([surface, list]) => {
      const copies = list.map((r) => fullCopy(r).toLowerCase())
      const fp = copies.filter((c) => WE.test(c)).length
      const yo = copies.filter((c) => YOU.test(c)).length
      const q = copies.filter((c) => c.includes('?')).length
      const df = copies.filter((c) => DEF.test(c)).length
      const words = copies.reduce((a, c) => a + c.split(/\s+/).filter(Boolean).length, 0)
      return {
        surface,
        assets: list.length,
        firstPersonPct: pct(fp, list.length),
        firstPersonN: fp,
        youPct: pct(yo, list.length),
        youN: yo,
        questionPct: pct(q, list.length),
        questionN: q,
        definitionalPct: pct(df, list.length),
        definitionalN: df,
        avgWords: list.length ? Math.round(words / list.length) : 0,
      }
    })
    .sort((a, b) => b.assets - a.assets)

  const shown = new Set(surfaces.map((s) => s.surface))

  // Vocabulary by surface: count each phrase once per asset, then keep the phrases
  // that sit almost entirely (>=85%) on one surface — the language that never crosses.
  const gramSurface = new Map<string, Map<string, number>>()
  for (const [surface, list] of bySurface) {
    if (!shown.has(surface)) continue
    for (const r of list) {
      for (const g of new Set(ngrams(fullCopy(r)))) {
        const m = gramSurface.get(g) ?? new Map<string, number>()
        m.set(surface, (m.get(surface) ?? 0) + 1)
        gramSurface.set(g, m)
      }
    }
  }
  const soleAll: SoleTerm[] = []
  for (const [phrase, m] of gramSurface) {
    const entries = [...m.entries()].sort((a, b) => b[1] - a[1])
    const total = entries.reduce((a, [, c]) => a + c, 0)
    const [surface, count] = entries[0]
    if (total >= 3 && count >= 3 && count / total >= 0.85) soleAll.push({ phrase, surface, count })
  }
  soleAll.sort((a, b) => b.count - a.count || b.phrase.length - a.phrase.length)
  const perSurface = new Map<string, SoleTerm[]>()
  for (const t of soleAll) {
    const arr = perSurface.get(t.surface) ?? []
    if (arr.length < 7) arr.push(t)
    perSurface.set(t.surface, arr)
  }
  const sole = [...perSurface.values()].flat()

  // Verbatim repetition: identical sentence-length field values reused across assets.
  const valCount = new Map<string, { count: number; surface: string; text: string }>()
  for (const r of rows) {
    const surf = surfaceOf(String(r.channel))
    for (const v of Object.values(r.messaging ?? {})) {
      if (typeof v !== 'string') continue
      const t = v.replace(/\s+/g, ' ').trim()
      if (t.split(' ').length < 6) continue
      const key = t.toLowerCase()
      const cur = valCount.get(key) ?? { count: 0, surface: surf, text: t }
      cur.count += 1
      valCount.set(key, cur)
    }
  }
  const repeats: RepeatRow[] = [...valCount.values()]
    .filter((v) => v.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 6)
    .map((v) => ({ text: v.text, count: v.count, surface: v.surface }))

  return { surfaces, sole, repeats }
}

// ── Message coverage: are the brand's proof points and asks actually said? ────
// A proof point defined in the brand system but never written into a post or page
// does no work — no reader would know it. Same for CTAs: if the copy never says
// "subscribe", nobody subscribes. This cross-references the defined library
// (proof points + CTAs) against the published copy to surface what's going unsaid.

export interface CoverageItem {
  label: string
  /** Assets whose copy states this concept. */
  hits: number
  /** Measured outcome (engagement / clicks) summed across the assets that use it. */
  outcome?: number
}
export interface MessageCoverage {
  /** Brand proof points (RTBs): how many are stated, which are not, and which of the
   *  used ones actually drove outcomes (ranked) — the heuristic, weighted by results. */
  proof: { total: number; used: number; unused: CoverageItem[]; performing: CoverageItem[] }
  /** Defined CTAs and how often the copy actually makes each ask (0 = never said). */
  cta: { total: number; used: number; items: CoverageItem[] }
  corpusAssets: number
}

const COV_STOP = new Set(
  ('the a an and or of to in on is are be been being for with that this those these by from into as at we our us you your it its not no can will would could should than then there here how why what when who which have has had do does did more most just get got make made take also now over under out off up down first best their they them'.split(
    ' ',
  )),
)
/** Distinctive content words in a phrase (drop short + stopwords, dedupe). */
function covWords(s: string): string[] {
  return [...new Set((s.toLowerCase().match(/[a-z][a-z'-]+/g) ?? []).filter((w) => w.length >= 4 && !COV_STOP.has(w)))]
}
/** Assets that state a concept: at least half its distinctive words appear in the copy. */
function conceptHits(copies: string[], label: string): number {
  const ws = covWords(label)
  if (!ws.length) return 0
  return copies.filter((c) => ws.filter((w) => c.includes(w)).length / ws.length >= 0.5).length
}
/** Whether one asset's copy states a concept. */
function conceptMatch(copy: string, ws: string[]): boolean {
  return ws.length > 0 && ws.filter((w) => copy.includes(w)).length / ws.length >= 0.5
}
/** The measured result on a row — engagement, else likes+comments, else clicks. */
function outcomeOf(r: TrafficRow): number {
  const m = r.socialMetrics ?? {}
  if (typeof m.engagement === 'number' && m.engagement > 0) return m.engagement
  const likes = typeof m.likes === 'number' ? m.likes : 0
  const comments = typeof m.comments === 'number' ? m.comments : 0
  if (likes + comments > 0) return likes + comments
  if (typeof m.clicks === 'number') return m.clicks
  return 0
}

export function computeMessageCoverage(
  rows: TrafficRow[],
  proofPoints: { label: string }[],
  ctas: { label: string }[],
): MessageCoverage {
  const corpus = rows.map((r) => ({ r, c: fullCopy(r).toLowerCase() })).filter((x) => x.c.trim().length > 0)
  const copies = corpus.map((x) => x.c)
  const proofItems: CoverageItem[] = proofPoints
    .filter((p) => p.label?.trim())
    .map((p) => {
      const ws = covWords(p.label)
      const matched = corpus.filter((x) => conceptMatch(x.c, ws))
      return { label: p.label, hits: matched.length, outcome: matched.reduce((s, x) => s + outcomeOf(x.r), 0) }
    })
  const unused = proofItems.filter((p) => p.hits === 0)
  // Accumulation → outcomes: of the proof points that ARE used, rank by what the
  // content carrying them actually drove. "We think this resonates" becomes measured.
  const performing = proofItems
    .filter((p) => p.hits > 0 && (p.outcome ?? 0) > 0)
    .sort((a, b) => (b.outcome ?? 0) - (a.outcome ?? 0))
  const ctaItems = ctas
    .filter((c) => c.label?.trim())
    .map((c) => ({ label: c.label, hits: conceptHits(copies, c.label) }))
    .sort((a, b) => a.hits - b.hits)
  return {
    proof: { total: proofItems.length, used: proofItems.length - unused.length, unused, performing },
    cta: { total: ctaItems.length, used: ctaItems.filter((c) => c.hits > 0).length, items: ctaItems },
    corpusAssets: copies.length,
  }
}

// ── Reconciliation: a planned card's projection becomes the measured actual ───
export interface ReconcileStat {
  planned: number
  reconciled: number
}
/** Normalized copy of a row — the key for matching a planned card to its published post. */
export function rowCopyKey(r: TrafficRow): string {
  return Object.values(r.messaging ?? {})
    .filter((v): v is string => typeof v === 'string')
    .join(' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
}
/** A planned card is one that hasn't posted and wasn't ingested (generated/authored/blank). */
export const isPlannedCard = (r: TrafficRow): boolean =>
  r.status !== 'posted' && (!r.source || r.source === 'generated' || r.source === 'authored')
export function reconciliationStat(rows: TrafficRow[]): ReconcileStat {
  const planned = rows.filter(isPlannedCard)
  return { planned: planned.length, reconciled: planned.filter((r) => typeof r.reconciledAt === 'number').length }
}

// ── Channel connection: does each channel push the audience onward? ───────────
// A channel that never links to a next step is a dead end — reach with nowhere to
// go. This reads the copy for onward destinations (newsletter, podcast, site,
// donate…) so you can see which channels connect the funnel and which strand it.
const LINK_DESTINATIONS: [string, RegExp][] = [
  ['Newsletter', /subscribe|newsletter|sign ?up|join the (list|movement)/i],
  ['Podcast', /podcast|spotify|apple podcast|full episode|tune in|\blisten\b/i],
  ['Website', /link in (bio|our bio)|\bin bio\b|worldwithin|\.org\b|our (website|site)|head (on )?over|learn more|read more|link below/i],
  ['YouTube', /\byoutube\b|watch (the|our|full|now)\b/i],
  ['Donate / Fund', /\bdonate\b|the fund|\binvest\b|wefunder|contribute|give today|chip in/i],
  ['Events', /\btickets?\b|screening|\brsvp\b|register|join us (on|at)/i],
  ['Follow', /\bfollow\b|turn on notif|hit the bell/i],
]

export interface ChannelLink {
  channel: string
  label: string
  total: number
  connected: number
  destinations: { key: string; count: number }[]
}
export interface ChannelConnection {
  channels: ChannelLink[]
  overall: { total: number; connected: number; deadEndPct: number }
  destRank: { key: string; count: number }[]
}

export function computeChannelConnection(rows: TrafficRow[]): ChannelConnection {
  const byCh = new Map<string, TrafficRow[]>()
  for (const r of rows) {
    const c = String(r.channel)
    byCh.set(c, [...(byCh.get(c) ?? []), r])
  }
  const overallDest = new Map<string, number>()
  let connectedTotal = 0
  const channels: ChannelLink[] = [...byCh.entries()]
    .map(([channel, list]) => {
      const destTally = new Map<string, number>()
      let connected = 0
      for (const r of list) {
        const c = fullCopy(r).toLowerCase()
        let any = false
        for (const [key, re] of LINK_DESTINATIONS) {
          if (re.test(c)) {
            destTally.set(key, (destTally.get(key) ?? 0) + 1)
            overallDest.set(key, (overallDest.get(key) ?? 0) + 1)
            any = true
          }
        }
        if (any) connected++
      }
      connectedTotal += connected
      return {
        channel,
        label: CHANNELS[channel as ChannelId]?.label ?? channel,
        total: list.length,
        connected,
        destinations: [...destTally.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
      }
    })
    .sort((a, b) => b.total - a.total)
  const total = rows.length
  return {
    channels,
    overall: {
      total,
      connected: connectedTotal,
      deadEndPct: total ? Math.round(((total - connectedTotal) / total) * 100) : 0,
    },
    destRank: [...overallDest.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
  }
}

// The drillable version of the flow: keeps the actual assets behind each edge, so the
// map can answer "which posts drive to the podcast?" and "which link nowhere?".
export interface FlowAsset {
  id: string
  name: string
  channel: string
  when: string
  url?: string
  destinations: string[]
}
export interface ContentFlow {
  channels: ChannelLink[]
  destinations: { key: string; count: number; assets: FlowAsset[] }[]
  deadEnds: FlowAsset[]
  assets: FlowAsset[]
  overall: { total: number; connected: number; deadEndPct: number }
}
export function contentFlow(rows: TrafficRow[]): ContentFlow {
  const assets: FlowAsset[] = rows.map((r) => {
    const c = fullCopy(r).toLowerCase()
    return {
      id: r.id,
      name: r.assetName,
      channel: String(r.channel),
      when: (r.publishedAt || r.scheduledAt || '').slice(0, 10),
      url: r.sourceUrl,
      destinations: LINK_DESTINATIONS.filter(([, re]) => re.test(c)).map(([k]) => k),
    }
  })
  const destMap = new Map<string, FlowAsset[]>()
  for (const a of assets) for (const d of a.destinations) destMap.set(d, [...(destMap.get(d) ?? []), a])
  const destinations = [...destMap.entries()]
    .map(([key, list]) => ({ key, count: list.length, assets: list }))
    .sort((a, b) => b.count - a.count)
  const deadEnds = assets.filter((a) => a.destinations.length === 0)
  const cc = computeChannelConnection(rows)
  return { channels: cc.channels, destinations, deadEnds, assets, overall: cc.overall }
}

/** Plain-language fixes read off the flow: where reach strands, and where it fails to
 *  route to the ask. */
export function flowRecommendations(flow: ContentFlow): string[] {
  const recs: string[] = []
  const { overall, channels, destinations, deadEnds } = flow
  if (overall.deadEndPct >= 25 && deadEnds.length) {
    const byChannel = new Map<string, number>()
    for (const a of deadEnds) byChannel.set(a.channel, (byChannel.get(a.channel) ?? 0) + 1)
    const [ch, n] = [...byChannel.entries()].sort((a, b) => b[1] - a[1])[0]
    const label = CHANNELS[ch as ChannelId]?.label ?? ch
    recs.push(
      `${overall.deadEndPct}% of posts link nowhere onward. The biggest cluster is ${label} (${n} posts) — add a next step (a link or CTA) to each.`,
    )
  }
  const sum = (re: RegExp) => destinations.filter((d) => re.test(d.key)).reduce((s, d) => s + d.count, 0)
  const convTotal = sum(/newsletter|donate|fund|follow/i)
  const contentTotal = sum(/podcast|youtube|website/i)
  if (contentTotal > 0 && convTotal < contentTotal / 3) {
    const fund = destinations.find((d) => /fund|donate/i.test(d.key))?.count ?? 0
    const news = destinations.find((d) => /newsletter/i.test(d.key))?.count ?? 0
    recs.push(
      `Reach isn't routed to the ask: ${contentTotal} posts point to content (podcast, video, site) but only ${convTotal} to conversion — the Fund (${fund}) and newsletter (${news}). Add the donate/subscribe step to your best posts.`,
    )
  }
  for (const c of channels) {
    if (c.total >= 3 && c.connected === 0) {
      recs.push(`${c.label} is a pure dead end: all ${c.total} posts link nowhere. Add end-cards or a description link.`)
    } else if (c.total >= 6 && c.connected / c.total < 0.2) {
      recs.push(`${c.label} rarely links onward (${c.connected} of ${c.total}). Add a consistent next step.`)
    }
  }
  return recs.slice(0, 4)
}

// ── Links: the hyperlinks and platforms the copy actually references ──────────
export interface LinkRef {
  host: string
  count: number
}
const PLATFORM_MENTIONS: [string, RegExp][] = [
  ['worldwithin.org', /worldwithin\.org/i],
  ['spotify', /spotify/i],
  ['apple podcasts', /apple podcast/i],
  ['youtube', /\byoutube\b|youtu\.be/i],
  ['link in bio', /link in (bio|our bio)/i],
  ['linktree', /linktr\.ee|linktree/i],
]
export function extractLinks(rows: TrafficRow[]): LinkRef[] {
  const tally = new Map<string, number>()
  const add = (host: string) => host && tally.set(host, (tally.get(host) ?? 0) + 1)
  for (const r of rows) {
    if (r.sourceUrl) {
      try {
        add(new URL(r.sourceUrl).hostname.replace(/^www\./, ''))
      } catch {
        /* ignore */
      }
    }
    const copy = fullCopy(r)
    for (const u of copy.match(/https?:\/\/[^\s)]+/gi) ?? []) {
      try {
        add(new URL(u).hostname.replace(/^www\./, ''))
      } catch {
        /* ignore */
      }
    }
    for (const [label, re] of PLATFORM_MENTIONS) if (re.test(copy)) add(label)
  }
  return [...tally.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count).slice(0, 14)
}

// ── Audience coverage: which of the brand's audiences the content targets ─────
// Cross-references the audience tags on the content against the brand's defined
// audiences: which defined personas have content, which the content targets that
// aren't defined at all (drift), and how much content names no audience.
export interface AudienceCoverage {
  total: number
  tagged: number
  untagged: number
  defined: { label: string; count: number }[]
  offList: { label: string; count: number }[]
}

export function computeAudienceCoverage(
  rows: TrafficRow[],
  audiences: { id?: string; name?: string; label?: string; aliases?: string[] }[],
): AudienceCoverage {
  // Resolve tags to a canonical audience by name OR alias, so "Impact Investors" counts
  // toward the audience that owns it instead of reading as drift.
  const refs = audiences
    .map((a, i) => ({ id: a.id ?? `aud_${i}`, name: (a.name ?? a.label ?? '').trim(), aliases: a.aliases }))
    .filter((a) => a.name)
  const perAudience = new Map<string, number>()
  const offList = new Map<string, number>()
  let tagged = 0
  for (const r of rows) {
    const a = (r.audience ?? '').trim()
    if (!a) continue
    tagged++
    const id = resolveAudienceId(a, refs)
    if (id) perAudience.set(id, (perAudience.get(id) ?? 0) + 1)
    else offList.set(a, (offList.get(a) ?? 0) + 1)
  }
  const defined = refs.map((r) => ({ label: r.name, count: perAudience.get(r.id) ?? 0 })).sort((a, b) => b.count - a.count)
  const off = [...offList.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count)
  return { total: rows.length, tagged, untagged: rows.length - tagged, defined, offList: off }
}

const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
function computeDays(rows: TrafficRow[]): DayRow[] {
  const map = new Map<number, { count: number; reachSum: number; subs: number }>()
  for (const r of rows) {
    const d = dateOf(r)
    if (!d) continue
    const { value } = reachOf(r)
    const subs = typeof r.socialMetrics?.subscribers === 'number' ? r.socialMetrics.subscribers : 0
    const cur = map.get(d.getDay()) ?? { count: 0, reachSum: 0, subs: 0 }
    cur.count += 1
    cur.reachSum += value
    cur.subs += subs
    map.set(d.getDay(), cur)
  }
  return [...map.entries()]
    .filter(([, v]) => v.count >= 2)
    .map(([dow, v]) => ({ day: DOW[dow], count: v.count, avgReach: v.reachSum / v.count, subs: v.subs }))
    .sort((a, b) => b.avgReach - a.avgReach)
}

function computeBodyCoverage(rows: TrafficRow[]): { withCopy: number; total: number; avgWords: number } {
  let withCopy = 0
  let wordSum = 0
  for (const r of rows) {
    const words = bodyOf(r).split(/\s+/).filter(Boolean).length
    if (words >= 8) {
      withCopy += 1
      wordSum += words
    }
  }
  return { withCopy, total: rows.length, avgWords: withCopy ? Math.round(wordSum / withCopy) : 0 }
}

const channelRole = (channel: string, subs: number, eng: number, reach: number): string => {
  if (subs > 0) return 'Subscriber engine'
  if (channel === 'email') return 'Retention / owned list'
  if (eng > 0 && reach > 0 && eng / reach > 0.02) return 'Engagement'
  return 'Reach & awareness'
}

export function computeLibrarySignals(rows: TrafficRow[]): LibrarySignals {
  const items = rows.map(toSignalRow).filter((s) => s.reach > 0 || s.subs != null)
  const withSubs = items.filter((s) => s.subs != null)
  const hasSubs = withSubs.some((s) => (s.subs ?? 0) > 0)
  const totalSubs = withSubs.reduce((a, s) => a + (s.subs ?? 0), 0)

  // Only rank converters with enough reach to be a fair rate (avoids tiny-sample noise).
  const reachFloor = Math.max(1000, median(withSubs.map((s) => s.reach)) / 4)
  const converters = withSubs
    .filter((s) => s.reach >= reachFloor)
    .sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0) || (b.subs ?? 0) - (a.subs ?? 0))

  const topReach = [...items].sort((a, b) => b.reach - a.reach).slice(0, 6)

  // Breakouts: pieces beyond 2.5x their channel's median reach.
  const byChannel = new Map<string, SignalRow[]>()
  for (const s of items) byChannel.set(s.channel, [...(byChannel.get(s.channel) ?? []), s])
  const breakouts: SignalRow[] = []
  for (const [, list] of byChannel) {
    const med = median(list.map((s) => s.reach))
    if (med <= 0) continue
    for (const s of list) if (s.reach >= med * 2.5) breakouts.push(s)
  }
  breakouts.sort((a, b) => b.reach - a.reach)

  const channels: ChannelRoll[] = [...byChannel.entries()]
    .map(([channel, list]) => {
      const reach = list.reduce((a, s) => a + s.reach, 0)
      const subs = list.reduce((a, s) => a + (s.subs ?? 0), 0)
      const eng = list.reduce((a, s) => a + s.eng, 0)
      return {
        channel,
        count: list.length,
        reach,
        reachLabel: list[0]?.reachLabel ?? 'reach',
        subs,
        eng,
        role: channelRole(channel, subs, eng, reach),
      }
    })
    .sort((a, b) => b.subs - a.subs || b.reach - a.reach)

  // Themes: score title terms by the subscribers the videos carrying them drove.
  const themeMap = new Map<string, ThemeRoll>()
  for (const s of withSubs) {
    for (const t of tokens(s.title)) {
      const cur = themeMap.get(t) ?? { term: t, count: 0, subs: 0, reach: 0 }
      cur.count += 1
      cur.subs += s.subs ?? 0
      cur.reach += s.reach
      themeMap.set(t, cur)
    }
  }
  const themes = [...themeMap.values()]
    .filter((t) => t.subs > 0)
    .sort((a, b) => b.subs - a.subs || b.count - a.count)
    .slice(0, 8)

  const patterns = computePatterns(withSubs)
  const voice = computeVoice(items)
  const lengthBands = computeLengthBands(items)
  const openers = computeOpeners(items)
  const topics = computeTopics(items)
  const asks = computeAsks(rows)
  const vocabulary = computeVocabulary(rows)
  const cadence = computeCadence(rows)
  const days = computeDays(rows)
  const bodyCoverage = computeBodyCoverage(rows)

  const base = {
    hasSubs,
    totalSubs,
    converters,
    topReach,
    breakouts,
    channels,
    themes,
    patterns,
    voice,
    lengthBands,
    openers,
    topics,
    asks,
    vocabulary,
    cadence,
    days,
    bodyCoverage,
  }
  return { ...base, takeaways: buildTakeaways(base) }
}

function buildTakeaways(s: Omit<LibrarySignals, 'takeaways'>): string[] {
  const out: string[] = []
  const engineCh = s.channels.find((c) => c.subs > 0)
  if (s.hasSubs && engineCh) {
    out.push(
      `${channelName(engineCh.channel)} is your subscriber engine: ${s.totalSubs} subscribers from ${engineCh.count} ${engineCh.count === 1 ? 'post' : 'posts'}.`,
    )
  }

  // The headline insight: conversion is not reach.
  const bestConv = s.converters.find((c) => (c.subs ?? 0) > 0)
  const lowConv = [...s.converters].sort((a, b) => b.reach - a.reach).find((c) => (c.rate ?? 1) < (bestConv?.rate ?? 0) / 2)
  if (bestConv && lowConv && lowConv.id !== bestConv.id) {
    out.push(
      `Conversion beats reach: "${lowConv.title}" pulled ${compact(lowConv.reach)} ${lowConv.reachLabel} but drove ${lowConv.subs} subscribers, while "${bestConv.title}" converted ${bestConv.subs} from ${compact(bestConv.reach)}. Aim for the second kind.`,
    )
  }

  if (s.themes.length) {
    const t = s.themes.slice(0, 3).map((x) => `"${x.term}"`).join(', ')
    out.push(`Themes that convert: ${t} show up in your highest subscriber-driving videos. Make more of them.`)
  }

  // Voice: the trait that most lifts reach above the brand's average.
  const topVoice = s.voice.find((v) => v.lift >= 1.15 && v.count >= 2)
  if (topVoice) {
    out.push(
      `Voice: the "${topVoice.trait.replace(/ \(imperative\)/, '')}" style pulls ${Math.round((topVoice.lift - 1) * 100)}% more reach than your average (${topVoice.count} posts). Lean into it.`,
    )
  }

  // Topic: the subject cluster that drove the most subscribers.
  const topTopic = s.topics.find((t) => t.subs > 0)
  if (topTopic) {
    out.push(
      `Subject that converts: "${topTopic.topic}" drove +${topTopic.subs} subscribers across ${topTopic.count} posts, your strongest topic. Make more of it.`,
    )
  }

  // The ask: what the most-used CTA is across the body copy.
  const topAsk = s.asks[0]
  if (topAsk && topAsk.count >= 2) {
    out.push(`Your most common ask is "${topAsk.ask}" (${topAsk.count} pieces). Worth testing a stronger single CTA.`)
  }

  // Hook-shape pattern: the best-converting title shape vs the worst.
  const shaped = s.patterns.filter((p) => p.count >= 2)
  if (shaped.length >= 2) {
    const best = shaped[0]
    const worst = shaped[shaped.length - 1]
    if (best.avgRate > worst.avgRate) {
      out.push(
        `Pattern: ${best.shape.toLowerCase()} titles convert best (${ratePct(best.avgRate)} avg over ${best.count}), while ${worst.shape.toLowerCase()} titles run ${ratePct(worst.avgRate)}. Write more of the first.`,
      )
    }
  }

  const breakout = s.breakouts[0]
  if (breakout) {
    out.push(`"${breakout.title}" is a breakout: ${compact(breakout.reach)} ${breakout.reachLabel}, well beyond your typical post. A format worth repeating.`)
  }

  const email = s.channels.find((c) => c.channel === 'email')
  if (email && email.subs === 0) {
    out.push(`Email reaches ${compact(email.reach)} opens but isn't a subscriber driver. Treat it as retention for the audience you already have.`)
  }
  return out
}

const CH_LABELS: Record<string, string> = {
  youtube: 'YouTube',
  linkedin: 'LinkedIn',
  email: 'Email',
  events: 'Events',
  'google-search': 'Search',
  website: 'Website',
}
export const channelName = (c: string): string => CH_LABELS[c] ?? c

// ── Recommendations: one ranked action list, folding the plain-language takeaways
//    (amplify what converts) together with the gap reads (fix the leaks). ───────────
export type RecKind = 'fix' | 'amplify' | 'test' | 'setup'
export interface SignalRec {
  text: string
  kind: RecKind
}
export function signalRecommendations(i: {
  coverage: MessageCoverage
  connection: ChannelConnection
  audience: AudienceCoverage
  reconcile: ReconcileStat
  signals: LibrarySignals
  patterns: MessagingPatterns
  takeaways: string[]
}): SignalRec[] {
  const { coverage: cov, connection: conn, audience: aud, reconcile: recon, signals: s, patterns: mp, takeaways } = i
  const recs: SignalRec[] = []

  // FIX — the copy actively fails to convert.
  if (conn.overall.total >= 10 && conn.overall.deadEndPct >= 40) {
    const worst = conn.channels.filter((c) => c.total >= 3 && c.connected === 0).sort((a, b) => b.total - a.total)[0]
    recs.push({
      kind: 'fix',
      text: `${conn.overall.deadEndPct}% of your posts link nowhere onward. Add a next step (a link or CTA) to your highest-reach posts${worst ? `, starting with ${worst.label}, which never connects` : ''}.`,
    })
  }
  const neverCtas = cov.cta.items.filter((c) => c.hits === 0)
  if (neverCtas.length) {
    recs.push({
      kind: 'fix',
      text: `You never actually say ${neverCtas.slice(0, 2).map((c) => `“${c.label}”`).join(' or ')}${neverCtas.length > 2 ? ` (and ${neverCtas.length - 2} more)` : ''}. An ask the copy never makes can’t convert.`,
    })
  }
  if (cov.proof.unused.length >= 3) {
    recs.push({
      kind: 'fix',
      text: `${cov.proof.unused.length} of your ${cov.proof.total} proof points never appear in any post. Put them to work, starting with “${cov.proof.unused[0].label}”.`,
    })
  }
  const social = mp.surfaces.find((su) => /social/i.test(su.surface))
  const owned = mp.surfaces.find((su) => /own|web|site/i.test(su.surface))
  if (social && owned && social.youPct - owned.youPct >= 25) {
    recs.push({ kind: 'fix', text: `Your social copy speaks to “you” (${social.youPct}%) but your owned copy barely does (${owned.youPct}%). Bring the social voice to the site and the ask.` })
  }

  // AMPLIFY — the takeaways are already "do more of what converts"; keep them, plus the
  // one thing they don't cover: your strongest proof point.
  const topProof = cov.proof.performing[0]
  if (topProof && (topProof.outcome ?? 0) > 0) {
    recs.push({ kind: 'amplify', text: `Lead with “${topProof.label}” more often — your strongest proof point, it drove ${compact(topProof.outcome ?? 0)} across ${topProof.hits} posts.` })
  }
  for (const t of takeaways) recs.push({ kind: /\btest(ing)?\b/i.test(t) ? 'test' : 'amplify', text: t })

  // SET UP — so the next reads get sharper.
  const starved = aud.defined.filter((a) => a.count === 0)
  if (starved.length) {
    recs.push({ kind: 'setup', text: `${starved.length} defined ${starved.length === 1 ? 'segment has' : 'segments have'} no content: ${starved.slice(0, 2).map((a) => a.label).join(', ')}. Write for them or drop them.` })
  }
  if (aud.total >= 10 && aud.untagged / aud.total >= 0.4) {
    recs.push({ kind: 'setup', text: `${aud.untagged} of ${aud.total} assets name no audience. Tag them so you can see what each segment responds to.` })
  }
  if (recon.planned >= 10 && recon.reconciled === 0) {
    recs.push({ kind: 'setup', text: `None of your ${recon.planned} planned cards have reconciled to a live post. Add the source link when a card ships so projections become actuals.` })
  }
  const bestDay = s.days[0]
  if (bestDay && s.days.length >= 3) {
    recs.push({ kind: 'setup', text: `${bestDay.day} is your best day to post (avg ${compact(bestDay.avgReach)} reach). Weight the calendar toward it.` })
  }

  const order: Record<RecKind, number> = { fix: 0, amplify: 1, test: 2, setup: 3 }
  return recs.sort((a, b) => order[a.kind] - order[b.kind])
}
