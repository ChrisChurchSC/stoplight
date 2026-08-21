/**
 * WHETHER THE CAMPAIGNS PAGE SHOULD COLLAPSE ONTO ITS ONE BRAND.
 *
 * With a single brand, "All canvases" and that brand's gallery are the same set of campaigns under
 * two titles, so the page shows one of them and titles it by the brand.
 *
 * Pure because the bug it carries was a RACE, and a race is the thing you cannot check by looking.
 * Reported as "sometimes it only shows one project's campaigns": the count came from the campaigns
 * that had arrived rather than from the workspace's brands, and during a load that is briefly one —
 * so it latched onto whichever brand loaded first, and because the latch only fires while the filter
 * is 'all', it never let go. Some loads, not others, and it read as the gallery losing campaigns.
 *
 * The two rules that stop that are the two this exists to hold: count BRANDS, and not until the
 * workspace has been read.
 */

export interface HomeScope {
  /** True once the workspace has been read. Nothing is decided before it. */
  hydrated: boolean
  /** The workspace's brands — not the brands whose campaigns happen to be on screen. */
  brands: string[]
  /** The filter now: 'all', 'drafts', 'flagged', 'live', or 'brand:<name>'. */
  filter: string
}

/**
 * The filter to switch to, or null to leave it alone.
 *
 * Only ever answers from 'all'. A filter somebody chose is a decision, and a page that quietly
 * re-scoped away from it would be the same failure in the opposite direction.
 */
export function collapseToBrand({ hydrated, brands, filter }: HomeScope): string | null {
  if (!hydrated) return null
  if (filter !== 'all') return null
  const named = brands.filter((b) => b && b.trim())
  return named.length === 1 ? `brand:${named[0]}` : null
}
