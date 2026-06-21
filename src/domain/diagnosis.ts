import type { Campaign } from './clients'
import { applyBreakStatus, detectBreaks } from './breaks'
import { rtbCoverage } from './rtb'
import { funnelStageFor } from './funnel'
import type { TrafficRow } from './types'

/**
 * Onboarding-as-diagnosis: a mirror of a brand's own live messaging and how
 * little of it connects. The findings here MUST be real and defensible — a false
 * "you're a mess" is worse than no diagnosis — so everything is derived from the
 * actual connection check + proof coverage, never manufactured. When in doubt,
 * the verdict under-claims.
 */

export interface DiagnosisFindings {
  totalAssets: number
  audiences: number
  /** Assets not on any open break. */
  connected: number
  /** Journey + audience breaks — the thread snapping. */
  contradictions: number
  /** Proof gaps + claims with no RTB at all. */
  unsupported: number
  /** Brand-voice violations. */
  offBrand: number
  /** Assets with no strategy behind their campaign ("no plan behind it"). */
  noStrategy: number
  /** soft when findings are thin, sharp only when the data clearly supports it. */
  verdict: 'soft' | 'sharp'
}

export function diagnose(
  rows: TrafficRow[],
  breakStatus: Record<string, string>,
  campaigns: Campaign[],
): DiagnosisFindings {
  const breaks = applyBreakStatus(detectBreaks(rows), breakStatus as never).filter(
    (b) => b.status === 'open',
  )
  const contradictions = breaks.filter((b) => b.axis === 'journey' || b.axis === 'audience').length
  const offBrand = breaks.filter((b) => b.axis === 'voice').length
  const cov = rtbCoverage(rows)
  const unsupported = breaks.filter((b) => b.axis === 'proof').length + cov.unsupported.length

  // Only flag "no plan behind it" for a campaign we actually track that has no
  // strategy set. A campaign we have no record of is not evidence of no plan —
  // accusing it would be the false "you're a mess" this whole view must avoid.
  // Counted by unique asset, so it can never exceed the total asset count.
  const stratByCamp = new Map(campaigns.map((c) => [c.name, c.strategy]))
  const noStratNames = new Set<string>()
  for (const r of rows) {
    const camp = (r.campaign ?? '').trim()
    if (camp && stratByCamp.has(camp) && !stratByCamp.get(camp)) noStratNames.add(r.assetName)
  }
  const noStrategy = noStratNames.size

  const assetNames = new Set(rows.map((r) => r.assetName))
  const broken = new Set(
    breaks.flatMap((b) => [b.from.assetName, b.to?.assetName].filter(Boolean) as string[]),
  )
  const connected = [...assetNames].filter((n) => !broken.has(n)).length
  const audiences = new Set(rows.map((r) => (r.audience ?? '').trim() || 'Unsegmented')).size

  const verdict: DiagnosisFindings['verdict'] = contradictions + unsupported >= 3 ? 'sharp' : 'soft'

  return {
    totalAssets: assetNames.size,
    audiences,
    connected,
    contradictions,
    unsupported,
    offBrand,
    noStrategy,
    verdict,
  }
}

/** A tiny node placed in the before/after mini-map. */
export interface MapDot {
  id: string
  label: string
  x: number
  y: number
  flagged: boolean
}

const hash = (s: string): number => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return (h >>> 0) / 0xffffffff
}

/** One row per unique asset — both maps plot assets, not message variants, so the
 *  dot count matches the headline count and "same assets, connected" is literal. */
function uniqueAssets(rows: TrafficRow[]): TrafficRow[] {
  const seen = new Set<string>()
  const out: TrafficRow[] = []
  for (const r of rows) {
    if (seen.has(r.assetName)) continue
    seen.add(r.assetName)
    out.push(r)
  }
  return out
}

/** Before: every asset floating, scattered, with no thread between them. */
export function scatterMap(rows: TrafficRow[], w: number, h: number, breakStatus: Record<string, string>): MapDot[] {
  const breaks = applyBreakStatus(detectBreaks(rows), breakStatus as never).filter((b) => b.status === 'open')
  const broken = new Set(breaks.flatMap((b) => [b.from.assetName, b.to?.assetName].filter(Boolean) as string[]))
  return uniqueAssets(rows).map((r) => ({
    id: r.id,
    label: r.assetName,
    x: 30 + hash(r.assetName) * (w - 60),
    y: 26 + hash(r.assetName + 'y') * (h - 52),
    flagged: broken.has(r.assetName),
  }))
}

/** After: the same assets, arranged in funnel-stage columns, ready to connect. */
export function structuredMap(rows: TrafficRow[], w: number, h: number, breakStatus: Record<string, string>): MapDot[] {
  const breaks = applyBreakStatus(detectBreaks(rows), breakStatus as never).filter((b) => b.status === 'open')
  const broken = new Set(breaks.flatMap((b) => [b.from.assetName, b.to?.assetName].filter(Boolean) as string[]))
  const assets = uniqueAssets(rows)
  const stages = ['awareness', 'consideration', 'conversion', 'retention']
  const colW = w / stages.length
  // Tallest column decides the spacing so dots always fit inside the map height.
  const counts: Record<number, number> = {}
  for (const r of assets) {
    const ci = Math.max(0, stages.indexOf(funnelStageFor(r.channel, r.assetType)))
    counts[ci] = (counts[ci] ?? 0) + 1
  }
  const top = 56
  const tallest = Math.max(1, ...Object.values(counts))
  const step = Math.min(24, (h - top - 16) / tallest)
  const perCol: Record<number, number> = {}
  return assets.map((r) => {
    const ci = Math.max(0, stages.indexOf(funnelStageFor(r.channel, r.assetType)))
    const k = perCol[ci] ?? 0
    perCol[ci] = k + 1
    return {
      id: r.id,
      label: r.assetName,
      x: ci * colW + colW / 2,
      y: top + k * step,
      flagged: broken.has(r.assetName),
    }
  })
}
