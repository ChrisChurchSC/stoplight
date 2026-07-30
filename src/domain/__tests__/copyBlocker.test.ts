import { describe, expect, it } from 'vitest'
import { hasWiredContext } from '../boardResolve'
import type { FlowBoard } from '../flowBoard'

/**
 * THE RULE BEHIND "REFUSE BEFORE THE WIPE".
 *
 * regenerateFlow clears every target's copy before calling draftCopy, because draftCopy only fills
 * components that are empty. So the boundary that decides whether generation can happen at all has
 * to be checked BEFORE that clear, or pressing Generate on an unwired campaign deletes the copy and
 * writes nothing back. This pins the wiring half of that boundary.
 */

const board = (connectors: { from: string; to: string }[], objectIds: string[] = ['c1']): FlowBoard => ({
  key: 'K',
  objects: objectIds.map((id) => ({ id, kind: 'audience' as const, text: '' })),
  placements: [],
  pos: {},
  connectors,
})

describe('hasWiredContext', () => {
  it('a board with no connectors is not wired', () => {
    expect(hasWiredContext(board([]))).toBe(false)
  })

  it('a card wired to another card is still not wired to an output', () => {
    // Cards feeding cards is a chain, not context: nothing reaches the campaign or a deliverable.
    expect(hasWiredContext(board([{ from: 'c1', to: 'c2' }], ['c1', 'c2']))).toBe(false)
  })

  it('a card wired to the campaign hub is wired', () => {
    expect(hasWiredContext(board([{ from: 'c1', to: 'campaign' }]))).toBe(true)
  })

  it('a card wired to a deliverable is wired', () => {
    // The target is not a board object, so it is an output: the brief, a deliverable or a post.
    expect(hasWiredContext(board([{ from: 'c1', to: 'linkedin:text' }]))).toBe(true)
  })
})
