import { messagingMap } from './messaging'
import { assetRtbIds, rtbById } from './rtb'
import type { TrafficRow } from './types'

/**
 * Does a unit's CTA + promise flow into the thing it links to? Now that the
 * journey shows how units connect, this checks each handoff: a clear CTA that
 * drives the click, and proof (RTBs) that carries through to the destination so
 * the message doesn't break between steps. Heuristic for v1 — swap for a Claude
 * call (same seam as the ICP review) to judge tone/continuity in prose.
 */
export type HandoffLevel = 'coherent' | 'weak' | 'mismatch'

export interface Handoff {
  level: HandoffLevel
  reason: string
}

export function handoffFor(source: TrafficRow, target: TrafficRow): Handoff {
  const map = messagingMap(source)
  const cta = Object.entries(map).find(([k, v]) => /cta/i.test(k) && (v ?? '').trim())?.[1]?.trim()

  const src = new Set(assetRtbIds(source))
  const tgt = new Set(assetRtbIds(target))
  const shared = [...src].filter((x) => tgt.has(x))
  const label = (id: string) => rtbById(source.campaign, id)?.label ?? id

  if (!cta) {
    return { level: 'weak', reason: `No CTA driving the click to ${target.assetName}.` }
  }
  if (src.size > 0 && tgt.size > 0 && shared.length === 0) {
    return {
      level: 'mismatch',
      reason: `Promise breaks — this unit leads on “${[...src].map(label).join(', ')}” but ${target.assetName} leads on “${[...tgt].map(label).join(', ')}”.`,
    }
  }
  if (shared.length === 0) {
    return { level: 'weak', reason: `“${cta}” → ${target.assetName}, but no shared proof carries through.` }
  }
  return {
    level: 'coherent',
    reason: `“${cta}” carries ${shared.map(label).join(', ')} through to ${target.assetName}.`,
  }
}
