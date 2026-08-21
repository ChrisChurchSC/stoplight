import { describe, expect, it } from 'vitest'
import { buildCampaignLink, campaignFromInput, readCampaignLink } from '../campaignLink'

/**
 * A LINK THAT NAMES A CAMPAIGN.
 *
 * The address bar read `/` whatever was open, so there was nothing to copy and no way to tell
 * anything outside the app which campaign was meant — least of all a model, which otherwise has to
 * be told a name and trusted to have heard it right among fifteen brands and near-identical titles.
 *
 * The resolver sits in front of every tool that takes a campaign, so the case that matters most is
 * the one where it does NOTHING: a bare name has to fall through untouched, or a feature about
 * convenience becomes a regression in everything that already worked.
 */

const ORIGIN = 'https://breadcrumbs.example'

describe('a name still behaves like a name', () => {
  it('leaves a plain campaign name alone', () => {
    expect(campaignFromInput('ABM FW 2026')).toBe('ABM FW 2026')
    expect(readCampaignLink('ABM FW 2026')).toBeNull()
  })

  it('does not mistake a name with a slash or a dot in it for a link', () => {
    expect(campaignFromInput('Q3/Q4 Bau')).toBe('Q3/Q4 Bau')
    expect(campaignFromInput('breadcrumbs.com relaunch')).toBe('breadcrumbs.com relaunch')
  })

  it('trims, because a pasted name carries whitespace', () => {
    expect(campaignFromInput('  ABM FW 2026 ')).toBe('ABM FW 2026')
  })
})

describe('round trip', () => {
  it('reads back what it wrote, brand included', () => {
    const link = buildCampaignLink(ORIGIN, 'ABM FW 2026', 'World Within')
    expect(readCampaignLink(link)).toEqual({ campaign: 'ABM FW 2026', brand: 'World Within' })
  })

  it('survives the characters real campaign names have in them', () => {
    for (const name of ['Q3/Q4 Bau', 'Breadcrumbs/2026', 'BAU H2 2026', 'Always-On']) {
      expect(readCampaignLink(buildCampaignLink(ORIGIN, name, 'Big Buoy'))?.campaign).toBe(name)
    }
  })

  it('works without a brand', () => {
    expect(readCampaignLink(buildCampaignLink(ORIGIN, 'Always-On'))).toEqual({ campaign: 'Always-On' })
  })

  it('drops any other query it was built over, so a spent invite token is never re-attached', () => {
    const link = buildCampaignLink(`${ORIGIN}/?invite=abc123`, 'Always-On')
    expect(link).not.toContain('invite')
  })
})

describe('what people actually paste', () => {
  it('copes with the punctuation a paste drags along', () => {
    const link = buildCampaignLink(ORIGIN, 'Always-On', 'World Within')
    for (const wrapped of [`<${link}>`, `${link}.`, `(${link})`, `  ${link}  `]) {
      expect(readCampaignLink(wrapped)?.campaign, wrapped).toBe('Always-On')
    }
  })

  it('is null for a URL that names no campaign, rather than a guess', () => {
    expect(readCampaignLink(ORIGIN)).toBeNull()
    expect(readCampaignLink(`${ORIGIN}/?brand=World+Within`)).toBeNull()
  })

  it('is null for something that is not a URL at all', () => {
    expect(readCampaignLink('')).toBeNull()
    expect(readCampaignLink('http://')).toBeNull()
  })
})
