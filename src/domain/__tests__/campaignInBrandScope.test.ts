import { describe, expect, it } from 'vitest'
import { campaignInBrandScope } from '../brand'
import { DRAFTS_SPACE, UNASSIGNED } from '../clients'

/**
 * WHICH CAMPAIGNS THE CAMPAIGNS PAGE SHOWS, for the brand it is scoped to.
 *
 * The page used to answer "this brand's, and nothing else", which made it lie in the ordinary case:
 * clientFilter resets to 'all' on every load and canvasBrandScope answers a single-brand workspace
 * with that brand, so a workspace holding one brand and eleven campaigns filed as Unassigned opened
 * on "0 campaigns" — with a folder tree above it, because folders are read per brand and those were
 * present. Nothing was lost. The campaigns had never been filed under the brand they were being
 * looked for under, and opening any one of them re-scoped the page and brought all eleven back.
 *
 * Two rules, and the second is the one that must never bend.
 */

describe('campaignInBrandScope', () => {
  it('includes the brand’s own campaigns', () => {
    expect(campaignInBrandScope('Breadcrumbs', 'Breadcrumbs')).toBe(true)
  })

  it('includes the brandless ones, which is where the empty page came from', () => {
    expect(campaignInBrandScope(UNASSIGNED, 'Breadcrumbs')).toBe(true)
    expect(campaignInBrandScope(DRAFTS_SPACE, 'Breadcrumbs')).toBe(true)
    expect(campaignInBrandScope(undefined, 'Breadcrumbs')).toBe(true)
    expect(campaignInBrandScope('', 'Breadcrumbs')).toBe(true)
    expect(campaignInBrandScope('   ', 'Breadcrumbs')).toBe(true)
  })

  /**
   * THE LINE THIS MUST NOT CROSS. Showing one client's work on another client's page would be worse
   * than the empty page being fixed — it is the same leak the brand scope resolver exists to make
   * impossible. Brandless is not another brand; it is nobody's.
   */
  it('never includes another brand’s campaign', () => {
    expect(campaignInBrandScope('Globex', 'Breadcrumbs')).toBe(false)
    expect(campaignInBrandScope('Acme Co', 'Breadcrumbs')).toBe(false)
  })

  /**
   * With two or more brands and no filter chosen, canvasBrandScope deliberately answers '' rather
   * than guessing one. The page is then brandless itself, and should show the brandless work rather
   * than nothing at all — but still no named brand's.
   */
  it('shows only brandless work when no brand is in scope', () => {
    expect(campaignInBrandScope(UNASSIGNED, '')).toBe(true)
    expect(campaignInBrandScope(DRAFTS_SPACE, '')).toBe(true)
    expect(campaignInBrandScope('Globex', '')).toBe(false)
  })
})
