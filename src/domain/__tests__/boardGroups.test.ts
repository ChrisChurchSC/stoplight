import { describe, expect, it } from 'vitest'
import { pruneBoard, type FlowBoard } from '../flowBoard'

/**
 * A GROUP OUTLIVING ITS CARDS IS THE FAILURE THAT SURVIVES A RELOAD.
 *
 * Membership is a list of node ids, and every one of them is a key into something the board does not
 * own: an object it holds, a channel derived from the campaign's assets, a post row. Any of those can
 * go while the board is closed — a channel deleted from the Grid, a post archived, a record removed —
 * and nothing in the grouping UI is there to hear about it. Load is the only place that check runs.
 *
 * The two-member floor is the part that has to hold here rather than only in the UI. A group down to
 * one card would come back as a frame drawn around a single card that re-selects itself on every
 * click, and it would keep being written back out on each save, so the bad state persists rather
 * than passing. Dropping it at the door is what stops that.
 *
 * Deliverable keys and row ids are the members most likely to go, and neither looks like a board id:
 * "linkedin|text" and "row_9" are only legal because targetIds says so. Testing with object ids alone
 * would have passed against a prune that silently deleted every group of channels and posts — which
 * is to say, every group a person is actually likely to draw.
 */

const board = (over: Partial<FlowBoard> = {}): FlowBoard => ({
  key: 'Spring Launch',
  objects: [
    { id: 'co_1', kind: 'audience', text: '' },
    { id: 'co_2', kind: 'message', text: '' },
    { id: 'co_3', kind: 'proof-point', text: '' },
  ],
  placements: [],
  pos: {},
  connectors: [],
  ...over,
})

const known = {
  objectKinds: new Set(['audience', 'message', 'proof-point']),
  smartObjectIds: new Set<string>(),
  targetIds: new Set(['linkedin|text', 'meta-ads|single-image', 'row_9']),
}

describe('pruneBoard: groups', () => {
  it('keeps a group whose cards all still exist', () => {
    const out = pruneBoard(board({ groups: [{ id: 'g1', name: 'Launch week', ids: ['co_1', 'co_2'] }] }), known)
    expect(out.groups).toEqual([{ id: 'g1', name: 'Launch week', ids: ['co_1', 'co_2'] }])
  })

  it('keeps a group of channels and posts, which are legal only via targetIds', () => {
    const out = pruneBoard(
      board({ groups: [{ id: 'g1', name: 'Paid', ids: ['linkedin|text', 'meta-ads|single-image', 'row_9'] }] }),
      known,
    )
    expect(out.groups?.[0].ids).toEqual(['linkedin|text', 'meta-ads|single-image', 'row_9'])
  })

  it('drops a member whose card has gone but keeps the group when two survive', () => {
    const out = pruneBoard(board({ groups: [{ id: 'g1', name: 'Launch', ids: ['co_1', 'co_2', 'co_gone'] }] }), known)
    expect(out.groups?.[0].ids).toEqual(['co_1', 'co_2'])
  })

  it('dissolves a group starved down to one surviving card', () => {
    const out = pruneBoard(board({ groups: [{ id: 'g1', name: 'Launch', ids: ['co_1', 'gone_a'] }] }), known)
    expect(out.groups).toBeUndefined()
  })

  it('carries no groups field at all when every group dissolved', () => {
    const out = pruneBoard(board({ groups: [{ id: 'g1', name: 'x', ids: ['gone_a', 'gone_b'] }] }), known)
    expect('groups' in out).toBe(false)
  })

  it('leaves a board saved before groups existed exactly as it was', () => {
    const out = pruneBoard(board(), known)
    expect('groups' in out).toBe(false)
  })
})
