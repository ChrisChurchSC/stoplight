import type { TrafficRow } from '../../domain/types'

/**
 * Source of a brand's published-content backfill — every post / video / page it has
 * put out, pulled from its connected channels so the plan can sit beside the real
 * body of work. The app has no backend, so a provider stands in front of the sources:
 * the mock replays a last-known pull, the http provider hits a deployed proxy holding
 * the Summer / Forward token. Swapping one for the other is a config change.
 *
 * A pull comes back grouped by source (one batch per channel / connector) so each
 * batch flows through `importAssets` with the right `source` tag and dedups on its own.
 */

export type AssetSource = NonNullable<TrafficRow['source']>

export interface ContentBatch {
  /** The row source tag this batch imports as (social-live, site, imported). */
  source: AssetSource
  /** Human label for the batch's origin, e.g. "YouTube" or "LinkedIn". */
  sourceLabel: string
  /** Loosely-shaped items (whatever the channel handed us); normalizeImportItem maps them. */
  items: Record<string, unknown>[]
}

export interface ContentProvider {
  /** Human label for the aggregator, shown in the UI ("Summer · Forward API"). */
  readonly source: string
  /** Pull a brand's published content to date, grouped by source. Null when nothing
   *  is connected for the brand. */
  fetch(brand: string): Promise<ContentBatch[] | null>
}
