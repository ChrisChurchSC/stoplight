import { describe, expect, it } from 'vitest'
import { isPatternRetired, patternForAsset, usablePatterns, type Pattern } from '../pattern'
import { CREATABLE_OBJECT_KINDS, REF_TYPE_FOR_OBJECT_KIND } from '../flowBoard'
import { OBJECT_META } from '../canvasObjectMeta'

const pat = (p: Partial<Pattern> & { id: string }): Pattern => ({ name: p.id, ...p })

describe('a retired pattern never travels', () => {
  it('counts only archived as retired, so a pattern being tested still travels', () => {
    expect(isPatternRetired({ status: 'archived' })).toBe(true)
    expect(isPatternRetired({ status: 'active' })).toBe(false)
    expect(isPatternRetired({ status: 'testing' })).toBe(false)
    // A pattern saved before status existed, or blanked by hand, is in play rather than retired:
    // absence of an answer is not an answer.
    expect(isPatternRetired({ status: '' })).toBe(false)
    expect(isPatternRetired({})).toBe(false)
  })

  it('drops archived ones from a list and keeps the order of the rest', () => {
    const list = [pat({ id: 'a' }), pat({ id: 'b', status: 'archived' }), pat({ id: 'c', status: 'testing' })]
    expect(usablePatterns(list).map((p) => p.id)).toEqual(['a', 'c'])
  })

  /**
   * The rule that makes archiving worth anything: the REF naming a pattern survives archiving, so
   * the only thing standing between a retired pattern and the copy writer is this filter.
   */
  it('sends nothing when every pattern reaching the asset has been retired', () => {
    expect(patternForAsset([pat({ id: 'a', status: 'archived' })], 0)).toBeUndefined()
  })
})

describe('the pattern one asset is written to', () => {
  it('sends nothing when no pattern reaches the asset', () => {
    expect(patternForAsset([], 0)).toBeUndefined()
  })

  it('lands on every asset when one pattern is pinned, whatever the index', () => {
    const pool = [pat({ id: 'p1', name: 'Myth-bust' })]
    for (const i of [0, 1, 2, 17]) expect(patternForAsset(pool, i)?.name).toBe('Myth-bust')
  })

  /**
   * Choosing patterns is choosing how much the set varies: three wired to the brief span three
   * shapes across the batch rather than writing the same post twenty times.
   */
  it('rotates across the batch so a set spans every shape it was given', () => {
    const pool = [pat({ id: 'p1', name: 'A' }), pat({ id: 'p2', name: 'B' }), pat({ id: 'p3', name: 'C' })]
    const got = [0, 1, 2, 3, 4, 5].map((i) => patternForAsset(pool, i)?.name)
    expect(got).toEqual(['A', 'B', 'C', 'A', 'B', 'C'])
  })

  it('rotates over what is left after retirement, not over the gaps it left behind', () => {
    const pool = [pat({ id: 'p1', name: 'A' }), pat({ id: 'p2', name: 'B', status: 'archived' }), pat({ id: 'p3', name: 'C' })]
    expect([0, 1, 2, 3].map((i) => patternForAsset(pool, i)?.name)).toEqual(['A', 'C', 'A', 'C'])
  })

  it('never indexes off the end of the pool on a negative index', () => {
    const pool = [pat({ id: 'p1', name: 'A' }), pat({ id: 'p2', name: 'B' })]
    expect(patternForAsset(pool, -1)?.name).toBe('B')
  })

  /** An unnamed pattern is a blank instruction, and telling a writer to follow nothing is worse
   *  than telling it nothing. */
  it('drops an unnamed pattern rather than sending a blank instruction', () => {
    expect(patternForAsset([pat({ id: 'p1', name: '   ' })], 0)).toBeUndefined()
  })

  it('sends a pattern on its name alone, unlike a message, because the name is the shape', () => {
    expect(patternForAsset([pat({ id: 'p1', name: 'Before / after' })], 0)).toEqual({
      name: 'Before / after',
      type: undefined,
      description: undefined,
      example: undefined,
      whenToUse: undefined,
    })
  })

  it('carries the descriptive fields where somebody filled them in, trimmed', () => {
    const p = pat({
      id: 'p1',
      name: '  Open loop  ',
      type: 'Structure',
      description: '  Ask, withhold, pay off  ',
      example: 'A line written to it',
      whenToUse: 'Short social',
    })
    expect(patternForAsset([p], 0)).toEqual({
      name: 'Open loop',
      type: 'Structure',
      description: 'Ask, withhold, pay off',
      example: 'A line written to it',
      whenToUse: 'Short social',
    })
  })

  /** An empty string reads to the writer as an answer, so it must arrive as absence. */
  it('omits a field left blank rather than sending an empty answer', () => {
    expect(patternForAsset([pat({ id: 'p1', name: 'X', description: '   ', type: '' })], 0)).toEqual({
      name: 'X',
      type: undefined,
      description: undefined,
      example: undefined,
      whenToUse: undefined,
    })
  })
})

/**
 * The registrations that make a Pattern card work. Each of these is a place a new kind is silently
 * dropped rather than loudly broken: a kind absent from the ref map draws, wires and lights up as
 * attached while reaching the writer with nothing, which is the exact failure the comments in
 * flowBoard.ts record for message, data-source, product and trigger in turn.
 */
describe('the Pattern object kind is registered everywhere a card needs it', () => {
  it('carries a ref type, so a wired card reaches the copy writer', () => {
    expect(REF_TYPE_FOR_OBJECT_KIND.pattern).toBe('pattern')
  })

  it('is creatable, so the first pattern can be made from the card that needed it', () => {
    expect(CREATABLE_OBJECT_KINDS.has('pattern')).toBe(true)
  })

  it('is in the registry the Add menu, the palette and the grid columns all derive from', () => {
    expect(OBJECT_META.pattern.label).toBe('Pattern')
    expect(OBJECT_META.pattern.role).toBe('input')
  })
})
