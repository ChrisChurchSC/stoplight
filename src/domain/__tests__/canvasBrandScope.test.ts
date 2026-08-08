import { describe, expect, it } from 'vitest'
import { canvasBrandScope } from '../brand'

/**
 * AN UNBOUND CAMPAIGN BOARD OFFERS NOTHING, RATHER THAN SOMEONE ELSE'S RECORDS.
 *
 * Every picker on a campaign canvas — audiences, proof, messages, products, people, data sets — is
 * filtered by the one brand this returns, so it decides what an agency is shown while writing for a
 * client. The bug it pins: with no brand bound the workspace filter reads 'all', and that used to
 * fall through to the FIRST brand in the account. A marine brand sitting at the top of the list put
 * "Recreational Saltwater Anglers" and "Professional Charter Captains" in the audience picker of
 * every other client's campaign, with nothing on screen admitting the board had reached outside
 * itself.
 *
 * The one-brand shortcut is kept deliberately and tested here too, because removing it outright
 * would empty every picker on the common single-brand workspace to fix a leak that cannot happen
 * there: with one brand there is nothing to guess between and nowhere for a record to come from.
 */
describe('canvasBrandScope', () => {
  it('uses the filter when one names a brand', () => {
    expect(canvasBrandScope('Big Buoy', ['Big Buoy', 'World Within'])).toBe('Big Buoy')
  })

  it('does not second-guess the filter, even for a brand it has never heard of', () => {
    // The filter is the campaign's own binding; a brand list that has not caught up is not grounds
    // to substitute a different one.
    expect(canvasBrandScope('Newly Added', ['Big Buoy'])).toBe('Newly Added')
  })

  it('resolves to no brand when none is bound and the account holds several', () => {
    // The regression. Anything other than '' here is one client's records on another's board.
    expect(canvasBrandScope('all', ['Big Buoy', 'World Within', 'Northgate Dental'])).toBe('')
  })

  it('resolves to no brand for two, where the first is already a guess', () => {
    expect(canvasBrandScope('all', ['Big Buoy', 'World Within'])).toBe('')
  })

  it('takes the sole brand when the account holds exactly one', () => {
    // Not a guess: there is nothing to choose between, and no second brand to leak from.
    expect(canvasBrandScope('all', ['Big Buoy'])).toBe('Big Buoy')
  })

  it('resolves to no brand on an empty account', () => {
    expect(canvasBrandScope('all', [])).toBe('')
  })

  it('treats an empty filter as unbound rather than as a brand named ""', () => {
    expect(canvasBrandScope('', ['Big Buoy', 'World Within'])).toBe('')
    expect(canvasBrandScope('', ['Big Buoy'])).toBe('Big Buoy')
  })

  it('treats the brandless catch-alls as unbound, not as brands called "Unassigned"', () => {
    // openFlow points the rail at clientForCampaign, which is UNASSIGNED for a campaign filed under
    // nobody. Passing that through scoped every record list to a phantom brand: audiences authored
    // there landed in clientAudiences['Unassigned'], invisible from the real brand's scope — which
    // is how a tag made on the canvas resolved to nothing on the grid.
    expect(canvasBrandScope('Unassigned', ['Big Buoy', 'World Within'])).toBe('')
    expect(canvasBrandScope('Drafts', ['Big Buoy', 'World Within'])).toBe('')
    // The single-brand shortcut still applies: the catch-all names nothing, and with one brand
    // there is still nothing to choose between.
    expect(canvasBrandScope('Unassigned', ['Big Buoy'])).toBe('Big Buoy')
  })
})
