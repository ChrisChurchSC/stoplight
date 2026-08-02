import { describe, expect, it } from 'vitest'
import { UNASSIGNED, campaignShortName } from '../clients'

/**
 * THE BRAND PREFIX IS PLUMBING, NOT PART OF THE NAME.
 *
 * Campaigns are stored as "<brand> — <what you typed>" so two brands can each own a "Q3 Launch"
 * without colliding on the one key flights, chats and open tabs all hang off. Every surface that
 * shows a name to a human strips it back off — this pins the strip, because the canvas tab strip
 * forgot to and ended up rendering "BIG BUOY" over "Big Buoy — Competitive Campaign".
 */
describe('campaignShortName', () => {
  it('drops the brand prefix its own brand put there', () => {
    expect(campaignShortName('Big Buoy — Competitive Campaign', 'Big Buoy')).toBe('Competitive Campaign')
  })

  it('leaves a name that was never prefixed alone', () => {
    expect(campaignShortName('Spring Launch 2026', 'Acme Co')).toBe('Spring Launch 2026')
  })

  it('strips only the leading brand, not the same words used later in the name', () => {
    expect(campaignShortName('Big Buoy — Why Big Buoy — the case', 'Big Buoy')).toBe('Why Big Buoy — the case')
  })

  it('leaves the name whole when the brand is unknown', () => {
    // A campaign clientForCampaign cannot resolve answers UNASSIGNED, which is a placeholder rather
    // than a brand — treating it as one would strip nothing but invites a future caller to think it
    // means something.
    expect(campaignShortName('Unassigned — Loose idea', UNASSIGNED)).toBe('Unassigned — Loose idea')
    expect(campaignShortName('Loose idea')).toBe('Loose idea')
  })

  it('does not leave an empty label when the name is nothing but its prefix', () => {
    // Guards the tab strip: an empty title cell would render a tab you cannot read or aim at.
    expect(campaignShortName('Big Buoy — ', 'Big Buoy')).toBe('')
  })
})
