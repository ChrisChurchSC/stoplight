import { describe, expect, it } from 'vitest'
import { CREATABLE_OBJECT_KINDS, REF_TYPE_FOR_OBJECT_KIND, opensRecordStep, type CanvasObjectKind } from '../flowBoard'
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

/**
 * AND THE EXCEPTION ABOVE HAS TO NOT DEAD-END THE TOOLBAR.
 *
 * Data source is the one kind carrying a record list that cannot mint from a name, which is right,
 * and which meant that on a brand with no data sets the toolbar button opened a menu holding an
 * empty list and no "+ New" — no card, no way forward, and a note reading "Make one below" above
 * nothing. Pressing the button did nothing but print a sentence. These pin the rule that decides it.
 */
describe('opening the record step', () => {
  it('drops the card instead of opening a list that cannot be answered', () => {
    // The reported bug, exactly: Data source on a brand holding no data sets.
    expect(opensRecordStep('data-source', 0)).toBe(false)
  })

  it('still opens the picker once there are data sets to pick', () => {
    expect(opensRecordStep('data-source', 3)).toBe(true)
  })

  it('opens on an empty list for every kind that can make what it needs', () => {
    // This is the case the dead-end fix must NOT break: an empty library is where "+ New …" earns
    // its place, and dropping a blank card there would take the create route away from every kind.
    for (const kind of CREATABLE_OBJECT_KINDS) {
      expect(opensRecordStep(kind, 0), `${kind} lost its + New`).toBe(true)
    }
  })

  it('leaves Data source as the only kind that can decline the step', () => {
    // A second such kind added later gets the same trap for free, so it is caught here rather than
    // by somebody pressing the button on an empty brand.
    const declines = (Object.keys(REF_TYPE_FOR_OBJECT_KIND) as CanvasObjectKind[])
      .filter((k) => !opensRecordStep(k, 0))
    expect(declines).toEqual(['data-source'])
  })
})
