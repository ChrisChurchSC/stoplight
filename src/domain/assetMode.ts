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
 * nothing, because copy is recorded only where it CHANGED — blanking the rest would delete most of a
 * campaign from the corpus.
 *
 * DORMANT UNTIL SOMETHING WRITES `live.copy` AGAIN. The panel that recorded what a post said came
 * out of the inspector, so on a workspace that never used it this returns the plan every time. It
 * stays because the RULE is right and rows written while that panel existed still carry the field:
 * a reader asking what a campaign said should get what it said, wherever that ever gets recorded.
 */
export function effectiveMessaging(row: TrafficRow): Record<string, string> {
  const planned = (row.messaging ?? {}) as Record<string, string>
  const live = row.live?.copy
  if (!live || !isLiveAsset(row)) return planned
  const out = { ...planned }
  for (const [k, v] of Object.entries(live)) if (v?.trim()) out[k] = v
  return out
}
