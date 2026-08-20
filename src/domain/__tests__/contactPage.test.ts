import { describe, expect, it } from 'vitest'
import { DELIVERABLE_PRESETS } from '../flows'
import { CHANNEL_TYPES, isValidType, primaryTypeKey, typesFor } from '../channelAssetTypes'
import { funnelStageFor } from '../funnel'
import { messagingFields } from '../messaging'
import { ctaForHandoff } from '../assetCtas'
import type { TrafficRow } from '../types'

/**
 * THE CONTACT PAGE, WHICH IS NOT LIKE THE OTHER WEB PAGES.
 *
 * Every other website preset is a page you go and read: it argues, it proves, and its copy is a
 * pitch. A contact page is the one you fill in, and it is reached by people who have already been
 * persuaded somewhere else. So each of the website channel's defaults is wrong for it in a way
 * that is completely silent — the asset still seeds, still drafts, still sits on the canvas. It is
 * just in the wrong funnel band, briefed to write social proof, and asking for a button where the
 * work is a form. That is why each override is pinned here rather than trusted.
 */
describe('the contact page', () => {
  const preset = DELIVERABLE_PRESETS.find((p) => p.key === 'contact-page')

  it('is startable from the Web palette, built once, and brand-level', () => {
    expect(preset).toBeDefined()
    expect(preset!.group).toBe('Web')
    expect(preset!.channel).toBe('website')
    expect(preset!.runtime).toBe('one-off')
    // Brand-level like its siblings: a contact page belongs to the site, not to one campaign, so
    // two campaigns that both hand off to it are pointing at the same page rather than each
    // commissioning their own.
    expect(preset!.brand).toBe(true)
  })

  /**
   * seedCampaignAssets coerces an unknown assetType to the channel's primary type, silently, so a
   * preset naming a type its channel does not have produces homepages. presetTypes.test.ts guards
   * this across every preset; it is repeated here because the type was added in the same change.
   */
  it('names a type the website channel actually has', () => {
    expect(isValidType('website', 'contact')).toBe(true)
  })

  /**
   * APPENDED, NEVER PREPENDED.
   *
   * primaryTypeKey takes [0] and the closing-channels invariant resolves a playbook band from
   * funnelStageFor(channel, primaryType). Put 'contact' first and the whole website channel becomes
   * a conversion channel, which moves every web card on the canvas. Nothing errors when that happens.
   */
  it('did not retype the website channel by being added', () => {
    expect(primaryTypeKey('website')).toBe('homepage')
    expect(funnelStageFor('website', primaryTypeKey('website'))).toBe('consideration')
    expect(CHANNEL_TYPES.website.at(-1)?.value).toBe('contact')
  })

  /** The Other/custom escape hatch must survive the addition. */
  it('still leaves a custom format at the end of the dropdown', () => {
    expect(typesFor('website').at(-1)?.value).toBe('other')
  })

  /**
   * Nobody fills in a contact form to learn something. Left on the channel default it would sit in
   * consideration and be planned as a page that still has persuading to do.
   */
  it('closes rather than educates', () => {
    expect(funnelStageFor('website', 'contact')).toBe('conversion')
    // The default it would otherwise have inherited.
    expect(funnelStageFor('website', 'page')).toBe('consideration')
  })

  /**
   * The website base is a pitch: hero, social proof, a stat, a mid-page CTA, objection handling.
   * All of it is aimed at someone still deciding, and this page's visitor already decided. What it
   * owes instead is the two things that actually lose an enquiry — not knowing which route is
   * theirs, and not knowing whether anyone will reply.
   */
  it('is briefed as a form and a promise, not as a pitch', () => {
    const fields = messagingFields('website', 'contact').map((f) => f.key)
    expect(fields).toContain('routes')
    expect(fields).toContain('response')
    expect(fields).toContain('confirmation')
    expect(fields).toContain('alternatives')
    // The persuasion fields the base would have supplied, which are noise here.
    expect(fields).not.toContain('proof-social')
    expect(fields).not.toContain('proof-stat')
    expect(fields).not.toContain('faq')
  })

  /**
   * The mechanism is read off the DESTINATION, so what a journey handing INTO the contact page owes
   * is a form — the fields, the confirmation, the person it routes to — not the button the website
   * channel default would have asked for.
   */
  it('makes the asset that hands to it owe a form', () => {
    const row = {
      id: 'r',
      assetId: 'r',
      assetName: 'Contact us',
      mediaType: 'link',
      channel: 'website',
      assetType: 'contact',
      messaging: {},
      scheduledAt: '2026-09-01T10:00:00.000Z',
      status: 'draft',
      createdAt: 0,
    } as TrafficRow
    expect(ctaForHandoff(row).kind).toBe('form')
    // The default it would otherwise have inherited.
    expect(ctaForHandoff({ ...row, assetType: 'page' }).kind).toBe('button')
  })
})
