import { describe, expect, it } from 'vitest'
import { CREATABLE_OBJECT_KINDS, REF_TYPE_FOR_OBJECT_KIND, type CanvasObjectKind } from '../flowBoard'
import { OBJECT_META } from '../canvasObjectMeta'

/**
 * A CARD THAT NEEDS A RECORD HAS TO BE ABLE TO MAKE ONE.
 *
 * Concept and Season shipped for months with the picker and without the "+ New …" behind it, so on
 * a brand with nothing written yet both cards read "No concepts yet" and stopped there. Nothing
 * caught it, because the two lists that disagreed sat four hundred lines apart inside a component.
 * They sit next to each other now, and this is the test that keeps them honest.
 */
describe('creatable object kinds', () => {
  const withRecord = (Object.keys(REF_TYPE_FOR_OBJECT_KIND) as CanvasObjectKind[])

  it('offers "+ New …" on every kind that carries a record', () => {
    // Data source is the one exception, and it is an exception on purpose: a data set is a table,
    // not a name, so the card resolves an existing one and its own picker is where a new one is made.
    const missing = withRecord.filter((k) => k !== 'data-source' && !CREATABLE_OBJECT_KINDS.has(k))
    expect(missing).toEqual([])
  })

  it('never offers to create a data set through the card picker', () => {
    expect(CREATABLE_OBJECT_KINDS.has('data-source')).toBe(false)
  })

  it('names only kinds that exist and can hold a record', () => {
    for (const kind of CREATABLE_OBJECT_KINDS) {
      // A creatable kind with no card is a name nothing can reach.
      expect(OBJECT_META[kind], `${kind} has no card`).toBeTruthy()
      // Markup is a sticky: the text IS the card, so there is no record to make.
      expect(OBJECT_META[kind].role, `${kind} is markup`).toBe('input')
    }
  })

  it('includes Brand, which owns the campaign rather than being referred to by it', () => {
    // Brand deliberately has no ref type, so the parity check above cannot vouch for it. Without a
    // way to make one, a brand-new workspace has no first brand and the campaign never binds.
    expect(REF_TYPE_FOR_OBJECT_KIND.brand).toBeUndefined()
    expect(CREATABLE_OBJECT_KINDS.has('brand')).toBe(true)
  })
})
