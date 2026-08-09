import { describe, expect, it } from 'vitest'
import { DRAFTS_SPACE, UNASSIGNED, campaignShortName, campaignStoredName } from '../clients'

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

/**
 * THE OTHER DIRECTION, WHICH IS WHERE THE DAMAGE WAS.
 *
 * Building the stored name was three separate template strings — the builder's, the rename field's
 * and the brand rebind's — and one of them read a brand SCOPE instead of the campaign's own brand. A
 * scope is allowed to fall back to the workspace's only brand, so on a one-brand workspace every
 * campaign was named after that brand whatever was typed and whoever it was for, and the rename
 * field could only edit the part after the prefix. One function now owns the rule.
 */
describe('campaignStoredName', () => {
  it('puts the brand on the front, so two brands can each own a Q3 Launch', () => {
    expect(campaignStoredName('Q3 Launch', 'Big Buoy')).toBe('Big Buoy — Q3 Launch')
  })

  /** The state a campaign now STARTS in: real, listed, and nobody's yet. */
  it('gives no prefix when the campaign has no brand', () => {
    expect(campaignStoredName('Loose idea')).toBe('Loose idea')
    expect(campaignStoredName('Loose idea', '')).toBe('Loose idea')
  })

  /** Neither catch-all is a brand, and a name is not the place to find that out. */
  it('never turns a catch-all bucket into a prefix', () => {
    expect(campaignStoredName('Loose idea', UNASSIGNED)).toBe('Loose idea')
    expect(campaignStoredName('Loose idea', DRAFTS_SPACE)).toBe('Loose idea')
  })

  /**
   * Unwiring a Brand card leaves the old prefix on the name — taking a brand away is not licence to
   * rename somebody's campaign — so re-wiring the same card has to not stack a second copy of it.
   */
  it('is idempotent on a name that already carries the prefix', () => {
    expect(campaignStoredName('Big Buoy — Q3 Launch', 'Big Buoy')).toBe('Big Buoy — Q3 Launch')
  })

  it('round-trips with campaignShortName', () => {
    const stored = campaignStoredName('Q3 Launch', 'Big Buoy')
    expect(campaignShortName(stored, 'Big Buoy')).toBe('Q3 Launch')
  })

  it('falls back to a name rather than storing a campaign called nothing', () => {
    expect(campaignStoredName('   ', 'Big Buoy')).toBe('Big Buoy — New campaign')
    expect(campaignStoredName('')).toBe('New campaign')
  })
})
