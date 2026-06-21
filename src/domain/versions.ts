import { messagingMap } from './messaging'
import type { TrafficRow } from './types'

/**
 * Campaign version history: save points for a client's messaging. A version is a
 * snapshot of every asset's copy at a moment, attributed to whoever saved it
 * (the same identity multiplayer uses), with a diff summary against the previous
 * one. Restoring writes the snapshot's copy back to the rows. Layout (canvas node
 * positions) is deliberately out of scope for v1 — copy is the substance.
 */

export interface VersionRow {
  id: string
  assetName: string
  messaging: Record<string, string>
}

export interface CampaignVersion {
  id: string
  client: string
  label: string
  author: string
  ts: number
  rows: VersionRow[]
  summary: string
}

/** Snapshot every scoped row's copy. */
export function snapshotRows(rows: TrafficRow[]): VersionRow[] {
  return rows.map((r) => ({ id: r.id, assetName: r.assetName, messaging: { ...messagingMap(r) } }))
}

/** Asset names whose copy differs between two snapshots. */
export function diffChanged(prev: VersionRow[] | null, next: VersionRow[]): string[] {
  if (!prev) return []
  const prevMap = new Map(prev.map((r) => [r.id, r]))
  const changed = new Set<string>()
  for (const r of next) {
    const p = prevMap.get(r.id)
    if (!p) {
      changed.add(r.assetName)
      continue
    }
    const keys = new Set([...Object.keys(p.messaging), ...Object.keys(r.messaging)])
    for (const k of keys) {
      if ((p.messaging[k] ?? '') !== (r.messaging[k] ?? '')) {
        changed.add(r.assetName)
        break
      }
    }
  }
  return [...changed]
}

/** A short, human description of what changed since the previous version. */
export function diffSummary(changed: string[], isBaseline: boolean): string {
  if (isBaseline) return 'Baseline snapshot'
  if (changed.length === 0) return 'No copy changes'
  if (changed.length <= 2) return `Edited ${changed.join(', ')}`
  return `Edited ${changed.length} assets`
}
