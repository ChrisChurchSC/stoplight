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

export type BreakAxis = 'journey' | 'audience' | 'proof' | 'cta'
export type BreakSeverity = 'high' | 'medium' | 'low'
export type BreakStatus = 'open' | 'resolved' | 'intended' | 'in-review'

export const AXIS_META: Record<BreakAxis, { label: string; blurb: string }> = {
  journey: { label: 'Journey handoff', blurb: 'The thread frays as the prospect moves down the funnel.' },
  audience: { label: 'Audience drift', blurb: 'Two variants that should tell one story tell two.' },
  proof: { label: 'Proof gap', blurb: 'A claim or CTA with no backing proof point.' },
  cta: { label: 'Weak CTA', blurb: "A CTA that doesn't cash the promise the funnel made." },
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

/** Overlay persisted statuses (intended / in-review) onto detected breaks. */
export function applyBreakStatus(
  breaks: CoherenceBreak[],
  statusMap: Record<string, BreakStatus>,
): CoherenceBreak[] {
  return breaks.map((b) => (statusMap[b.id] ? { ...b, status: statusMap[b.id] } : b))
}
