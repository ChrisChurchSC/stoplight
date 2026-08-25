import { describe, expect, it } from 'vitest'
import { typesFor } from '../channelAssetTypes'
import { funnelStageFor } from '../funnel'
import type { ChannelId } from '../types'
import {
  LEGACY_WEB_CHANNELS,
  POST_PURCHASE_UPSELL,
  WEB_TYPE_STAGE,
  effectiveStageAfter,
  isLegacyWebChannel,
  migrateRowChannel,
  webTypeFor,
} from '../webChannel'

/**
 * THE MERGE HAS TO MOVE NOTHING.
 *
 * Five channels became one, and each of the five carried its own funnel default — consideration for
 * website and blog, conversion for landing-page and checkout, retention for post-purchase. One
 * channel can only carry one default, so the risk this whole file exists to rule out is silent: no
 * error, no failing build, just a thank-you page that quietly stops being retention and a cart that
 * stops being a close, and a funnel on the canvas that reads wrong from then on.
 *
 * So the property under test is not "the mapping looks sensible". It is that for EVERY pair the old
 * model could produce, the stage after the merge is the stage before it.
 */
describe('web channel migration preserves funnel placement', () => {
  it('covers every asset type of every legacy web channel, including the escape hatch', () => {
    const checked: string[] = []
    for (const channel of LEGACY_WEB_CHANNELS) {
      // typesFor appends OTHER_TYPE, so 'other' is included on purpose: it is one of the two kinds
      // of type the stage table can never speak for, and the one most likely to be forgotten.
      for (const t of typesFor(channel as ChannelId)) {
        const before = funnelStageFor(channel as ChannelId, t.value)
        const m = migrateRowChannel({ channel, assetType: t.value })
        expect(m, `${channel}|${t.value} should migrate`).not.toBeNull()
        expect(effectiveStageAfter(m!), `${channel}|${t.value}`).toBe(before)
        checked.push(`${channel}|${t.value}`)
      }
    }
    // Guard against the loop silently walking nothing if typesFor ever changes shape.
    expect(checked.length).toBeGreaterThan(25)
  })

  it('keeps an asset that never picked a type where its channel put it', () => {
    for (const channel of LEGACY_WEB_CHANNELS) {
      const before = funnelStageFor(channel as ChannelId, undefined)
      const m = migrateRowChannel({ channel })
      expect(effectiveStageAfter(m!), `${channel} with no type`).toBe(before)
    }
  })

  it('keeps a hand-authored custom type where its channel put it', () => {
    // An x- type is arbitrary by design, so no table can hold it. post-purchase is the sharpest
    // case: retention today, and web's own default is consideration.
    const m = migrateRowChannel({ channel: 'post-purchase', assetType: 'x-loyalty-tier' })
    expect(m!.assetType).toBe('x-loyalty-tier')
    expect(effectiveStageAfter(m!)).toBe('retention')
    expect(m!.funnelStage).toBe('retention')
  })

  it('does not pin a stage where the table already agrees', () => {
    // Pinning everything would work and would also bury every asset under an override, so the next
    // person to correct a stage in the table would find it had no effect on anything.
    const m = migrateRowChannel({ channel: 'website', assetType: 'homepage' })
    expect(m!.funnelStage).toBeUndefined()
    expect(effectiveStageAfter(m!)).toBe('consideration')
  })

  it('leaves an asset that was already dragged into a band alone', () => {
    const m = migrateRowChannel({ channel: 'checkout', assetType: 'cart', funnelStage: 'awareness' })
    expect(m!.funnelStage).toBeUndefined()
    expect(m!.assetType).toBe('cart')
  })
})

describe('web channel type mapping', () => {
  it('separates the two upsells, which were the same key on different channels', () => {
    expect(webTypeFor('checkout', 'upsell')).toBe('upsell')
    expect(webTypeFor('post-purchase', 'upsell')).toBe(POST_PURCHASE_UPSELL)
    expect(WEB_TYPE_STAGE.upsell).toBe('conversion')
    expect(WEB_TYPE_STAGE[POST_PURCHASE_UPSELL]).toBe('retention')
  })

  it('turns each legacy channel into the page type it always was', () => {
    expect(webTypeFor('website', 'homepage')).toBe('homepage')
    expect(webTypeFor('blog', 'article')).toBe('article')
    expect(webTypeFor('landing-page', 'lead-capture')).toBe('lead-capture')
  })

  it('leaves channels that are not web alone', () => {
    expect(isLegacyWebChannel('email')).toBe(false)
    expect(migrateRowChannel({ channel: 'email', assetType: 'newsletter' })).toBeNull()
    expect(migrateRowChannel({ channel: 'linkedin' })).toBeNull()
  })
})
