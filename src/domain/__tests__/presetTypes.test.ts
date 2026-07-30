import { describe, expect, it } from 'vitest'
import { DELIVERABLE_PRESETS } from '../flows'
import { isValidType } from '../channelAssetTypes'

/**
 * EVERY PRESET MUST NAME A TYPE ITS CHANNEL ACTUALLY HAS.
 *
 * seedCampaignAssets coerces an unknown assetType to the channel's primary type, silently, so a
 * preset naming a type outside its channel's vocabulary produces assets of the wrong kind with no
 * error anywhere. Three website presets did exactly that: "Product / feature page" seeded homepages.
 * The failure is invisible in the product, so it needs a test rather than a review.
 */
describe('DELIVERABLE_PRESETS', () => {
  it('every preset names an asset type that exists on its channel', () => {
    const bad = DELIVERABLE_PRESETS.filter((p) => !isValidType(p.channel, p.assetType)).map(
      (p) => `${p.key}: ${p.channel}:${p.assetType}`,
    )
    expect(bad).toEqual([])
  })

  it('preset keys are unique', () => {
    const keys = DELIVERABLE_PRESETS.map((p) => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })
})
