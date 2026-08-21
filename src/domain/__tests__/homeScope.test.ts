import { describe, expect, it } from 'vitest'
import { collapseToBrand } from '../homeScope'

/**
 * "SOMETIMES IT ONLY SHOWS ONE PROJECT'S CAMPAIGNS."
 *
 * The campaigns page collapses onto its brand when there is only one, which is right — with a single
 * brand, "All canvases" and that brand's gallery are the same list. What made it a bug is WHERE the
 * count came from: the campaigns that had arrived, rather than the workspace's brands. Part way
 * through a load that is briefly one brand, so the page latched onto whichever loaded first, and
 * because the latch only fires while the filter is 'all' it never let go.
 *
 * A race, so it happened on some loads and not others — which is why it is pinned here rather than
 * left as two conditions in an effect that a later reader would reasonably think were redundant.
 */

describe('before the workspace has been read', () => {
  it('decides nothing, however few brands appear to exist', () => {
    expect(collapseToBrand({ hydrated: false, brands: ['World Within'], filter: 'all' })).toBeNull()
  })

  it('decides nothing when nothing has arrived yet — the case that caused the bug', () => {
    // Mid-load, one brand's campaigns are in and the rest are not. Counting those would collapse.
    expect(collapseToBrand({ hydrated: false, brands: [], filter: 'all' })).toBeNull()
  })
})

describe('once it has been read', () => {
  it('collapses onto the only brand there is', () => {
    expect(collapseToBrand({ hydrated: true, brands: ['World Within'], filter: 'all' })).toBe('brand:World Within')
  })

  it('leaves a real workspace alone', () => {
    expect(collapseToBrand({ hydrated: true, brands: ['World Within', 'Enid Blythe'], filter: 'all' })).toBeNull()
  })

  it('leaves an empty workspace alone rather than inventing a scope', () => {
    expect(collapseToBrand({ hydrated: true, brands: [], filter: 'all' })).toBeNull()
  })

  it('counts the brand even when it has no campaigns yet — it is still the only one', () => {
    expect(collapseToBrand({ hydrated: true, brands: ['Photon'], filter: 'all' })).toBe('brand:Photon')
  })

  it('ignores blank entries rather than collapsing onto nothing', () => {
    expect(collapseToBrand({ hydrated: true, brands: ['', '  '], filter: 'all' })).toBeNull()
    expect(collapseToBrand({ hydrated: true, brands: ['', 'Big Buoy'], filter: 'all' })).toBe('brand:Big Buoy')
  })
})

describe('a filter somebody chose', () => {
  /** Re-scoping away from a deliberate choice is the same failure pointing the other way. */
  it('is never overridden', () => {
    for (const filter of ['brand:Enid Blythe', 'drafts', 'flagged', 'live']) {
      expect(collapseToBrand({ hydrated: true, brands: ['World Within'], filter })).toBeNull()
    }
  })
})
