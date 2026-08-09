import { describe, expect, it } from 'vitest'
import { hasDefinition, undefinedRecords } from '../recordDefined'

/**
 * A NAME IS A LABEL, NOT A DEFINITION.
 *
 * Generation mints records as it needs them and fills them with what it had, which is often the
 * name alone. Left that way a brand's library becomes a list of nouns: a picker offering two
 * audiences with nothing under either, where choosing means already knowing. This is the line
 * between a record that defines something and one that is only a label, and it is drawn on
 * recordDetail — the same line every picker prints — so it cannot disagree with what is on screen.
 */
describe('hasDefinition', () => {
  it('refuses a record that carries only a name', () => {
    expect(hasDefinition('audience', { id: 'a1', name: 'Coastal Trip Planners', role: '' })).toBe(false)
    expect(hasDefinition('message', { id: 'm1', name: 'Speed angle' })).toBe(false)
  })

  it('accepts a record whose own line says something', () => {
    expect(hasDefinition('audience', { id: 'a1', name: 'Charter captains', role: 'Boat owner' })).toBe(true)
    expect(hasDefinition('message', { id: 'm1', name: 'Speed', angle: 'Sets up in a day' })).toBe(true)
    expect(hasDefinition('voice', { id: 'v1', name: 'House', summary: 'Plain and short' })).toBe(true)
  })

  it('accepts a record defined by an attached document, whatever its fields say', () => {
    // A brief handed over as a .md is the longest form of a definition, and a record given one may
    // legitimately carry nothing in its own fields.
    const doc = { name: 'icp.md', text: '# Who they are\nAnglers.', addedAt: 1 }
    expect(hasDefinition('audience', { id: 'a1', name: 'Anglers', role: '', reference: doc })).toBe(true)
  })

  it('does not count an empty document as one', () => {
    const blank = { name: 'icp.md', text: '   ', addedAt: 1 }
    expect(hasDefinition('audience', { id: 'a1', name: 'Anglers', role: '', reference: blank })).toBe(false)
  })

  it('treats whitespace as nothing', () => {
    expect(hasDefinition('message', { id: 'm1', name: 'Speed', angle: '   ' })).toBe(false)
  })

  it('exempts kinds that have no line of their own', () => {
    // recordDetail omits them deliberately (a data set says what it is by its shape), so inventing
    // a test here would mark every one of them undefined for a rule that was never about them.
    expect(hasDefinition('channel', { id: 'c1', name: 'LinkedIn' })).toBe(true)
    expect(hasDefinition('objective', { id: 'o1', name: 'Pipeline' })).toBe(true)
  })

  it('reads the same fallbacks the pickers print', () => {
    // pattern falls back to its type, company to its segment, proof to its metric: the line on
    // screen is the line judged, or the two would disagree about the same record.
    expect(hasDefinition('pattern', { id: 'p1', name: 'Ladder', description: '', type: 'hook' })).toBe(true)
    expect(hasDefinition('company', { id: 'c1', name: 'Acme', description: '', segment: 'Mid-market' })).toBe(true)
    expect(hasDefinition('proofPoint', { id: 'r1', label: 'Uptime', detail: '', metric: '99.99%' })).toBe(true)
  })
})

describe('undefinedRecords', () => {
  it('picks out only the label-only ones, in order', () => {
    const shelf = [
      { id: 'a1', name: 'Defined', role: 'Boat owner' },
      { id: 'a2', name: 'Label only', role: '' },
      { id: 'a3', name: 'Also defined', role: 'Guide' },
      { id: 'a4', name: 'Also label only' },
    ]
    expect(undefinedRecords('audience', shelf).map((r) => r.id)).toEqual(['a2', 'a4'])
  })

  it('finds none on a shelf where every record says something', () => {
    expect(undefinedRecords('audience', [{ id: 'a1', name: 'X', role: 'Y' }])).toEqual([])
  })
})
