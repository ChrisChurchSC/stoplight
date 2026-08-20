// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest'
import { runAgentAction } from '../agentBridge'

/**
 * THE GAP THIS CLOSES: the journey was reviewable from the connector and not buildable.
 *
 * review_campaign reports a CTA pointed at nothing and a handoff no button covers, and both are
 * computed off `linksTo` and `branchOf` — neither of which anything outside the app could set, and
 * `linksTo` was not even readable. A campaign assembled over the connector came out a pile of assets
 * that each read fine and led nowhere, and the review's advice about it could not be taken.
 */

let n = 0
const fresh = () => `Journey ${++n}`

/**
 * Add one asset and report back BOTH the id and the name it was actually given. Asset names are
 * uniquified across the whole workspace, not per campaign, so a second "The Trade post" becomes
 * "The Trade post 2" — and since the journey is keyed by name, a test that assumed the name it
 * asked for would be linking something else.
 */
async function asset(campaign: string, assetName: string, channel: string): Promise<{ id: string; name: string }> {
  const r = (await runAgentAction('addAsset', { brand: 'Enid Blythe', campaign, channel, assetName })) as {
    result: { id: string; assetName: string }
  }
  return { id: r.result.id, name: r.result.assetName }
}

/** A post and the page it might drive to. */
const twoAssets = async (campaign: string) => ({
  post: await asset(campaign, 'The Trade post', 'linkedin'),
  guide: await asset(campaign, 'Colourways guide', 'website'),
})

beforeEach(() => {
  localStorage.clear()
})

describe('connecting one asset to the next', () => {
  it('links by id and reports what the line owes', async () => {
    const { post, guide } = await twoAssets(fresh())
    const res = (await runAgentAction('linkAssets', { from: post.id, to: guide.id })) as {
      result: { from: string; to: string; as: string; owes: { kind: string } }
    }
    expect(res.result.from).toBe(post.name)
    expect(res.result.to).toBe(guide.name)
    expect(res.result.as).toBe('next')
    // A line is a promise somebody builds a control at this end of it.
    expect(res.result.owes.kind).toBeTruthy()
  })

  it('accepts the asset NAME, because that is the vocabulary the journey answers in', async () => {
    const { post, guide } = await twoAssets(fresh())
    const res = await runAgentAction('linkAssets', { from: post.name, to: guide.name })
    expect(res.error).toBeUndefined()
  })

  it('shows the link back through list_assets, with the name it refers to', async () => {
    const campaign = fresh()
    const { post, guide } = await twoAssets(campaign)
    await runAgentAction('linkAssets', { from: post.id, to: guide.name })
    const read = (await runAgentAction('listAssets', { brand: 'Enid Blythe', campaign })) as {
      result: { assets: { id: string; assetName: string; linksTo: string }[] }
    }
    const seen = read.result.assets.find((x) => x.id === post.id)!
    expect(seen.assetName).toBe(post.name)
    expect(seen.linksTo).toBe(guide.name)
  })
})

describe('a second destination off the same asset', () => {
  it('refuses to silently rewire an existing destination', async () => {
    const campaign = fresh()
    const { post, guide } = await twoAssets(campaign)
    const pricing = await asset(campaign, 'Pricing', 'website')
    await runAgentAction('linkAssets', { from: post.id, to: guide.name })

    const clash = await runAgentAction('linkAssets', { from: post.id, to: pricing.name })
    expect(clash.result).toBeUndefined()
    expect(clash.error).toMatch(/already leads to/i)
    // And it says which of the two ways out to take.
    expect(clash.error).toMatch(/branch|unlink/i)
  })

  it('adds it as a branch when that is what was meant', async () => {
    const campaign = fresh()
    const { post, guide } = await twoAssets(campaign)
    const pricing = await asset(campaign, 'Pricing', 'website')
    await runAgentAction('linkAssets', { from: post.id, to: guide.name })

    const branched = await runAgentAction('linkAssets', { from: post.id, to: pricing.name, as: 'branch' })
    expect(branched.error).toBeUndefined()
    const read = (await runAgentAction('listAssets', { brand: 'Enid Blythe', campaign })) as {
      result: { assets: { assetName: string; branchOf: string }[] }
    }
    expect(read.result.assets.find((x) => x.assetName === pricing.name)!.branchOf).toBe(post.name)
  })
})

describe('links it refuses to draw', () => {
  it('will not point an asset at itself', async () => {
    const { post } = await twoAssets(fresh())
    const res = await runAgentAction('linkAssets', { from: post.id, to: post.id })
    expect(res.error).toMatch(/itself/i)
  })

  it('will not cross campaigns, which the review would read as a CTA pointed at nothing', async () => {
    const { post } = await twoAssets(fresh())
    const elsewhere = await asset(fresh(), 'Elsewhere', 'website')
    const res = await runAgentAction('linkAssets', { from: post.id, to: elsewhere.name })
    expect(res.error).toMatch(/cannot cross campaigns/i)
  })

  it('says so plainly when the far end does not exist', async () => {
    const { post } = await twoAssets(fresh())
    const res = await runAgentAction('linkAssets', { from: post.id, to: 'A page nobody made' })
    expect(res.error).toMatch(/no asset/i)
    expect(res.error).toMatch(/list_assets/)
  })
})

describe('taking a link back out', () => {
  it('clears the destination', async () => {
    const campaign = fresh()
    const { post, guide } = await twoAssets(campaign)
    await runAgentAction('linkAssets', { from: post.id, to: guide.name })
    const gone = await runAgentAction('unlinkAssets', { from: post.id })
    expect(gone.error).toBeUndefined()

    const read = (await runAgentAction('listAssets', { brand: 'Enid Blythe', campaign })) as {
      result: { assets: { id: string; linksTo: string }[] }
    }
    expect(read.result.assets.find((x) => x.id === post.id)!.linksTo).toBe('')
  })

  it('does not claim to have removed a link that was never there', async () => {
    const { post } = await twoAssets(fresh())
    const res = await runAgentAction('unlinkAssets', { from: post.id })
    expect(res.error).toMatch(/does not lead anywhere/i)
  })
})
