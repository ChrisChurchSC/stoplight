import { describe, expect, it } from 'vitest'
import { isCustomType, isKnownType, isPreservableType, typeLabel } from '../channelAssetTypes'

/**
 * A custom format must survive the six sites that coerce an unknown type to the channel's primary,
 * WITHOUT consulting any store. Recognition that depends on hydration would silently retype
 * somebody's asset on a fresh device, which is the one failure this prefix exists to prevent.
 */
describe('custom formats', () => {
  it('recognises the shape alone', () => {
    expect(isCustomType('x-booth-panel')).toBe(true)
    expect(isCustomType('x-podcast_desc')).toBe(true)
    expect(isCustomType('homepage')).toBe(false)
    expect(isCustomType(undefined)).toBe(false)
  })

  it('never contains a colon, which would break the messaging override key', () => {
    expect(isCustomType('x-bad:type')).toBe(false)
  })

  it('is preserved even though it cannot be named', () => {
    expect(isPreservableType('website', 'x-booth-panel')).toBe(true)
    expect(isKnownType('website', 'x-booth-panel')).toBe(false)
  })

  it('a real type is both preservable and known', () => {
    expect(isPreservableType('website', 'homepage')).toBe(true)
    expect(isKnownType('website', 'homepage')).toBe(true)
  })

  it('an unknown non-custom type is neither, so it still falls back', () => {
    expect(isPreservableType('website', 'invented')).toBe(false)
  })

  it('says a custom format is missing rather than rendering an empty label', () => {
    expect(typeLabel('website', 'x-booth-panel')).toBe('Custom format, missing')
    expect(typeLabel('website', 'nonsense')).toBe('')
  })
})
