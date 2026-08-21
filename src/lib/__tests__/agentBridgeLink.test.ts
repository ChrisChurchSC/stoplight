// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'
import { buildCampaignLink } from '../../domain/campaignLink'

/**
 * PASTE THE LINK, SAY "THIS ONE".
 *
 * The resolver sits at the bridge entry rather than in sixty schemas, so every tool that takes a
 * campaign takes a link — including the ones written after it. Which means the test that matters is
 * that a bare NAME still behaves exactly as it did: a convenience that quietly broke every existing
 * caller would be a poor trade.
 */

const ORIGIN = 'https://breadcrumbs.example'
let n = 0
const fresh = () => `Linked ${++n}`

beforeEach(() => {
  localStorage.clear()
})

describe('a link where a campaign name goes', () => {
  it('resolves to the campaign it names', async () => {
    const campaign = fresh()
    await runAgentAction('addAsset', { brand: 'World Within', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    const res = (await runAgentAction('listObjectCards', { campaign: buildCampaignLink(ORIGIN, campaign) })) as {
      result: { campaign: string }
    }
    expect(res.result.campaign).toBe(campaign)
  })

  it('supplies the brand too, when the caller named none', async () => {
    const campaign = fresh()
    await runAgentAction('addAsset', { brand: 'World Within', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    // listAssets requires a brand; the link is the only place it comes from here.
    const res = (await runAgentAction('listAssets', { campaign: buildCampaignLink(ORIGIN, campaign, 'World Within') })) as {
      result: { brand: string; total: number }
    }
    expect(res.result.brand).toBe('World Within')
    expect(res.result.total).toBe(1)
  })

  it('does not override a brand the caller gave explicitly', async () => {
    const campaign = fresh()
    await runAgentAction('addAsset', { brand: 'Enid Blythe', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    const res = (await runAgentAction('listAssets', {
      brand: 'Enid Blythe',
      campaign: buildCampaignLink(ORIGIN, campaign, 'World Within'),
    })) as { result: { brand: string; total: number } }
    expect(res.result.brand).toBe('Enid Blythe')
    expect(res.result.total).toBe(1)
  })
})

describe('names keep working', () => {
  it('passes a plain campaign name through untouched', async () => {
    const campaign = fresh()
    await runAgentAction('addAsset', { brand: 'World Within', campaign, channel: 'linkedin', assetName: `${campaign} post` })

    const res = (await runAgentAction('listObjectCards', { campaign })) as { result: { campaign: string } }
    expect(res.result.campaign).toBe(campaign)
  })

  it('does not maul a name that merely looks web-ish', async () => {
    const campaign = 'breadcrumbs.com relaunch'
    const res = (await runAgentAction('listObjectCards', { campaign })) as { result: { campaign: string } }
    expect(res.result.campaign).toBe(campaign)
  })
})
