import { describe, expect, it } from 'vitest'
import { postSpec } from '../postSpec'
import type { TrafficRow } from '../types'

/**
 * A POST WITH NO COMPONENTS IS NOT READY.
 *
 * The Copy and CTA checks live inside `if (mainField)`, so an empty schema skipped both and the post
 * came back ready with no copy in it. Unreachable through a supported format today, which is the
 * cheapest possible moment to pin it.
 */
const row = (over: Partial<TrafficRow> = {}): TrafficRow =>
  ({ id: 'r1', campaign: 'C', assetName: 'Post', channel: 'linkedin', assetType: 'text', messaging: {}, ...over }) as unknown as TrafficRow

describe('postSpec with no resolvable components', () => {
  it('a normal post still reports a Copy check', () => {
    const checks = postSpec(row())
    expect(checks.some((c) => c.key === 'copy')).toBe(true)
  })

  it('an empty schema fails rather than passing', () => {
    // messagingFields falls back to the channel base, so force the empty case directly.
    const checks = postSpec(row(), [])
    const copy = checks.find((c) => c.key === 'copy')
    expect(copy?.ok).toBe(false)
    expect(copy?.detail).toContain('format is missing')
  })
})
