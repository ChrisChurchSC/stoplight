import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import { canonToPhase } from './strategies'
import type { ChannelId } from './types'

/**
 * Per-playbook funnel stages. A GTM playbook runs its own named sequence (ABM →
 * Engage, Convert; Demand Gen → Visitor … Closed), and these defs say which
 * channels land in each stage — so a lead magnet shows up under "Lead", not
 * skipped by a proportional projection. Channels resolve to the canonical
 * 4-stage funnel first; a playbook stage then claims them precisely.
 *
 * Resolution per card (channel + asset type):
 *  1. a stage that explicitly lists the channel wins,
 *  2. else the DEFAULT stage for the card's canonical funnel stage — the one
 *     sharing that `canon` with no `channels` list,
 *  3. else the first stage in that canon,
 *  4. else a proportional fallback.
 *
 * `canon` is also the stage written back when a card is restaged into the band,
 * so the canonical engine (CTA-by-stage, forward-only clamping) stays intact.
 * A stage with `channels: []` is an intentional milestone (a sales/advocacy step
 * with no marketing channel) — it renders as an empty band, which is honest.
 */
export interface PlaybookStage {
  label: string
  canon: FunnelStage
  /** Channels that land precisely in this stage. Omit to make it the default for
   *  its canon; use [] to make it an empty milestone band. */
  channels?: ChannelId[]
}

// Gated lead-capture — a "Lead/signup" stage draws from gated content. Kept to
// the lead-magnet channel only: it's canonically consideration, so it splits the
// consideration bucket WITHOUT inverting funnel order. (Landing pages are
// canonically conversion and stay in the conversion-region stages, so a journey's
// forward-only flow is preserved and no edge has to draw upward.)
const CAPTURE: ChannelId[] = ['lead-magnet']

/**
 * The 10 GTM playbooks' funnel stages, keyed by GtmStrategy.key. Labels match
 * each playbook's `sequence` tokens. Most stages just declare a `canon`; channel
 * lists appear only where a canonical bucket splits (capture vs nurture), and []
 * marks pure milestone stages.
 */
export const PLAYBOOK_FUNNELS: Record<string, PlaybookStage[]> = {
  'demand-gen': [
    { label: 'Visitor', canon: 'awareness' },
    { label: 'Lead', canon: 'consideration', channels: CAPTURE },
    { label: 'MQL', canon: 'consideration' },
    { label: 'SQL', canon: 'conversion' },
    { label: 'Opp', canon: 'conversion', channels: [] },
    { label: 'Closed', canon: 'retention' },
  ],
  plg: [
    { label: 'Activate', canon: 'awareness' },
    { label: 'Adopt', canon: 'consideration' },
    { label: 'Convert', canon: 'conversion' },
    { label: 'Expand', canon: 'retention' },
    { label: 'Advocate', canon: 'retention', channels: [] },
  ],
  'sales-led': [
    { label: 'Lead', canon: 'consideration', channels: CAPTURE },
    { label: 'MQL', canon: 'consideration' },
    { label: 'SQL', canon: 'conversion' },
    { label: 'Opp', canon: 'conversion', channels: [] },
    { label: 'Closed', canon: 'retention' },
  ],
  lifecycle: [
    { label: 'Awareness', canon: 'awareness' },
    { label: 'Onboard', canon: 'consideration' },
    { label: 'Adopt', canon: 'conversion' },
    { label: 'Retain', canon: 'retention' },
    { label: 'Advocate', canon: 'retention', channels: [] },
  ],
  aarrr: [
    { label: 'Acquisition', canon: 'awareness' },
    { label: 'Activation', canon: 'consideration' },
    { label: 'Retention', canon: 'retention' },
    { label: 'Referral', canon: 'retention', channels: [] },
    { label: 'Revenue', canon: 'conversion' },
  ],
  bowtie: [
    { label: 'Acquire', canon: 'awareness' },
    { label: 'Close', canon: 'conversion' },
    { label: 'Onboard', canon: 'retention' },
    { label: 'Adopt', canon: 'retention', channels: [] },
    { label: 'Expand', canon: 'retention', channels: [] },
    { label: 'Renew', canon: 'retention', channels: [] },
  ],
  abm: [
    { label: 'Engage', canon: 'consideration' },
    { label: 'Convert', canon: 'conversion' },
  ],
  'content-seo': [
    { label: 'Research', canon: 'awareness' },
    { label: 'Distribute', canon: 'consideration' },
    { label: 'Capture', canon: 'conversion' },
    { label: 'Analyze', canon: 'retention' },
  ],
  outbound: [
    { label: 'Contact', canon: 'awareness' },
    { label: 'Reply', canon: 'consideration' },
    { label: 'Meeting', canon: 'conversion' },
    { label: 'Opportunity', canon: 'retention' },
  ],
  community: [
    { label: 'Join', canon: 'awareness' },
    { label: 'Engage', canon: 'consideration' },
    { label: 'Contribute', canon: 'retention' },
    { label: 'Convert', canon: 'conversion' },
    { label: 'Retain', canon: 'retention', channels: [] },
  ],
  'local-takeover': [
    { label: 'Discover', canon: 'awareness' },
    { label: 'Visit', canon: 'consideration' },
    { label: 'Convert', canon: 'conversion' },
    { label: 'Repeat', canon: 'retention' },
    { label: 'Refer', canon: 'retention', channels: [] },
  ],
}

const CANON_IDX: Record<FunnelStage, number> = FUNNEL_STAGES.reduce(
  (m, s, i) => ((m[s.stage] = i), m),
  {} as Record<FunnelStage, number>,
)

/** The playbook funnel for a strategy key, or null when none is authored (the
 *  caller then falls back to the generic 4-stage funnel / proportional map). */
export function playbookFunnel(key: string | undefined): PlaybookStage[] | null {
  return (key && PLAYBOOK_FUNNELS[key]) || null
}

/**
 * Build the channel → stage-index resolver for a playbook's stages, following
 * the four-step resolution above. Returns the band a card's channel lands in.
 */
export function makeChannelPhase(stages: PlaybookStage[]): (channel: ChannelId, assetType?: string) => number {
  return (channel, assetType) => {
    const explicit = stages.findIndex((s) => s.channels?.includes(channel))
    if (explicit >= 0) return explicit
    const canon = funnelStageFor(channel, assetType)
    const def = stages.findIndex((s) => s.canon === canon && s.channels === undefined)
    if (def >= 0) return def
    const first = stages.findIndex((s) => s.canon === canon)
    if (first >= 0) return first
    return canonToPhase(CANON_IDX[canon], FUNNEL_STAGES.length, stages.length)
  }
}

/** The first playbook stage representing a canonical funnel stage — where a
 *  card restaged (canonically) into that stage lands. */
export function firstPhaseForCanon(stages: PlaybookStage[], canon: FunnelStage): number {
  const i = stages.findIndex((s) => s.canon === canon)
  return i >= 0 ? i : canonToPhase(CANON_IDX[canon], FUNNEL_STAGES.length, stages.length)
}
