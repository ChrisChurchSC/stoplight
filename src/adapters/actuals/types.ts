import type { BrandActuals } from '../../domain/actuals'

/**
 * Source of a brand's measured actuals. The app has no backend, so it can't query the
 * analytics warehouse directly — a provider stands in front of it. The mock provider
 * replays a last-known snapshot; the http provider hits a deployed proxy that holds the
 * Summer / Forward token. Swapping one for the other is a config change, not a rewrite.
 */
export interface ActualsProvider {
  /** Human label for the source, shown in the UI ("Summer · Forward API"). */
  readonly source: string
  /** Pull a brand's measured actuals. Returns null when the brand has no connected data. */
  fetch(brand: string): Promise<BrandActuals | null>
}
