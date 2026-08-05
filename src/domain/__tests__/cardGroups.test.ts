import { describe, expect, it } from 'vitest'
import {
  expandToGroups,
  groupMates,
  isWholeGroup,
  nextGroupName,
  pruneGroups,
  renameGroup,
  withGroup,
  withoutGroup,
  type CardGroup,
} from '../cardGroups'

/**
 * A GROUP IS A PROMISE THAT AN ARRANGEMENT SURVIVES.
 *
 * The canvas already let a card be dragged anywhere and remembered where it landed. What it could
 * not do is hold a SET of cards in a shape — the auto-layout owns every card it wasn't told to
 * leave alone, so a hand-built cluster came apart the moment the board changed underneath it. A
 * group is the record that says "these belong at these offsets from each other".
 *
 * The rules worth pinning are the ones that keep that record honest as the board moves under it.
 *
 * A card in two groups is incoherent — dragging it would move two sets at once and neither could be
 * said to have held its shape. So joining a group means leaving the old one, and the case that
 * matters is the group you left: take two members out of three and the leftover single card is no
 * longer a group at all. It must dissolve, not linger as a one-card group that renders a frame
 * around nothing and re-selects itself every time that card is clicked.
 *
 * The same threshold has to hold when the change comes from outside. Deleting a card off the board
 * doesn't route through the grouping UI, so a group can be starved down to one member without ever
 * being touched — pruning is the only thing standing between that and a stale frame.
 *
 * Selection expansion carries the whole feature's feel: clicking one card selects its group, which
 * is what makes a group a THING rather than a saved list. It has to leave ungrouped cards alone,
 * because the marquee runs every selection through it.
 */

const g = (id: string, ids: string[], name = id): CardGroup => ({ id, name, ids })

describe('withGroup', () => {
  it('refuses a group of fewer than two cards', () => {
    expect(withGroup([], ['a'], 'Group 1', 'g1').group).toBeNull()
    expect(withGroup([], [], 'Group 1', 'g1').groups).toEqual([])
    // Duplicates are one card, not two.
    expect(withGroup([], ['a', 'a'], 'Group 1', 'g1').group).toBeNull()
  })

  it('groups distinct cards and keeps selection order', () => {
    const { groups, group } = withGroup([], ['c', 'a', 'b'], 'Launch week', 'g1')
    expect(group).toEqual({ id: 'g1', name: 'Launch week', ids: ['c', 'a', 'b'] })
    expect(groups).toHaveLength(1)
  })

  it('moves a card out of its old group rather than letting it sit in two', () => {
    const { groups } = withGroup([g('g1', ['a', 'b', 'c'])], ['a', 'x'], 'New', 'g2')
    const old = groups.find((x) => x.id === 'g1')!
    expect(old.ids).toEqual(['b', 'c'])
    expect(groups.find((x) => x.id === 'g2')!.ids).toEqual(['a', 'x'])
  })

  it('dissolves the group it emptied below two members', () => {
    // g1 had three; two of them leave, so the single leftover is not a group.
    const { groups } = withGroup([g('g1', ['a', 'b', 'c'])], ['a', 'b'], 'New', 'g2')
    expect(groups.map((x) => x.id)).toEqual(['g2'])
  })

  it('regrouping the exact same cards replaces the group instead of stacking one', () => {
    const { groups } = withGroup([g('g1', ['a', 'b'])], ['a', 'b'], 'Again', 'g2')
    expect(groups).toHaveLength(1)
    expect(groups[0].id).toBe('g2')
  })
})

describe('pruneGroups', () => {
  it('drops deleted cards and keeps the group when two survive', () => {
    const next = pruneGroups([g('g1', ['a', 'b', 'c'])], new Set(['a', 'b']))
    expect(next[0].ids).toEqual(['a', 'b'])
  })

  it('dissolves a group starved down to one surviving card', () => {
    expect(pruneGroups([g('g1', ['a', 'b'])], new Set(['a']))).toEqual([])
  })

  it('returns the same reference when nothing was deleted', () => {
    const groups = [g('g1', ['a', 'b'])]
    expect(pruneGroups(groups, new Set(['a', 'b', 'z']))).toBe(groups)
  })
})

describe('expandToGroups', () => {
  it('pulls in the rest of a group when one member is touched', () => {
    expect([...expandToGroups([g('g1', ['a', 'b', 'c'])], ['b'])].sort()).toEqual(['a', 'b', 'c'])
  })

  it('leaves ungrouped cards exactly as selected', () => {
    expect([...expandToGroups([g('g1', ['a', 'b'])], ['x', 'y'])]).toEqual(['x', 'y'])
  })

  it('merges overlapping groups in one selection without duplicating', () => {
    const groups = [g('g1', ['a', 'b']), g('g2', ['c', 'd'])]
    expect([...expandToGroups(groups, ['a', 'd'])].sort()).toEqual(['a', 'b', 'c', 'd'])
  })
})

describe('group helpers', () => {
  it('groupMates returns the card alone when it is in no group', () => {
    expect(groupMates([g('g1', ['a', 'b'])], 'z')).toEqual(['z'])
    expect(groupMates([g('g1', ['a', 'b'])], 'a')).toEqual(['a', 'b'])
  })

  it('isWholeGroup is true only for the exact membership', () => {
    const grp = g('g1', ['a', 'b'])
    expect(isWholeGroup(grp, new Set(['a', 'b']))).toBe(true)
    expect(isWholeGroup(grp, new Set(['a']))).toBe(false)
    expect(isWholeGroup(grp, new Set(['a', 'b', 'c']))).toBe(false)
  })

  it('nextGroupName skips names already taken', () => {
    expect(nextGroupName([])).toBe('Group 1')
    expect(nextGroupName([g('g1', ['a', 'b'], 'Group 1')])).toBe('Group 2')
    expect(nextGroupName([g('g1', ['a', 'b'], 'Group 2')])).toBe('Group 1')
  })

  it('rename ignores an empty name so a frame never loses its label', () => {
    const groups = [g('g1', ['a', 'b'], 'Launch')]
    expect(renameGroup(groups, 'g1', '   ')[0].name).toBe('Launch')
    expect(renameGroup(groups, 'g1', ' Sprint ')[0].name).toBe('Sprint')
  })

  it('withoutGroup cuts only the named group', () => {
    const groups = [g('g1', ['a', 'b']), g('g2', ['c', 'd'])]
    expect(withoutGroup(groups, 'g1').map((x) => x.id)).toEqual(['g2'])
  })
})
