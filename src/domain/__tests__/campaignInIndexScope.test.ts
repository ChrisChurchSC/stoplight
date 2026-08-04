import { describe, expect, it } from 'vitest'
import { campaignInIndexScope } from '../brand'
import { DRAFTS_SPACE, UNASSIGNED } from '../clients'

/**
 * THE CAMPAIGNS INDEX, before and after a brand is chosen.
 *
 * The page kept confusing "a brand got resolved" with "a brand was chosen". clientFilter resets to
 * 'all' on every load, so after a refresh nothing has been chosen — and canvasBrandScope still
 * answered a single-brand workspace with that brand, and a multi-brand one with ''. Filtering by
 * either emptied the page: campaigns filed under another client, or under nobody, were not shown.
 * Opening a campaign set the filter to its own client, so coming back they reappeared, and the next
 * refresh took them away. These pin both halves — everything until you choose, and the leak boundary
 * once you have.
 */

describe('campaignInIndexScope — no brand chosen', () => {
  it('shows every campaign, whatever it is filed under', () => {
    for (const client of ['Breadcrumbs', 'World Within', 'Globex', UNASSIGNED, DRAFTS_SPACE, undefined, '']) {
      expect(campaignInIndexScope(client, '', false)).toBe(true)
    }
  })

  /**
   * The single-brand workspace, which is where this was first seen. canvasBrandScope resolves a lone
   * brand even with no filter set, so `brand` is non-empty here while nothing has been chosen — and
   * the campaigns filed as Unassigned still have to show.
   */
  it('shows everything even when a lone brand was resolved for it', () => {
    expect(campaignInIndexScope(UNASSIGNED, 'Breadcrumbs', false)).toBe(true)
    expect(campaignInIndexScope('World Within', 'Breadcrumbs', false)).toBe(true)
  })
})

describe('campaignInIndexScope — a brand is chosen', () => {
  it('shows that brand’s campaigns', () => {
    expect(campaignInIndexScope('World Within', 'World Within', true)).toBe(true)
  })

  it('shows the brandless ones alongside them, in Drafts', () => {
    expect(campaignInIndexScope(UNASSIGNED, 'World Within', true)).toBe(true)
    expect(campaignInIndexScope(DRAFTS_SPACE, 'World Within', true)).toBe(true)
    expect(campaignInIndexScope(undefined, 'World Within', true)).toBe(true)
  })

  /**
   * THE LINE. Choosing a brand is the act that narrows the page, and once narrowed it must not show
   * another client's work — the same contamination the brand scope resolver exists to prevent.
   */
  it('never shows another brand’s campaign once a brand is chosen', () => {
    expect(campaignInIndexScope('Globex', 'World Within', true)).toBe(false)
    expect(campaignInIndexScope('Breadcrumbs', 'World Within', true)).toBe(false)
  })
})
