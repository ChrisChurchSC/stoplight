import { describe, expect, it } from 'vitest'
import { DELIVERABLE_PRESETS } from '../flows'
import { isValidType } from '../channelAssetTypes'
import { CHANNEL_LIST } from '../channels'

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

  /**
   * EVERY CHANNEL MUST BE PICKABLE.
   *
   * The presets ARE the channel picker — the card's +, and the connector port's menu, both draw
   * from this list and nothing else. Six channels (x-ads, pinterest-ads, snapchat-ads, reddit-ads,
   * google-demand, push) were defined in CHANNELS, carried asset types, reported in the mix, and
   * were simply unreachable from the one screen where you choose a channel. Adding a channel to
   * CHANNELS without a preset is the same bug again, and it is silent: nothing errors, the channel
   * just never appears.
   */
  it('every channel in CHANNELS is reachable from the picker', () => {
    const covered = new Set(DELIVERABLE_PRESETS.map((p) => p.channel))
    const missing = CHANNEL_LIST.filter((c) => !covered.has(c.id)).map((c) => c.id)
    expect(missing).toEqual([])
  })
})
