import { describe, expect, it } from 'vitest'
import { ctaForHandoff, danglingCtas, handoffsFrom, handoffsInto, uncoveredHandoffs, type AssetCta } from '../assetCtas'
import type { ChannelId, TrafficRow } from '../types'

/**
 * WHAT A LINE ON THE CANVAS COSTS.
 *
 * The journey already knew which assets hand to which; what it never said is that each of those
 * handoffs is a thing somebody has to build. These tests pin the two halves of that: the handoffs are
 * read off the journey's own vocabulary (linksTo and branchOf) and deduped so four posts under one
 * deliverable ask for one button, and the mechanism is read off the DESTINATION, because a page that
 * hands to an email owes a form and the same page handing to another page owes a link.
 */

const row = (id: string, assetName: string, channel: ChannelId, extra: Partial<TrafficRow> = {}): TrafficRow => ({
  id,
  assetId: id,
  assetName,
  mediaType: 'text',
  channel,
  messaging: {},
  scheduledAt: '2026-09-01T10:00:00.000Z',
  status: 'draft',
  createdAt: 0,
  ...extra,
} as TrafficRow)

const cta = (over: Partial<AssetCta> = {}): AssetCta => ({ id: 'c1', kind: 'button', label: 'Go', ...over })

describe('handoffs out of an asset', () => {
  it('reads both linksTo and branchOf, with the explicit destination first', () => {
    const ad = row('r1', 'Storm ad', 'meta-ads', { linksTo: 'Storm page' })
    const page = row('r2', 'Storm page', 'landing-page')
    const email = row('r3', 'Storm nurture 1', 'email', { branchOf: 'Storm ad' })
    const out = handoffsFrom(ad, [ad, page, email])
    expect(out.map((h) => [h.row.assetName, h.via])).toEqual([
      ['Storm page', 'linksTo'],
      ['Storm nurture 1', 'branchOf'],
    ])
  })

  /**
   * A deliverable branched off an asset stamps branchOf on EVERY row under it, so a four-email
   * sequence is four rows naming the same parent. That is one next step drawn once on the canvas;
   * listing it four times would ask the ad for four buttons to the same place.
   */
  it('counts one next step per asset name, not per row under it', () => {
    const ad = row('r1', 'Storm ad', 'meta-ads')
    const seq = [0, 1, 2].map((i) => row(`e${i}`, 'Storm nurture', 'email', { branchOf: 'Storm ad' }))
    expect(handoffsFrom(ad, [ad, ...seq]).length).toBe(1)
  })

  /** A row whose branchOf is its own name is a migration artefact, and it would ask for a button to itself. */
  it('drops self-links', () => {
    const r = row('r1', 'Storm ad', 'meta-ads', { linksTo: 'Storm ad', branchOf: 'Storm ad' })
    expect(handoffsFrom(r, [r])).toEqual([])
  })

  /** linksTo names an asset; a name with no asset behind it is not a handoff this campaign can build for. */
  it('ignores a destination that is not in the campaign', () => {
    const ad = row('r1', 'Storm ad', 'meta-ads', { linksTo: 'A page in another campaign' })
    expect(handoffsFrom(ad, [ad])).toEqual([])
  })

  it('reads the assets that hand INTO one, for context', () => {
    const ad = row('r1', 'Storm ad', 'meta-ads', { linksTo: 'Storm page' })
    const page = row('r2', 'Storm page', 'landing-page')
    expect(handoffsInto(page, [ad, page]).map((h) => h.row.assetName)).toEqual(['Storm ad'])
  })
})

describe('what the handoff costs the asset at this end of it', () => {
  /** The whole point: you cannot email a person who has never given you an address. */
  it('asks for a capture when the next step is a message sent to a person', () => {
    expect(ctaForHandoff(row('r', 'Nurture 1', 'email')).kind).toBe('form')
    expect(ctaForHandoff(row('r', 'Reminder', 'sms')).kind).toBe('form')
  })

  it('asks for a booking when the next step is a human', () => {
    expect(ctaForHandoff(row('r', 'Discovery call', 'sales-outreach')).kind).toBe('booking')
  })

  it('asks for the download when the next step is a file', () => {
    expect(ctaForHandoff(row('r', 'Sales deck', 'sales-collateral')).kind).toBe('download')
  })

  it('asks for a registration when the next step is a seat at something', () => {
    expect(ctaForHandoff(row('r', 'Screening', 'events')).kind).toBe('form')
    expect(ctaForHandoff(row('r', 'Live teardown', 'lead-magnet', { assetType: 'webinar' })).kind).toBe('form')
  })

  /**
   * THE ASSET AT THIS END, not the one at the other. A page you can link to costs the source a
   * button; the form on a lead-capture page is that PAGE's build item, and suggesting a form here
   * would put the same form on both ends of one line.
   */
  it('asks only for a button when the next step is a page you can link to', () => {
    for (const t of ['lead-capture', 'webinar-reg', 'waitlist', 'sales']) {
      expect(ctaForHandoff(row('r', 'Storm page', 'landing-page', { assetType: t })).kind).toBe('button')
    }
    expect(ctaForHandoff(row('r', 'Storm page', 'landing-page')).kind).toBe('button')
    expect(ctaForHandoff(row('r', 'Cart', 'checkout', { assetType: 'cart' })).kind).toBe('button')
  })

  /** The type beats the channel where the type changes what this end owes. */
  it('lets the asset type override its channel', () => {
    expect(ctaForHandoff(row('r', 'Sign in', 'website', { assetType: 'login' })).kind).toBe('account')
    expect(ctaForHandoff(row('r', 'Refer a friend', 'post-purchase', { assetType: 'referral' })).kind).toBe('share')
    expect(ctaForHandoff(row('r', 'Web page', 'website', { assetType: 'page' })).kind).toBe('button')
  })

  it('always has something to say, whatever the channel', () => {
    const out = ctaForHandoff(row('r', 'Feed post', 'instagram'))
    expect(out.kind).toBeTruthy()
    expect(out.note.length).toBeGreaterThan(0)
  })
})

describe('the gaps', () => {
  const ad = (ctas?: AssetCta[]) => row('r1', 'Storm ad', 'meta-ads', { linksTo: 'Storm page', ctas })
  const page = row('r2', 'Storm page', 'landing-page')

  it('reports a handoff with nothing against it', () => {
    expect(uncoveredHandoffs(ad(), [ad(), page]).map((h) => h.row.assetName)).toEqual(['Storm page'])
  })

  it('stops reporting it once a CTA points there', () => {
    const withCta = ad([cta({ target: 'Storm page' })])
    expect(uncoveredHandoffs(withCta, [withCta, page])).toEqual([])
  })

  /** A search box is real functionality and it is not how anybody reaches the next step. */
  it('does not let a CTA that goes nowhere cover a handoff', () => {
    const withCta = ad([cta({ kind: 'input', label: 'Search', target: undefined })])
    expect(uncoveredHandoffs(withCta, [withCta, page]).length).toBe(1)
  })

  /** Retarget the button and the old gap comes back, because it really is open again. */
  it('reopens the gap when the CTA is pointed somewhere else', () => {
    const other = row('r3', 'Other page', 'landing-page')
    const withCta = ad([cta({ target: 'Other page' })])
    expect(uncoveredHandoffs(withCta, [withCta, page, other]).map((h) => h.row.assetName)).toEqual(['Storm page'])
  })

  it('flags a CTA pointed at an asset that has left the campaign', () => {
    const withCta = ad([cta({ id: 'gone', target: 'Deleted page' })])
    expect(danglingCtas(withCta, [withCta, page]).map((c) => c.id)).toEqual(['gone'])
    expect(danglingCtas(ad([cta({ target: 'Storm page' })]), [ad(), page])).toEqual([])
  })
})
