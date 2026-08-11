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
