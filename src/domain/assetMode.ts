import type { MessagingField } from './messaging'
import type { TrafficRow } from './types'

/**
 * PLANNED OR LIVE — one rule, one place.
 *
 * An asset card is a plan until the post goes out and a fact afterwards, and the app asks which it
 * is constantly: the inspector opens on the matching face, the canvas tones the card, the grid
 * chips it, contentSignals counts how many plans have been reconciled to something real, and
 * Priorities decides whether a row is a library item. That question had two different answers in
 * two files before this one — contentSignals' isPlannedCard and PrioritiesView's isLibraryItem —
 * which disagreed on an imported row that was never posted. Three callers of a rule stated three
 * times is how they drift, and the mode switch was the third.
 *
 * THERE IS NO `mode` FIELD, on purpose. A stored flag can disagree with sourceUrl and status, and
 * then two surfaces answer this question differently again — the exact fault the Made from column,
 * the campaign brand and the card name have each been fixed for. What makes an asset live is that
 * it points at something real; the mode is read off that, every time.
 *
 * See docs/live-asset-mode-plan.md.
 */

export type AssetMode = 'planner' | 'active'

/**
 * Does this asset exist in the world yet?
 *
 * Three ways of being real, and any one of them is enough:
 *   posted through the tool     → status / postedAt
 *   attached to a live post     → a sourceUrl the person put there
 *   ingested from the platform  → source names where it came from
 *
 * `source: 'generated'` with a sourceUrl is NOT live: that is a draft the agent gave a reference
 * link, and treating it as published would put a projection in the measured column.
 */
export function isLiveAsset(row: Pick<TrafficRow, 'status' | 'postedAt' | 'sourceUrl' | 'source'>): boolean {
  if (row.status === 'posted' || typeof row.postedAt === 'number') return true
  return !!row.sourceUrl?.trim() && !!row.source && row.source !== 'generated'
}

/** The face the inspector opens on: whichever the asset actually is. */
export const assetMode = (row: Parameters<typeof isLiveAsset>[0]): AssetMode =>
  isLiveAsset(row) ? 'active' : 'planner'

/** The complement, kept as its own name because "not yet real" is what the planning views count. */
export const isPlannedAsset = (row: Parameters<typeof isLiveAsset>[0]): boolean => !isLiveAsset(row)

/**
 * ONE COMPONENT, PLANNED AND ACTUAL, SIDE BY SIDE.
 *
 * `changed` is the whole point of the panel, so it is decided here rather than by each reader
 * eyeballing two strings: trimmed and case-sensitive, because a headline that shipped in title case
 * IS a different headline, while trailing whitespace is not a change anybody made.
 *
 * A component missing from one side is reported rather than skipped. "We planned a CTA and shipped
 * none" is exactly the kind of thing this is for, and dropping the row would hide it.
 */
export interface CopyLine {
  key: string
  label: string
  planned: string
  live: string
  changed: boolean
  /** Neither side has anything. The caller usually hides these; it is not this module's call. */
  empty: boolean
}

export function copyDiff(row: TrafficRow, fields: MessagingField[]): CopyLine[] {
  const planned = (row.messaging ?? {}) as Record<string, string>
  const live = row.live?.copy ?? {}
  return fields.map((f) => {
    const p = (planned[f.key] ?? '').trim()
    const l = (live[f.key] ?? '').trim()
    return { key: f.key, label: f.label, planned: p, live: l, changed: p !== l, empty: !p && !l }
  })
}

/** How much of the plan survived, for a one-line summary over the diff. */
export function copyDiffStat(lines: CopyLine[]): { compared: number; changed: number } {
  const compared = lines.filter((l) => !l.empty)
  return { compared: compared.length, changed: compared.filter((l) => l.changed).length }
}

/**
 * THE COPY A READER SHOULD BE LOOKING AT — what ran, where anything ran.
 *
 * Two different jobs read an asset's words and they want different answers. Anything asking "what is
 * this campaign going to say" is reading a PLAN and must go on reading `messaging`: the copy editor,
 * generation, the checks on whether an asset has been written yet. Anything asking "what did this
 * campaign say" is reading a RECORD — the export you hand somebody, the analysis of what worked —
 * and for a live asset the plan is the wrong answer, sometimes badly: a headline that was rewritten
 * before it went out is counted by contentSignals as the thing that earned the reach.
 *
 * PER FIELD, NOT WHOLESALE. A component nobody recorded falls back to the plan rather than to
 * nothing, because copy is usually recorded only where it CHANGED — an empty live box on a shipped
 * asset almost always means "that one went as written", and blanking it would delete most of a
 * campaign from the corpus.
 *
 * Which is a different reading from copyDiff's, deliberately: the diff reports the completeness of
 * the RECORD, so an unrecorded component shows as a gap you might want to fill. This reports the
 * best available TEXT. Same data, two honest questions, and neither should answer the other's.
 */
export function effectiveMessaging(row: TrafficRow): Record<string, string> {
  const planned = (row.messaging ?? {}) as Record<string, string>
  const live = row.live?.copy
  if (!live || !isLiveAsset(row)) return planned
  const out = { ...planned }
  for (const [k, v] of Object.entries(live)) if (v?.trim()) out[k] = v
  return out
}
