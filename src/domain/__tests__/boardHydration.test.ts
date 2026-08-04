import { describe, expect, it } from 'vitest'
import { pruneBoard } from '../flowBoard'
import type { FlowBoard } from '../flowBoard'

/**
 * A BOARD IS NOT PRUNED AGAINST A WORKSPACE THAT HAS NOT LOADED.
 *
 * pruneBoard answers "which of these ids still exist?" by taking the caller's word for what exists.
 * That is the right shape — it has no business reaching into a store — but it makes the caller
 * responsible for only asking once it can answer, and for a while nobody was.
 *
 * With a backend configured, `rows`, `smartObjects` and every record slice start empty and are
 * filled by hydrateRecords a beat after mount. openView pruned against them regardless, so a
 * campaign opened inside that window had every wire to a deliverable and every placement read as
 * dangling and dropped. The canvas then autosaved the pruned board back, and saveFlowBoards writes
 * the WHOLE slice under one key, so this device's damaged copy replaced the workspace's. Generate
 * made it immediate rather than eventual: regenerateFlow flushes the board before drafting, which
 * is why the cards went at the moment of generating.
 *
 * These pin the destructiveness that makes the `boardsHydrated` gate necessary. They are a statement
 * about pruneBoard's contract, not a claim that any particular caller honours it — the gate itself
 * lives in useTrafficStore (boardsHydrated, and saveFlowBoard's refusal to persist without it) and
 * in FlowsView (loadBoardFor prunes only when hydrated; the autosave and regenerateFlow's flush do
 * not write until then).
 */

const KINDS = new Set(['audience', 'message', 'brand'])

/** A board like a real campaign's: two cards, a placement, wires to a deliverable and a post. */
const board = (): FlowBoard => ({
  key: 'Peak season',
  objects: [
    { id: 'c1', kind: 'audience', text: '' },
    { id: 'c2', kind: 'message', text: '', smartObjectId: 'so1' },
  ],
  placements: [{ id: 'pl1', smartObjectId: 'so1', memberIds: ['c1'] }],
  pos: { c1: { x: 0, y: 0 }, c2: { x: 10, y: 0 } },
  connectors: [
    { from: 'c1', to: 'linkedin|post' },
    { from: 'c2', to: 'row_7' },
    { from: 'c1', to: 'campaign' },
  ],
  detached: ['email|newsletter'],
})

/** Everything loaded: the state pruning is safe in. */
const hydrated = {
  objectKinds: KINDS,
  smartObjectIds: new Set(['so1']),
  targetIds: new Set(['linkedin|post', 'row_7', 'email|newsletter']),
}

/** Mid-load: the slices exist but are empty, which is indistinguishable from "all of it is gone". */
const unhydrated = {
  objectKinds: KINDS,
  smartObjectIds: new Set<string>(),
  targetIds: new Set<string>(),
}

describe('pruning a board against a loaded workspace', () => {
  it('keeps the wires, the placement and the cut', () => {
    const out = pruneBoard(board(), hydrated)
    expect(out.objects).toHaveLength(2)
    expect(out.placements).toHaveLength(1)
    expect(out.connectors).toHaveLength(3)
    expect(out.detached).toEqual(['email|newsletter'])
  })

  it('leaves the smart object attached to the card that carries it', () => {
    expect(pruneBoard(board(), hydrated).objects[1].smartObjectId).toBe('so1')
  })
})

describe('pruning a board before the workspace has loaded', () => {
  /**
   * Each of these is the loss the gate prevents. They assert the CURRENT behaviour of pruneBoard on
   * purpose: it is correct for what it is asked, and the fix is to stop asking it too early rather
   * than to make it guess.
   */
  it('drops every wire to a deliverable or a post', () => {
    const out = pruneBoard(board(), unhydrated)
    // Only the wire to 'campaign' survives, because that endpoint is a board id rather than a record.
    expect(out.connectors.map((c) => c.to)).toEqual(['campaign'])
  })

  it('drops the placement', () => {
    expect(pruneBoard(board(), unhydrated).placements).toHaveLength(0)
  })

  it('detaches the smart object from the card that carries it', () => {
    expect(pruneBoard(board(), unhydrated).objects[1].smartObjectId).toBeUndefined()
  })

  it('drops the cut, which silently reattaches a channel the user disconnected', () => {
    expect(pruneBoard(board(), unhydrated).detached).toBeUndefined()
  })
})
