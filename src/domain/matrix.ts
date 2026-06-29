import type { AudienceType } from './audiences'
import { CHANNELS } from './channels'
import { FUNNEL_STAGES, funnelStageFor, type FunnelStage } from './funnel'
import { brandPerformance } from './performance'
import { formatOf } from './presence'
import { assetRtbIds, type Rtb } from './rtb'
import type { ChannelId, TrafficRow } from './types'

/**
 * The personalization matrix — the hyper-personalization surface that sits on top
 * of the Foundation. For every AUDIENCE (row) at every journey STAGE (column), and
 * broken out by CHANNEL inside each cell, it answers: what is the tailored message
 * here? It composes the recipe from the standing model (the audience's angle, the
 * proof it leans on, its outcome) and ranks the proof by what is actually working
 * (real engagement). Then it overlays live coverage so the gaps are obvious: an
 * audience/stage we have a recipe for but no content (a gap), or one no channel
 * even reaches (blocked).
 *
 * Same brand truth, a different message per cell — custom at scale, with the human
 * still in control of every draft.
 */

/** One audience's channel inside a stage cell — the third axis made concrete. */
export interface CellChannel {
  id: ChannelId
  label: string
  color: string
  format: string
  /** The brand is already live on this channel for this audience/stage. */
  used: boolean
  /** Live assets here, and their engagement. */
  covered: number
  engagement: number
  /** A one-line tailored hook for this exact audience x channel x stage. */
  hook: string
}

export interface MatrixCell {
  stage: FunnelStage
  /** Channels serving this stage for this audience (declared + actually used). */
  channels: CellChannel[]
  /** Proof to lead with here — the audience's emphasized RTBs, best-performing
   *  first (avg engagement). avgEng is null when the proof has no live data yet. */
  proof: { rtb: Rtb; avgEng: number | null }[]
  /** The action this cell drives, laddering toward the audience's outcome. */
  cta: string
  /** A composed, ready-to-adapt message line: angle + lead proof + CTA. */
  suggestion: string
  /** Live assets targeting this audience at this stage (across all its channels). */
  covered: number
  engagement: number
  /** No channel reaches this stage for this audience — a structural hole. */
  blocked: boolean
  /** When blocked: channels that would open this stage (labels for display). */
  suggestChannels: string[]
  /** When blocked: the channel ids that would open this stage — so a draft can
   *  open + fill it in one move. */
  suggestChannelIds: ChannelId[]
}

export interface MatrixRow {
  audience: AudienceType
  cells: MatrixCell[]
  /** Reachable stages with a recipe but no live content. */
  gaps: number
  /** Stages no channel reaches. */
  blocked: number
}

export interface PersonalizationMatrix {
  stages: typeof FUNNEL_STAGES
  rows: MatrixRow[]
  totals: { cells: number; covered: number; gaps: number; blocked: number }
}

const eng = (r: TrafficRow): number => (r.engagement ? r.engagement.likes + r.engagement.comments : 0)

// High-leverage channels to open a stage that no channel currently reaches.
export const SUGGEST_BY_STAGE: Record<FunnelStage, ChannelId[]> = {
  awareness: ['instagram', 'youtube', 'tiktok'],
  consideration: ['linkedin', 'blog', 'youtube'],
  conversion: ['landing-page', 'email', 'google-search'],
  retention: ['email', 'sms', 'push'],
}

/** The CTA for a stage, laddering toward the audience's chosen outcome. No em
 *  dashes — this is product copy. */
export function ctaFor(stage: FunnelStage, outcome?: string): string {
  const o = outcome?.trim()
  switch (stage) {
    case 'awareness':
      return 'Follow along'
    case 'consideration':
      return 'Go deeper (watch / listen / read)'
    case 'conversion':
      return o || 'Take the next step'
    case 'retention':
      return o ? `${o} again, then bring someone with you` : 'Stay in and bring others'
  }
}

/** Compose a starting message line from the standing model. Deterministic so it
 *  always works; a Claude draft can refine it later. Avoids em dashes. */
function compose(audience: AudienceType, lead: Rtb | undefined, cta: string): string {
  const angle = audience.messageAngle?.trim()
  const intro = angle || `What ${audience.name || 'this audience'} cares about`
  const proof = lead ? ` Proof: ${lead.label}.` : ' Add a proof point.'
  return `${intro}.${proof} → ${cta}`
}

function channelHook(audience: AudienceType, format: string, channelLabel: string, cta: string): string {
  const angle = audience.messageAngle?.trim()
  const lead = angle ? angle.split(/[.;]/)[0].trim() : `Reach ${audience.name || 'them'}`
  return `${channelLabel} (${format}): ${lead}. → ${cta}`
}

export function buildMatrix(
  audiences: AudienceType[],
  rows: TrafficRow[],
  rtbById: Map<string, Rtb>,
): PersonalizationMatrix {
  // What's working, by proof point — used to rank the proof inside each cell.
  const perf = brandPerformance(rows)
  const avgByRtb = new Map(perf.byRtb.map((p) => [p.key, p.avg]))

  const totals = { cells: 0, covered: 0, gaps: 0, blocked: 0 }

  const matrixRows: MatrixRow[] = audiences.map((audience) => {
    const audRows = rows.filter((r) => (r.audience ?? '').trim() === audience.name.trim())

    // The audience's emphasized proof, ranked by real engagement (best first).
    const proof = audience.rtbEmphasis
      .map((id) => rtbById.get(id))
      .filter((r): r is Rtb => !!r)
      .map((rtb) => ({ rtb, avgEng: avgByRtb.has(rtb.id) ? avgByRtb.get(rtb.id)! : null }))
      .sort((a, b) => (b.avgEng ?? -1) - (a.avgEng ?? -1))
    const lead = proof[0]?.rtb

    let gaps = 0
    let blocked = 0

    const cells: MatrixCell[] = FUNNEL_STAGES.map(({ stage }) => {
      const cta = ctaFor(stage, audience.outcome)
      const stageRows = audRows.filter((r) => funnelStageFor(r.channel, r.assetType) === stage)

      // Declared channels for this stage + channels the brand already uses here.
      const declared = audience.channels.filter((c) => funnelStageFor(c) === stage)
      const usedSet = new Set(stageRows.map((r) => r.channel))
      const chIds = [...new Set<ChannelId>([...declared, ...usedSet])]

      const channels: CellChannel[] = chIds.map((id) => {
        const here = stageRows.filter((r) => r.channel === id)
        const format = formatOf(id)
        return {
          id,
          label: CHANNELS[id]?.label ?? id,
          color: CHANNELS[id]?.color ?? '#888',
          format,
          used: usedSet.has(id),
          covered: here.length,
          engagement: here.reduce((a, r) => a + eng(r), 0),
          hook: channelHook(audience, format, CHANNELS[id]?.label ?? id, cta),
        }
      })

      const covered = stageRows.length
      const engagement = stageRows.reduce((a, r) => a + eng(r), 0)
      const blockedCell = chIds.length === 0

      totals.cells += 1
      if (covered > 0) totals.covered += 1
      else if (blockedCell) {
        totals.blocked += 1
        blocked += 1
      } else {
        totals.gaps += 1
        gaps += 1
      }

      return {
        stage,
        channels,
        proof,
        cta,
        suggestion: compose(audience, lead, cta),
        covered,
        engagement,
        blocked: blockedCell,
        suggestChannels: blockedCell
          ? SUGGEST_BY_STAGE[stage].map((c) => CHANNELS[c]?.label ?? c)
          : [],
        suggestChannelIds: blockedCell ? SUGGEST_BY_STAGE[stage] : [],
      }
    })

    return { audience, cells, gaps, blocked }
  })

  return { stages: FUNNEL_STAGES, rows: matrixRows, totals }
}
