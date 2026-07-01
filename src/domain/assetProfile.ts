import { CHANNELS } from './channels'
import { assetRtbIds } from './rtb'
import type { TrafficRow } from './types'

/**
 * Asset performance profiles (Build Brief: Asset Performance Profiles).
 *
 * A library asset (proof point, audience, …) accumulates a living profile from
 * every message that used it. The lineage link makes this possible: a message
 * records which assets composed it (`rtbMap` for proofs, the `audience` tag for
 * audiences), so an outcome on a message flows up to each asset it carried.
 * Reuse across many messages is what makes the data accumulate.
 *
 * The honesty rule is the whole point: we show CONFIDENCE, not just a number.
 * Few uses → "early / directional", never a trend drawn through a handful of
 * dots. Many uses → a real, actionable signal. The intelligence (pattern
 * detection, fatigue, ranking) is deliberately NOT built here — it needs months
 * of real data. This is the capture + honest surface so that intelligence is
 * possible later.
 */

export type Confidence = 'none' | 'early' | 'strong'

/** Uses needed before a signal is "strong" rather than merely directional.
 *  Deliberately conservative — acting on noise is how a tool burns trust. */
export const STRONG_USES = 10

export interface ContextPerf {
  /** The context this slice rolls up (an audience name, a channel label, …). */
  context: string
  uses: number
  avg: number
}

export interface AssetProfile {
  /** Measured uses (shipped messages that have a result back). */
  uses: number
  /** Times attached overall, measured or not. */
  shipped: number
  /** Average engagement per measured use. */
  avg: number
  confidence: Confidence
  /** Per-context breakdown (by audience for a proof, by channel for an audience),
   *  strongest first. */
  byContext: ContextPerf[]
  /** The strongest context — only named with strong overall signal AND ≥3 dots in
   *  that context, so we never crown a winner off one use. */
  best?: ContextPerf
}

const eng = (r: TrafficRow): number => (r.engagement ? r.engagement.likes + r.engagement.comments : 0)

/** Roll a set of messages up into a confidence-weighted profile, sliced by a
 *  context keyer (the dimension we break performance down by). */
function buildProfile(carrying: TrafficRow[], contextOf: (r: TrafficRow) => string): AssetProfile {
  const measured = carrying.filter((r) => r.engagement)
  const uses = measured.length
  const avg = uses ? Math.round(measured.reduce((a, r) => a + eng(r), 0) / uses) : 0

  const by = new Map<string, { uses: number; eng: number }>()
  for (const r of measured) {
    const k = contextOf(r) || '—'
    const cur = by.get(k) ?? { uses: 0, eng: 0 }
    cur.uses += 1
    cur.eng += eng(r)
    by.set(k, cur)
  }
  const byContext = [...by.entries()]
    .map(([context, v]) => ({ context, uses: v.uses, avg: Math.round(v.eng / v.uses) }))
    .sort((a, b) => b.avg - a.avg)

  const confidence: Confidence = uses === 0 ? 'none' : uses >= STRONG_USES ? 'strong' : 'early'
  const best = confidence === 'strong' && byContext[0] && byContext[0].uses >= 3 ? byContext[0] : undefined
  return { uses, shipped: carrying.length, avg, confidence, byContext, best }
}

/** A proof point's profile, from every message that carried it (sliced by audience). */
export function proofProfile(rtbId: string, rows: TrafficRow[]): AssetProfile {
  return buildProfile(
    rows.filter((r) => assetRtbIds(r).includes(rtbId)),
    (r) => (r.audience ?? '').trim() || 'Unsegmented',
  )
}

/** An audience's profile, from every message targeted at it (sliced by channel). */
export function audienceProfile(audienceName: string, rows: TrafficRow[]): AssetProfile {
  return buildProfile(
    rows.filter((r) => (r.audience ?? '').trim() === audienceName.trim()),
    (r) => CHANNELS[r.channel]?.label ?? r.channel,
  )
}

/** A one-line, confidence-first summary for the surface — never a hard claim off
 *  thin data. `where` is the preposition for the best-context phrase. */
export function profileLabel(p: AssetProfile, where: 'for' | 'on' = 'for'): string {
  if (p.confidence === 'none') return p.shipped ? `${p.shipped} shipped · no results yet` : 'Unused — no track record yet'
  if (p.confidence === 'early') return `Early · ${p.uses} use${p.uses === 1 ? '' : 's'} — directional only`
  const strongest = p.best ? ` · strongest ${where} ${p.best.context}` : ''
  return `Strong · ${p.uses} uses${strongest}`
}
