import type { AudienceType } from './audiences'
import { CHANNELS } from './channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import { SUGGEST_BY_STAGE, ctaFor, type MatrixCell } from './matrix'
import { draftCellRow } from './matrixDraft'
import type { Rtb } from './rtb'
import type { ChannelId, TrafficRow } from './types'

/**
 * "Branch this card" — the next steps a card could push the person to. Marketing
 * is routing, so the suggestions are the immediate next journey stage on a few
 * high-leverage channels. Picking one drafts that asset (from the brand model)
 * and records it as a branch off the source, so the canvas draws the fork.
 */

export interface BranchSuggestion {
  stage: FunnelStage
  stageLabel: string
  channel: ChannelId
  channelLabel: string
  label: string
  /** Where the branch lands relative to the source: a same-stage variant (fan one
   *  angle into more channel cuts) or the next step forward down the funnel. */
  group: 'this-stage' | 'next-step'
}

/**
 * The ways a card can branch. Marketing is routing, so a card should fan out:
 *  - same-stage variants — the same message cut for other channels at this stage;
 *  - next steps — where this card pushes the person next in the journey.
 * Each pick drafts a fork off the source, so the canvas grows as a forking
 * journey. The more it forks, the more specific the routing.
 */
export function branchSuggestions(row: TrafficRow): BranchSuggestion[] {
  const cur = funnelStageFor(row.channel, row.assetType)
  const idx = FUNNEL_STAGES.findIndex((s) => s.stage === cur)
  const here = FUNNEL_STAGES[idx] ?? FUNNEL_STAGES[0]
  const out: BranchSuggestion[] = []
  // Same-stage variants — fan this angle into other channels at the same stage.
  for (const ch of SUGGEST_BY_STAGE[here.stage]) {
    if (ch === row.channel) continue
    out.push({
      stage: here.stage,
      stageLabel: here.label,
      channel: ch,
      channelLabel: CHANNELS[ch]?.label ?? ch,
      label: CHANNELS[ch]?.label ?? ch,
      group: 'this-stage',
    })
  }
  // Next step forward — push the person to the next stage of the journey.
  const next = FUNNEL_STAGES[idx + 1]
  if (next) {
    for (const ch of SUGGEST_BY_STAGE[next.stage].slice(0, 3)) {
      out.push({
        stage: next.stage,
        stageLabel: next.label,
        channel: ch,
        channelLabel: CHANNELS[ch]?.label ?? ch,
        label: CHANNELS[ch]?.label ?? ch,
        group: 'next-step',
      })
    }
  }
  return out
}

/** The channels to draft a new asset on for a given funnel stage — the high-
 *  leverage options for that part of the journey. Used when you click an empty
 *  cell on the canvas to place a card: pick which channel carries it. */
export function stageSuggestions(stage: FunnelStage): BranchSuggestion[] {
  const st = FUNNEL_STAGES.find((s) => s.stage === stage) ?? FUNNEL_STAGES[0]
  return SUGGEST_BY_STAGE[stage].slice(0, 3).map((ch) => ({
    stage,
    stageLabel: st.label,
    channel: ch,
    channelLabel: CHANNELS[ch]?.label ?? ch,
    label: CHANNELS[ch]?.label ?? ch,
    group: 'this-stage' as const,
  }))
}

/** Compose a fresh asset for an audience at a chosen funnel stage / channel —
 *  drafted straight from the brand model (angle + lead proof + stage CTA), with
 *  no source. This is what placing a card on a blank cell creates; the branch
 *  button then takes it forward to the next stage. */
export function composeCellAsset(opts: {
  audience: AudienceType
  stage: FunnelStage
  channel: ChannelId
  proof: Rtb | undefined
  campaign: string
  index: number
  now: number
  /** The asset format to draft (falls back to the channel's primary type). */
  assetType?: string
}): TrafficRow {
  const { audience, stage, channel, proof, campaign, index, now, assetType } = opts
  const cell: MatrixCell = {
    stage,
    channels: [],
    proof: proof ? [{ rtb: proof, avgEng: null }] : [],
    cta: ctaFor(stage, audience.outcome),
    suggestion: '',
    covered: 0,
    engagement: 0,
    blocked: false,
    suggestChannels: [],
    suggestChannelIds: [],
  }
  return draftCellRow({ audience, cell, channel, campaign, index, now, assetType })
}

/** Compose the branched next-step asset from the brand model, linked back to the
 *  source as a branch (so the canvas forks from it). Reuses the cell composer. */
export function composeBranchAsset(opts: {
  source: TrafficRow
  audience: AudienceType | undefined
  stage: FunnelStage
  channel: ChannelId
  proof: Rtb | undefined
  campaign: string
  index: number
  now: number
}): TrafficRow {
  const { source, audience, stage, channel, proof, campaign, index, now } = opts
  // draftCellRow only reads name / messageAngle / outcome, so a minimal stand-in
  // is enough when the audience isn't in the defined set.
  const aud: AudienceType =
    audience ??
    ({
      id: (source.audience ?? '').trim(),
      name: (source.audience ?? '').trim(),
      role: '',
      rtbEmphasis: [],
      channels: [],
    } as unknown as AudienceType)
  const cell: MatrixCell = {
    stage,
    channels: [],
    proof: proof ? [{ rtb: proof, avgEng: null }] : [],
    cta: ctaFor(stage, aud.outcome),
    suggestion: '',
    covered: 0,
    engagement: 0,
    blocked: false,
    suggestChannels: [],
    suggestChannelIds: [],
  }
  const row = draftCellRow({ audience: aud, cell, channel, campaign, index, now })
  row.branchOf = source.assetName
  return row
}
