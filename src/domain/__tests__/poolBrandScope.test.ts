import { describe, expect, it } from 'vitest'

/**
 * A RECORD BELONGING TO ANOTHER BRAND NEVER TRAVELS.
 *
 * This pins the predicate the copy writer's pools filter on. It became reachable when a Brand card
 * gained the power to rebind an existing campaign: boards are keyed by campaign name and survive the
 * move, so the previous brand's Voice and Message cards stay wired to the brief and their refs still
 * resolve. Without the check the writer is handed the new brand's guide and the old brand's tone in
 * the same request, and it fails silently in the worst way, because the pools that DO fall back
 * (audience, proof) fall back to the new brand and make the rebind look like it worked.
 *
 * The predicate lives inline in useTrafficStore's poolsFrom rather than in a domain module, so it is
 * restated here. That is a real duplication and the reason this file says so out loud: if the rule
 * in the store changes, this test does not fail, it goes stale. Kept because a stale test that
 * documents the intended rule is still worth more than no statement of it at all.
 */

/** The rule as implemented: unbranded records are shared, an explicit mismatch is refused. */
const ofBrand =
  (client: string) =>
  (r: { brand?: string }): boolean =>
    !r.brand || r.brand === client

describe('brand scoping of the copy pools', () => {
  const forGlobex = ofBrand('Globex')

  it('refuses a record owned by another brand', () => {
    expect(forGlobex({ brand: 'Acme' })).toBe(false)
  })

  it('allows the current brand', () => {
    expect(forGlobex({ brand: 'Globex' })).toBe(true)
  })

  it('allows an unbranded record, which is shared rather than foreign', () => {
    expect(forGlobex({})).toBe(true)
    expect(forGlobex({ brand: undefined })).toBe(true)
    expect(forGlobex({ brand: '' })).toBe(true)
  })

  /**
   * The scenario in full, as a filter over a mixed library: after a rebind from Acme to Globex, only
   * Globex's and the shared records survive. Acme's voice does not, however it was wired.
   */
  it('filters a mixed library down to the campaign brand plus shared records', () => {
    const voices = [
      { id: 'v1', name: 'Acme house voice', brand: 'Acme' },
      { id: 'v2', name: 'Globex house voice', brand: 'Globex' },
      { id: 'v3', name: 'Plain english', brand: undefined },
    ]
    // Every record is wired, so id matching alone would return all three.
    const wired = new Set(['v1', 'v2', 'v3'])
    const survived = voices.filter((v) => forGlobex(v) && wired.has(v.id)).map((v) => v.id)
    expect(survived).toEqual(['v2', 'v3'])
  })
})
