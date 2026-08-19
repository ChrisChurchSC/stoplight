import { describe, expect, it } from 'vitest'
import { CHANNEL_LIST, resolveChannelId } from '../channels'
import { MESSAGING_OVERRIDE_FORMATS, messagingFields } from '../messaging'
import { GENERIC_CTA_KEY, applyCopyFields, describeAssetFields, fieldCoverage, messagingKeys } from '../assetFields'
import type { ChannelId } from '../types'

/**
 * EVERY CARD, NOT THE ONES SOMEONE THOUGHT TO LIST.
 *
 * "The agent can fill every field" is a claim about the whole schema, and the schema grows: a new
 * channel or a new `channel:assetType` override lands with components nobody has checked are
 * reachable. So this walks the real thing — every channel in CHANNEL_LIST and every override in
 * MESSAGING_OVERRIDE_FORMATS — and proves for each that describe → fill → coverage closes the loop.
 *
 * If someone adds a format and its components cannot be written, a test fails here rather than an
 * agent quietly shipping a half-built card.
 */

/** Every renderable card shape: each channel's default, plus each per-type override. */
const FORMATS: { channel: ChannelId; assetType?: string; label: string }[] = [
  ...CHANNEL_LIST.map((c) => ({ channel: c.id, assetType: undefined, label: c.id })),
  ...MESSAGING_OVERRIDE_FORMATS.map((k) => {
    const [channel, assetType] = k.split(':')
    return { channel: channel as ChannelId, assetType, label: k }
  }),
]

describe('every format the app can render', () => {
  it('has formats to check at all', () => {
    // A guard on the guard: an empty list would make every assertion below vacuously true.
    expect(FORMATS.length).toBeGreaterThan(40)
    expect(MESSAGING_OVERRIDE_FORMATS.length).toBeGreaterThan(10)
  })

  it('describes every component the card renders', () => {
    for (const { channel, assetType, label } of FORMATS) {
      const described = describeAssetFields(channel, assetType).map((f) => f.key)
      const actual = messagingFields(channel, assetType).map((f) => f.key)
      expect(described, `${label}: describe_asset_fields disagrees with the card`).toEqual(actual)
      expect(described.length, `${label}: no components described`).toBeGreaterThan(0)
    }
  })

  it('can fill every component of every format, to complete', () => {
    for (const { channel, assetType, label } of FORMATS) {
      const keys = describeAssetFields(channel, assetType).map((f) => f.key)
      // Exactly what an agent would send after reading get_asset_fields.
      const fields = Object.fromEntries(keys.map((k) => [k, `copy for ${k}`]))
      const { messaging, unmapped } = applyCopyFields(channel, assetType, {}, { fields })
      const coverage = fieldCoverage(channel, assetType, messaging)
      expect(coverage.missing, `${label}: components left unwritable`).toEqual([])
      expect(coverage.complete, `${label}: not complete after writing every key`).toBe(true)
      expect(unmapped, `${label}: an explicit key went unmapped`).toEqual([])
    }
  })

  it('accepts a CTA on every format, including the organic ones that define none', () => {
    for (const { channel, assetType, label } of FORMATS) {
      expect(() =>
        applyCopyFields(channel, assetType, {}, { fields: { [GENERIC_CTA_KEY]: 'Get started' } }),
      ).not.toThrow(`${label}: refused a CTA`)
    }
  })

  it('resolves no alias onto a key the format does not define', () => {
    for (const { channel, assetType, label } of FORMATS) {
      const keys = new Set(messagingFields(channel, assetType).map((f) => f.key))
      for (const [alias, key] of Object.entries(messagingKeys(channel, assetType))) {
        if (!key) continue
        // The generic CTA is the one deliberate exception — the card renders it regardless.
        if (key === GENERIC_CTA_KEY) continue
        expect(keys.has(key), `${label}: alias ${alias} resolved to "${key}", not a component`).toBe(true)
      }
    }
  })

  it('resolves no two aliases onto the same key, in any format', () => {
    for (const { channel, assetType, label } of FORMATS) {
      const keys = Object.values(messagingKeys(channel, assetType)).filter(Boolean)
      expect(new Set(keys).size, `${label}: two aliases collided`).toBe(keys.length)
    }
  })
})

describe('naming the channel', () => {
  it('resolves the capitalization an agent would naturally send', () => {
    // The tools defaulted to "Instagram", which is not a ChannelId — it fell through to a generic
    // headline/body/CTA fallback and then reported that wrong card complete.
    expect(resolveChannelId('Instagram')).toBe('instagram')
    expect(messagingFields('Instagram' as ChannelId).map((f) => f.key)).not.toEqual(
      messagingFields('instagram').map((f) => f.key),
    )
  })

  it('resolves every channel from its own id, label and short tag', () => {
    for (const c of CHANNEL_LIST) {
      expect(resolveChannelId(c.id), `${c.id}: id`).toBe(c.id)
      expect(resolveChannelId(c.label), `${c.id}: label "${c.label}"`).toBe(c.id)
      expect(resolveChannelId(c.short), `${c.id}: short "${c.short}"`).toBe(c.id)
    }
  })
})
