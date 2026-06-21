import { detectBreaks, type BreakAxis, type BreakSeverity, type CoherenceBreak } from '../../domain/breaks'
import { funnelStageFor } from '../../domain/funnel'
import { messagingMap } from '../../domain/messaging'
import type { ChannelId, TrafficRow } from '../../domain/types'

/**
 * Claude-powered coherence detection: POSTs the campaign's assets to the
 * server-side /api/coherence-check (which calls Claude) and maps the result back
 * to CoherenceBreak[]. Falls back to the heuristic detectBreaks() when the backend
 * is absent, has no key (501), or errors — so the check always returns something,
 * key or not. `live` reports which path answered. Same seam as ClaudeIcpReviewer.
 */

export interface CoherenceContext {
  client: string
  campaign: string
  icp: unknown
  brandGuide: unknown
}

interface RawEvidence {
  role: string
  assetName: string
  channel: string
  field: string
  text: string
  highlight: string
}
interface RawBreak {
  axis: BreakAxis
  severity: BreakSeverity
  headline: string
  audienceType?: string
  from: RawEvidence
  to?: RawEvidence | null
  why: string
  brandRule?: string
  suggestedFix: { assetName: string; channel: string; field: string; before: string; after: string }
}

const slug = (s: string) => s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40)

function toBreak(b: RawBreak, client: string, campaign: string): CoherenceBreak {
  const ev = (e: RawEvidence) => ({
    role: e.role,
    assetName: e.assetName,
    channel: e.channel as ChannelId,
    field: e.field,
    text: e.text,
    highlight: e.highlight,
  })
  return {
    // Content-derived id so a human's intended/in-review status sticks across re-checks.
    id: `cl-${b.axis}-${slug(b.from.assetName)}-${slug(b.from.field)}`,
    axis: b.axis,
    severity: b.severity,
    headline: b.headline,
    campaign,
    client,
    audienceType: b.audienceType,
    from: ev(b.from),
    to: b.to ? ev(b.to) : undefined,
    why: b.why,
    brandRule: b.brandRule,
    suggestedFix: {
      assetName: b.suggestedFix.assetName,
      channel: b.suggestedFix.channel as ChannelId,
      field: b.suggestedFix.field,
      before: b.suggestedFix.before,
      after: b.suggestedFix.after,
    },
    status: 'open',
  }
}

export async function claudeCoherence(
  rows: TrafficRow[],
  ctx: CoherenceContext,
): Promise<{ breaks: CoherenceBreak[]; live: boolean }> {
  const assets = rows.map((r) => ({
    assetName: r.assetName,
    channel: r.channel,
    assetType: r.assetType,
    audience: r.audience || 'Unsegmented',
    stage: funnelStageFor(r.channel, r.assetType),
    messaging: messagingMap(r),
  }))

  try {
    const res = await fetch('/api/coherence-check', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ client: ctx.client, campaign: ctx.campaign, icp: ctx.icp, brandGuide: ctx.brandGuide, assets }),
    })
    if (!res.ok) throw new Error(`coherence ${res.status}`)
    const data = (await res.json()) as { breaks?: RawBreak[] }
    if (!Array.isArray(data?.breaks)) throw new Error('bad shape')
    return { breaks: data.breaks.map((b) => toBreak(b, ctx.client, ctx.campaign)), live: true }
  } catch {
    // No backend / no key / error → heuristic detector keeps the check working.
    return { breaks: detectBreaks(rows), live: false }
  }
}
