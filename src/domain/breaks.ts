import { isCtaField, messagingFields } from './messaging'
import { rtbsForCampaign } from './rtb'
import type { ChannelId, TrafficRow } from './types'

/**
 * The connection check, as a real object.
 *
 * Generation is the commodity; connection is the contract. A coherence break is
 * not a score — it's a named, typed, actionable break in the thread that runs
 * through a campaign. Every break belongs to exactly one axis and answers four
 * questions a CMO would ask out loud: what / where / why / fix.
 *
 * The four types map to the two axes from the strategy plus two supporting flags:
 *  - journey  (Axis A) — an asset drops the promise of the asset that hands to it.
 *  - audience (Axis B) — two variants that should tell one story tell two (drift).
 *  - proof    — a claim or CTA with no backing RTB chip (unsupported).
 *  - cta      — a conversion step whose CTA doesn't cash the funnel's promise.
 *
 * For the demo these are hand-authored into the sample data (deterministic, zero
 * cost, never embarrasses on stage), but the object is modeled exactly as a real
 * check would populate it, so the live version is a drop-in later.
 */

export type BreakAxis = 'journey' | 'audience' | 'proof' | 'cta' | 'voice'
export type BreakSeverity = 'high' | 'medium' | 'low'
export type BreakStatus = 'open' | 'resolved' | 'intended' | 'in-review'

export const AXIS_META: Record<BreakAxis, { label: string; blurb: string }> = {
  journey: { label: 'Journey handoff', blurb: 'The thread frays as the prospect moves down the funnel.' },
  audience: { label: 'Audience drift', blurb: 'Two variants that should tell one story tell two.' },
  proof: { label: 'Proof gap', blurb: 'A claim or CTA with no backing proof point.' },
  cta: { label: 'Weak CTA', blurb: "A CTA that doesn't cash the promise the funnel made." },
  voice: { label: 'Brand voice', blurb: 'Copy that breaks a rule in the brand guide.' },
}

/** One side of the conflict, shown in the side-by-side evidence. */
export interface BreakEvidence {
  /** Human label, e.g. "Meta ad headline" / "Landing page hero". */
  role: string
  assetName: string
  channel?: ChannelId
  /** Which messaging component this evidence is drawn from (headline, cta, …). */
  field: string
  /** The full unit text. */
  text: string
  /** The exact conflicting span within `text` to highlight (verbatim substring). */
  highlight: string
}

/** Claude's rewrite that restores the thread — applied in one click. */
export interface SuggestedFix {
  assetName: string
  /** The channel that disambiguates which row to rewrite (one asset → many channels). */
  channel: ChannelId
  /** The messaging component the fix rewrites. */
  field: string
  before: string
  after: string
  /** For a proof gap, the RTB id the fix attaches instead of a rewrite. */
  attachRtb?: string
}

export interface CoherenceBreak {
  id: string
  axis: BreakAxis
  severity: BreakSeverity
  /** The break stated as a sentence a CMO would say out loud. */
  headline: string
  campaign: string
  client: string
  audienceType?: string
  /** The asset that opens the thread (the promise). */
  from: BreakEvidence
  /** The asset that breaks it. Absent for single-asset flags (proof gap / weak CTA). */
  to?: BreakEvidence
  /** One sentence tying the conflict to THIS client's audience + strategy. */
  why: string
  /** The brand-guide rule this break violates — the standard the check measures against. */
  brandRule?: string
  suggestedFix: SuggestedFix
  status: BreakStatus
}

export type AuditAction = 'check' | 'apply-fix' | 'reassign-proof' | 'mark-intended' | 'send-to-review'

export const AUDIT_LABEL: Record<AuditAction, string> = {
  check: 'Connection check ran',
  'apply-fix': 'Applied suggested fix',
  'reassign-proof': 'Reassigned proof',
  'mark-intended': 'Marked as intended',
  'send-to-review': 'Sent to review',
}

/** Every check result and every action writes one of these — the disclosure trail. */
export interface AuditEntry {
  id: string
  at: number
  breakId: string
  action: AuditAction
  actor: string
  summary: string
  before?: string
  after?: string
}

export const SEVERITY_RANK: Record<BreakSeverity, number> = { high: 0, medium: 1, low: 2 }

/** Breaks still open (the only ones that count against thread integrity). */
export const openBreaks = (breaks: CoherenceBreak[]): CoherenceBreak[] =>
  breaks.filter((b) => b.status === 'open')

/** Sort a break list for the queue: severity first, then axis. */
export const sortBreaks = (breaks: CoherenceBreak[]): CoherenceBreak[] =>
  [...breaks].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity])

export interface ThreadHealth {
  /** Distinct assets in scope. */
  total: number
  /** Assets with no open break against them. */
  connected: number
  /** Open breaks in scope. */
  breaks: number
}

/**
 * Thread integrity over a set of asset names and the breaks in scope. "Connected"
 * counts assets that don't appear on the `from` or `to` side of any open break.
 */
export function threadHealth(assetNames: Set<string>, breaks: CoherenceBreak[]): ThreadHealth {
  const open = openBreaks(breaks)
  const broken = new Set<string>()
  for (const b of open) {
    if (assetNames.has(b.from.assetName)) broken.add(b.from.assetName)
    if (b.to && assetNames.has(b.to.assetName)) broken.add(b.to.assetName)
  }
  return {
    total: assetNames.size,
    connected: assetNames.size - broken.size,
    breaks: open.length,
  }
}

export function freshAuditId(): string {
  return `aud_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6)}`
}

// ---------------------------------------------------------------------------
// Hand-authored Acme breaks, DERIVED from the seeded row conflicts.
//
// Each break is detected from the live row copy, so applying its fix (which
// rewrites the row) removes the conflict and the break clears on its own — the
// counter ticks down on stage. The object is shaped exactly as a real check
// would emit it, so the live check is a drop-in (see sampleData.ts seeds).
// ---------------------------------------------------------------------------

const find = (rows: TrafficRow[], assetName: string, channel: ChannelId) =>
  rows.find((r) => r.assetName === assetName && r.channel === channel)

const has = (s: string | undefined, needle: string) =>
  (s ?? '').toLowerCase().includes(needle.toLowerCase())

/** Detect the four seeded Acme coherence breaks present in the given rows. */
export function detectAcmeBreaks(rows: TrafficRow[]): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  const client = 'Acme Co'
  const campaign = 'Spring Launch 2026'

  // #1 Journey handoff — the LP drops the ad's "2x faster" number.
  const meta = find(rows, 'spring-hero-30s.mp4', 'meta-ads')
  const lp = find(rows, 'spring-launch-lp', 'landing-page')
  if (meta && lp && has(meta.messaging.headline, '2x') && !has(lp.messaging.headline, '2x')) {
    out.push({
      id: 'brk-journey-lp',
      axis: 'journey',
      severity: 'high',
      headline: 'Your Conversion landing page drops the “2x faster” promise the Meta ad makes.',
      client,
      campaign,
      from: { role: 'Meta ad headline', assetName: meta.assetName, channel: 'meta-ads', field: 'headline', text: meta.messaging.headline, highlight: '2x faster' },
      to: { role: 'Landing page hero', assetName: lp.assetName, channel: 'landing-page', field: 'headline', text: lp.messaging.headline, highlight: 'faster than ever' },
      why: 'Mid-market Ops buyers are, per the ICP, skeptical of hype — they want proof. A vague “faster” with no number reads as hype and snaps the substantiation chain the ad opened.',
      brandRule: 'No vague claims — write “2x faster”, not “faster than ever”.',
      suggestedFix: { assetName: lp.assetName, channel: 'landing-page', field: 'headline', before: lp.messaging.headline, after: 'Ship 2x faster' },
      status: 'open',
    })
  }

  // #2 Audience drift — ABM-Enterprise reuses the Lookalike "redesigned dashboard" proof.
  const look = find(rows, 'spring-hero-30s.mp4', 'meta-ads')
  const abm = find(rows, 'spring-promo-1x1.jpg', 'linkedin-ads')
  if (abm && (abm.rtbMap?.description ?? []).includes('redesign') && has(abm.messaging.description, 'redesigned')) {
    out.push({
      id: 'brk-audience-abm',
      axis: 'audience',
      severity: 'medium',
      headline: 'Your ABM-Enterprise variant reuses a consumer proof point that’s off-ICP for enterprise.',
      client,
      campaign,
      audienceType: 'ABM – Enterprise',
      from: { role: 'Lookalike – Customers', assetName: look?.assetName ?? 'spring-hero-30s.mp4', channel: 'meta-ads', field: 'description', text: look?.messaging.description ?? 'A redesigned dashboard', highlight: 'redesigned dashboard' },
      to: { role: 'ABM – Enterprise', assetName: abm.assetName, channel: 'linkedin-ads', field: 'description', text: abm.messaging.description, highlight: 'redesigned dashboard' },
      why: 'Enterprise Ops buyers signal intent on “workflow automation,” not UI polish. Reusing the consumer “redesigned dashboard” proof for this ABM audience reads as off-target and weakens the enterprise angle.',
      brandRule: 'Speak to one buyer at a time, in their language.',
      suggestedFix: { assetName: abm.assetName, channel: 'linkedin-ads', field: 'description', before: abm.messaging.description, after: 'Automate the manual ops work that doesn’t scale', attachRtb: 'speed' },
      status: 'open',
    })
  }

  // #3 Proof gap — the YouTube retargeting CTA claims "live now" with no backing RTB.
  const yt = find(rows, 'spring-hero-30s.mp4', 'youtube-ads')
  if (yt && has(yt.messaging.cta, 'live now') && (yt.rtbMap?.cta ?? []).length === 0) {
    out.push({
      id: 'brk-proof-yt',
      axis: 'proof',
      severity: 'high',
      headline: 'Your YouTube retargeting CTA claims “live now” with no proof behind it.',
      client,
      campaign,
      audienceType: 'Retargeting – Site Visitors',
      from: { role: 'YouTube retargeting CTA', assetName: yt.assetName, channel: 'youtube-ads', field: 'cta', text: yt.messaging.cta, highlight: 'live now' },
      why: '“Live now” is an availability claim with nothing substantiating it. Your ICP discounts hype and wants proof — an unbacked claim is exactly what they tune out.',
      brandRule: 'No hype or superlatives you cannot back up.',
      suggestedFix: { assetName: yt.assetName, channel: 'youtube-ads', field: 'cta', before: yt.messaging.cta, after: 'Watch the 2-min demo' },
      status: 'open',
    })
  }

  // #4 Weak CTA — the consideration email's CTA doesn't cash the "2x faster" promise.
  const email = find(rows, 'launch-announcement.md', 'email')
  if (email && /learn more|see what|read more/i.test(email.messaging.cta ?? '')) {
    out.push({
      id: 'brk-cta-email',
      axis: 'cta',
      severity: 'low',
      headline: 'Your Consideration email opens “2x faster” but closes with a soft “Learn more.”',
      client,
      campaign,
      from: { role: 'Consideration email CTA', assetName: email.assetName, channel: 'email', field: 'cta', text: email.messaging.cta, highlight: email.messaging.cta },
      why: 'The email makes the “2x faster” promise, then its CTA fails to convert that intent into an action. The funnel’s momentum leaks at the handoff.',
      brandRule: 'Keep one promise per asset and carry it through the funnel.',
      suggestedFix: { assetName: email.assetName, channel: 'email', field: 'cta', before: email.messaging.cta, after: 'Start shipping 2x faster' },
      status: 'open',
    })
  }

  return out
}

// ---------------------------------------------------------------------------
// Live brand-voice check — detects real violations of the brand guide's don'ts
// in any copy, not just the hand-seeded thread breaks. Runs on the actual
// messaging, so it fires as the team writes (the check is a capability, not a
// fixture). Each match cites the brand rule it breaks.
// ---------------------------------------------------------------------------

interface VoiceRule {
  id: string
  /** Matches the offending span; the first capture group (or full match) is highlighted. */
  test: RegExp
  severity: BreakSeverity
  headline: string
  why: string
  brandRule: string
  /** Produce the fixed value for the whole field given the original. */
  fix: (text: string) => string
}

const VOICE_RULES: VoiceRule[] = [
  {
    id: 'em-dash',
    test: /\s+—\s+|—/,
    severity: 'low',
    headline: 'This copy uses an em dash.',
    why: 'House style: commas, colons, and periods carry the rhythm. Em dashes read as filler and slow the eye.',
    brandRule: 'No em dashes — commas and periods carry the rhythm.',
    fix: (t) => t.replace(/\s*—\s*/g, ', ').replace(/,\s*,/g, ','),
  },
  {
    id: 'hype',
    test: /\b(best ever|#1|number one|revolutionary|game[- ]?changing|world[- ]?class|unbeatable|guaranteed|the ultimate)\b/i,
    severity: 'medium',
    headline: 'This copy leans on hype you cannot back up.',
    why: 'Your ICP discounts superlatives and wants proof. An unbackable claim reads as marketing noise.',
    brandRule: 'No hype or superlatives you cannot back up.',
    fix: (t) =>
      t
        .replace(/\b(best ever|#1|number one|revolutionary|game[- ]?changing|world[- ]?class|unbeatable|guaranteed|the ultimate)\b/i, '')
        .replace(/\s{2,}/g, ' ')
        .trim(),
  },
]

/** Scan in-scope copy for brand-voice violations and emit them as breaks. */
export function detectVoiceBreaks(rows: TrafficRow[]): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  for (const r of rows) {
    if (r.status === 'posted' || r.status === 'failed') continue
    for (const [field, value] of Object.entries(r.messaging ?? {})) {
      if (!value?.trim()) continue
      for (const rule of VOICE_RULES) {
        const m = value.match(rule.test)
        if (!m) continue
        const highlight = (m[1] ?? m[0]).trim()
        out.push({
          id: `voice-${rule.id}-${r.id}-${field}`,
          axis: 'voice',
          severity: rule.severity,
          headline: rule.headline,
          client: clientForVoice(r),
          campaign: (r.campaign ?? '').trim(),
          from: { role: `${r.channel} · ${field}`, assetName: r.assetName, channel: r.channel, field, text: value, highlight },
          why: rule.why,
          brandRule: rule.brandRule,
          suggestedFix: { assetName: r.assetName, channel: r.channel, field, before: value, after: rule.fix(value) },
          status: 'open',
        })
      }
    }
  }
  return out
}

// Voice breaks aren't client-specific in their logic, but carry the row's client
// label for scoping; resolved lazily to avoid importing the clients map here.
const clientForVoice = (_r: TrafficRow): string => ''

// ---------------------------------------------------------------------------
// Generalized, content-driven structural checks — client-agnostic, so the
// always-on engine works on ANY brand's real copy, not just the seeded Acme
// fixtures. Conservative by design: precision over recall, so a flag is worth
// acting on rather than tuned out. (Journey + audience drift stay seeded/LLM —
// they need semantic judgment these structural rules can't safely make.)
// ---------------------------------------------------------------------------

const reviewableRow = (r: TrafficRow) => r.status !== 'posted' && r.status !== 'failed'

// A measurable performance or availability claim — the kind that needs a proof
// point behind it. Hype/superlatives are left to the brand-voice rules above, so
// the two checks don't double-flag the same words.
const CLAIM_SIGNAL = /(\d+(?:\.\d+)?\s?%|\b\d+x\b|\$\s?\d[\d,]*|\blive now\b|\bnow live\b|\bavailable now\b)/i

// CTAs that don't cash a promise — a conversion step that asks for nothing.
const SOFT_CTA = /^(learn more|read more|see more|find out more|discover more|click here|view|explore|more|see how)\.?$/i

/** The asset's primary CTA component — covers multi-CTA pages (cta-mid, etc.). */
function ctaEntry(r: TrafficRow): { field: string; value: string } | null {
  const m = r.messaging ?? {}
  for (const fld of messagingFields(r.channel, r.assetType)) {
    if (!isCtaField(fld.key)) continue
    const v = (m[fld.key] ?? '').trim()
    if (v) return { field: fld.key, value: v }
  }
  return null
}

/** Best-matching campaign RTB for a claim, by word overlap — the proof to attach. */
function bestRtbForClaim(campaign: string, claim: string): string | undefined {
  const rtbs = rtbsForCampaign(campaign)
  if (!rtbs.length) return undefined
  const words = new Set(claim.toLowerCase().match(/[a-z]{3,}/g) ?? [])
  let best: string | undefined
  let bestScore = 0
  for (const rtb of rtbs) {
    const hay = `${rtb.label} ${rtb.detail}`.toLowerCase()
    let score = 0
    for (const w of words) if (hay.includes(w)) score++
    if (score > bestScore) {
      bestScore = score
      best = rtb.id
    }
  }
  return bestScore > 0 ? best : undefined
}

/** Unsupported claims: a measurable claim in a component with no RTB attached.
 *  Fix = attach the best-matching proof point if one exists, else soften the claim. */
export function detectProofGaps(rows: TrafficRow[]): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  for (const r of rows) {
    if (!reviewableRow(r)) continue
    const campaign = (r.campaign ?? '').trim()
    for (const [field, value] of Object.entries(r.messaging ?? {})) {
      const v = (value ?? '').trim()
      if (!v) continue
      const m = v.match(CLAIM_SIGNAL)
      if (!m) continue
      if ((r.rtbMap?.[field] ?? []).length > 0) continue // already backed by proof
      const highlight = m[0].trim()
      const rtb = bestRtbForClaim(campaign, v)
      const softened = v
        .replace(m[0], '')
        .replace(/\s{2,}/g, ' ')
        .replace(/\s+([.,!?])/g, '$1')
        .trim()
      out.push({
        id: `proofgap-${r.id}-${field}`,
        axis: 'proof',
        severity: 'high',
        headline: `“${highlight}” is a claim with no proof point behind it.`,
        client: '',
        campaign,
        from: { role: `${r.channel} · ${field}`, assetName: r.assetName, channel: r.channel, field, text: v, highlight },
        why: 'A measurable claim with nothing substantiating it reads as hype. Buyers who discount hype tune out exactly these unbacked lines.',
        brandRule: 'Every claim carries its proof — attach the RTB, or soften the claim.',
        suggestedFix: rtb
          ? { assetName: r.assetName, channel: r.channel, field, before: v, after: v, attachRtb: rtb }
          : { assetName: r.assetName, channel: r.channel, field, before: v, after: softened || v },
        status: 'open',
      })
    }
  }
  return out
}

/** Weak CTAs: a soft CTA on an asset that makes a promise it never cashes. */
export function detectWeakCtas(rows: TrafficRow[]): CoherenceBreak[] {
  const out: CoherenceBreak[] = []
  for (const r of rows) {
    if (!reviewableRow(r)) continue
    const cta = ctaEntry(r)
    if (!cta || !SOFT_CTA.test(cta.value)) continue
    // Only a problem if the asset actually makes a promise to convert.
    const promise = Object.entries(r.messaging ?? {}).some(
      ([f, v]) => f !== cta.field && CLAIM_SIGNAL.test(v ?? ''),
    )
    if (!promise) continue
    out.push({
      id: `weakcta-${r.id}-${cta.field}`,
      axis: 'cta',
      severity: 'low',
      headline: `This asset makes a promise, then closes with a soft “${cta.value}.”`,
      client: '',
      campaign: (r.campaign ?? '').trim(),
      from: { role: `${r.channel} · ${cta.field}`, assetName: r.assetName, channel: r.channel, field: cta.field, text: cta.value, highlight: cta.value },
      why: 'The copy builds intent with a concrete promise, then the CTA fails to convert it into an action. The funnel’s momentum leaks at the ask.',
      brandRule: 'Carry the promise through to the CTA — ask for the action the copy earned.',
      suggestedFix: { assetName: r.assetName, channel: r.channel, field: cta.field, before: cta.value, after: 'Get started' },
      status: 'open',
    })
  }
  return out
}

/** Identity of the asset component a break covers — for dedupe across detectors. */
const coverKey = (b: CoherenceBreak) => `${b.from.assetName}|${b.from.channel ?? ''}|${b.from.field}`

/**
 * The full connection check: the seeded thread breaks (polished, demo anchors)
 * plus the generalized structural checks (proof gaps, weak CTAs) and the live
 * voice check — the latter three running on any client's real copy. A seeded
 * break wins its component, so the hand-authored copy isn't shadowed by a
 * generic one for the same field.
 */
export function detectBreaks(rows: TrafficRow[]): CoherenceBreak[] {
  const seeded = detectAcmeBreaks(rows)
  const seededKeys = new Set(seeded.map(coverKey))
  const general = [...detectProofGaps(rows), ...detectWeakCtas(rows), ...detectVoiceBreaks(rows)].filter(
    (b) => !seededKeys.has(coverKey(b)),
  )
  return [...seeded, ...general]
}

/** A scope key for caching a Claude coherence run (client + campaign). */
export const breakScopeKey = (client: string, campaign: string): string => `${client}|${campaign}`

/** A cheap content fingerprint of the reviewable copy in scope — it changes the
 *  moment any messaging or proof mapping is edited, so the continuous check knows
 *  when to re-run and when a cached Claude result is stale. */
export function coherenceContentHash(rows: TrafficRow[]): string {
  let h = 0
  for (const r of rows) {
    if (r.status === 'posted' || r.status === 'failed') continue
    const s = `${r.id}|${Object.entries(r.messaging ?? {}).flat().join('')}|${Object.entries(r.rtbMap ?? {}).flat().join(',')}`
    for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  }
  return (h >>> 0).toString(36)
}

/**
 * The break set for the current scope: Claude's last run when it covers this exact
 * scope, otherwise the synchronous heuristic. The default (no Claude run) is the
 * heuristic, so the always-on check is unchanged until a recheck is requested.
 */
export function resolveBreaks(
  rows: TrafficRow[],
  claudeBreaks: CoherenceBreak[] | null,
  claudeScope: string | null,
  currentScope: string,
): CoherenceBreak[] {
  if (claudeBreaks && claudeScope === currentScope) return claudeBreaks
  return detectBreaks(rows)
}

/** Overlay persisted statuses (intended / in-review) onto detected breaks. */
export function applyBreakStatus(
  breaks: CoherenceBreak[],
  statusMap: Record<string, BreakStatus>,
): CoherenceBreak[] {
  return breaks.map((b) => (statusMap[b.id] ? { ...b, status: statusMap[b.id] } : b))
}
