import { describe, expect, it } from 'vitest'
import { scopeOf, visibleOn, type SmartObject } from '../smartObject'

/**
 * THE LADDER HAS THREE RUNGS, AND EACH ONE SAYS WHO MAY SEE THE OBJECT.
 *
 * Every failure here is silent. An object that should be visible and is not simply never appears in
 * a library — nothing errors, and the object is still there when you look in storage. An object that
 * should NOT be visible and is, is worse: it is one client's bundle offered while writing another's,
 * which is the leak this codebase filters brand-scoped record lists to avoid everywhere else.
 *
 * So visibility is one function rather than a test repeated at each call site, and this is the test
 * of that function.
 */

const obj = (over: Partial<SmartObject> = {}): SmartObject => ({
  id: 'so_1',
  name: 'The RevOps buyer',
  refs: [],
  contents: [],
  ...over,
})

describe('visibleOn', () => {
  it('keeps a campaign object on the board it was made on, and nowhere else', () => {
    const o = obj({ scope: 'campaign', campaign: 'Acme — Fall', brand: 'Acme' })
    expect(visibleOn(o, { campaign: 'Acme — Fall' })).toBe(true)
    expect(visibleOn(o, { campaign: 'Acme — Spring' })).toBe(false)
    // Carrying a brand does not promote it. `brand` on a local object records where a promotion
    // would land, and reading it as permission is the bug the scope field exists to prevent.
    expect(visibleOn(o, { brand: 'Acme' }), 'a brand is not a board').toBe(false)
  })

  it('keeps a brand object inside its own brand', () => {
    const o = obj({ scope: 'brand', brand: 'Acme' })
    expect(visibleOn(o, { brand: 'Acme' })).toBe(true)
    expect(visibleOn(o, { brand: 'Globex' }), 'the leak worth caring about').toBe(false)
  })

  it('shows a shared object to every brand, including one it has never met', () => {
    const o = obj({ scope: 'shared', brand: 'Acme' })
    expect(visibleOn(o, { brand: 'Acme' })).toBe(true)
    expect(visibleOn(o, { brand: 'Globex' })).toBe(true)
    // Its origin brand is provenance, not permission — so a shared object is visible even where
    // nothing about the brand is known yet.
    expect(visibleOn(o, {})).toBe(true)
  })

  it('asks for the right key: a campaign object is matched on the BOARD, not the brand', () => {
    // The two are different strings and the helper takes both, so passing one where the other was
    // meant would answer confidently and wrongly. Pinned because the call sites read `boardKey`.
    const o = obj({ scope: 'campaign', campaign: 'Acme — Fall' })
    expect(visibleOn(o, { brand: 'Acme — Fall' })).toBe(false)
  })

  it('reads an object written before the ladder existed as a brand object', () => {
    // Those all predate scoping and were library objects, so a missing scope must not read as the
    // most permissive rung now that a more permissive one exists.
    const legacy = obj({ brand: 'Acme' })
    expect(scopeOf(legacy)).toBe('brand')
    expect(visibleOn(legacy, { brand: 'Acme' })).toBe(true)
    expect(visibleOn(legacy, { brand: 'Globex' }), 'not shared by omission').toBe(false)
  })
})
