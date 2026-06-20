/**
 * Onboarding readiness — a functional prerequisite audit, not account hygiene.
 *
 * The connection/coherence check evaluates messaging against the brand + strategy,
 * so if there's no brand definition the core capability has nothing to check
 * against. This module audits what exists across two tiers and (for the gaps Claude
 * can fill) drafts starter versions for the user to confirm. Per the product stance:
 * AUDIT + GENERATE, don't interrogate. Nothing hard-blocks launch — gaps warn, and
 * the fast path is "confirm the draft Claude made."
 */

/** A usable starter brand guide — what the coherence check evaluates against. */
export interface BrandGuide {
  voice: string
  tone: string
  dos: string[]
  donts: string[]
  visual: string
}

export type ReadyStatus = 'ready' | 'generated' | 'missing'
export type ReadyTier = 1 | 2

export type ReadyAction =
  | 'generate-brand'
  | 'confirm-brand'
  | 'add-audience'
  | 'add-website'
  | 'connect-channel'
  | 'set-tracking'
  | 'connect-crm'
  | 'none'

export interface ReadinessItem {
  key: string
  tier: ReadyTier
  label: string
  why: string
  status: ReadyStatus
  /** True when Claude can draft a starter for this gap. */
  generatable: boolean
  action: ReadyAction
}

export interface ReadinessCtx {
  hasWebsite: boolean
  /** undefined = none; confirmed flag distinguishes generated-vs-ready. */
  brandGuide?: { confirmed: boolean }
  audienceCount: number
  channelConnected: boolean
  rtbCount: number
  trackingReady: boolean
  crmConnected: boolean
}

const brandStatus = (b?: { confirmed: boolean }): ReadyStatus =>
  !b ? 'missing' : b.confirmed ? 'ready' : 'generated'

/** Audit the inputs the product depends on, tiered by how blocking they are. */
export function auditReadiness(ctx: ReadinessCtx): ReadinessItem[] {
  const bs = brandStatus(ctx.brandGuide)
  return [
    {
      key: 'brand',
      tier: 1,
      label: 'Brand guide',
      why: "Voice, tone, do's and don'ts — literally what the connection check evaluates against.",
      status: bs,
      generatable: true,
      action: bs === 'missing' ? 'generate-brand' : bs === 'generated' ? 'confirm-brand' : 'none',
    },
    {
      key: 'audiences',
      tier: 1,
      label: 'Audiences / ICP',
      why: 'Who they target. The personalization model maps messages to defined audiences.',
      status: ctx.audienceCount > 0 ? 'ready' : 'missing',
      generatable: true,
      action: ctx.audienceCount > 0 ? 'none' : 'add-audience',
    },
    {
      key: 'website',
      tier: 1,
      label: 'Website / web presence',
      why: 'The source of truth Claude reads to infer brand, audiences, and proof.',
      status: ctx.hasWebsite ? 'ready' : 'missing',
      generatable: false,
      action: ctx.hasWebsite ? 'none' : 'add-website',
    },
    {
      key: 'channel',
      tier: 1,
      label: 'A connected channel',
      why: 'Somewhere to actually traffic to — otherwise the "ship it" half is dead.',
      status: ctx.channelConnected ? 'ready' : 'missing',
      generatable: false,
      action: ctx.channelConnected ? 'none' : 'connect-channel',
    },
    {
      key: 'rtbs',
      tier: 2,
      label: 'RTBs / proof points',
      why: 'Substantiate the claims. Generate from the site initially, refine later.',
      status: ctx.rtbCount > 0 ? 'ready' : 'missing',
      generatable: true,
      action: 'none',
    },
    {
      key: 'tracking',
      tier: 2,
      label: 'Tracking / analytics',
      why: 'Clean data and the attribution loop. A first campaign can ship before it is perfect.',
      status: ctx.trackingReady ? 'ready' : 'missing',
      generatable: false,
      action: ctx.trackingReady ? 'none' : 'set-tracking',
    },
    {
      key: 'crm',
      tier: 2,
      label: 'CRM (Attio / HubSpot)',
      why: 'Closed-loop attribution. An expansion-stage input, not a day-one blocker.',
      status: ctx.crmConnected ? 'ready' : 'missing',
      generatable: false,
      action: ctx.crmConnected ? 'none' : 'connect-crm',
    },
  ]
}

export interface ReadinessSummary {
  total: number
  ready: number
  /** Tier-1 gaps — warned, never blocked. */
  tier1Gaps: number
  tier2Gaps: number
  /** Brand-only minimum to ship: a confirmed brand starter. */
  canShip: boolean
}

export function readinessSummary(items: ReadinessItem[]): ReadinessSummary {
  const ready = items.filter((i) => i.status === 'ready').length
  const brand = items.find((i) => i.key === 'brand')
  return {
    total: items.length,
    ready,
    tier1Gaps: items.filter((i) => i.tier === 1 && i.status !== 'ready').length,
    tier2Gaps: items.filter((i) => i.tier === 2 && i.status !== 'ready').length,
    canShip: brand?.status === 'ready',
  }
}

const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase())

/**
 * Draft a usable starter brand guide from what we know (profile + business model).
 * Voice, tone, a few do's and don'ts, and basic visual rules — enough for the
 * coherence check to evaluate against. Expandable later. No em dashes (house style).
 */
export function draftBrandGuide(
  client: string,
  profile?: { voice?: string; industry?: string; businessModel?: string },
): BrandGuide {
  const tone = profile?.voice?.trim() || 'Clear, confident, and human'
  const industry = profile?.industry?.trim()
  const isB2C = /B2C|D2C/i.test(profile?.businessModel ?? '')
  const audienceWord = isB2C ? 'customers' : 'buyers'
  return {
    voice: `${titleCase(client)} sounds ${tone.toLowerCase()}. Plain language over jargon, specific over vague, and every claim is backed by proof${
      industry ? ` that a ${industry} ${audienceWord} would recognize` : ''
    }.`,
    tone: tone,
    dos: [
      'Lead with the concrete outcome, then the proof behind it',
      'Use the numbers you can substantiate (and attach the RTB)',
      `Speak to one ${audienceWord.slice(0, -1)} at a time, in their language`,
      'Keep one promise per asset and carry it through the funnel',
    ],
    donts: [
      'No hype or superlatives you cannot back up',
      'No vague claims (write "2x faster", not "faster than ever")',
      'No jargon the audience would not use themselves',
      'No em dashes, commas and periods carry the rhythm',
    ],
    visual: isB2C
      ? 'Warm, high-contrast, lifestyle-forward. Bold type, generous imagery, one clear CTA per frame.'
      : 'Clean, utilitarian, evidence-forward. Restrained palette, clear hierarchy, charts and proof over stock imagery.',
  }
}
