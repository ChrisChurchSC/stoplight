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

/**
 * DELETING A SMART OBJECT MUST NOT SILENTLY UNWIRE THE CARDS IT LEAVES BEHIND.
 *
 * deleteSmartObject removes the object from the library and never touches any board, so every
 * campaign it was placed on keeps a placement whose smartObjectId now dangles. This function is
 * where that is reconciled, and it already decided the right thing for the CARDS: they survive, and
 * line ~308 clears their smartObjectId so they carry on as plain cards. It just forgot their wires.
 *
 * The placement is dropped, so its id leaves liveIds, so every connector touching it is deleted —
 * including the one that attached the whole object to the campaign. The cards reappear loose and
 * unattached, the autosave writes that back, and redrawing by hand is the only repair. Reported as
 * an Audience card reading "unattached" on a campaign that was plainly written to that audience.
 *
 * A wire to the object meant "everything in here informs the campaign". Once the object is gone the
 * members ARE the everything, so each of them inherits the wire. That is the same judgement the
 * surviving cards already embody, applied to the edges instead of the nodes.
 */
describe('pruning a board whose smart object was deleted from the library', () => {
  const deleted = { objectKinds: KINDS, smartObjectIds: new Set<string>(), targetIds: new Set(['linkedin|post']) }

  /** An object placed on the campaign, wired in as a whole, holding two cards. */
  const placed = (): FlowBoard => ({
    key: 'Peak season',
    objects: [
      { id: 'aud', kind: 'audience', text: '', smartObjectId: 'so1' },
      { id: 'msg', kind: 'message', text: '', smartObjectId: 'so1' },
    ],
    placements: [{ id: 'pl1', smartObjectId: 'so1', memberIds: ['aud', 'msg'] }],
    pos: {},
    connectors: [{ from: 'pl1', to: 'campaign' }],
  })

  it('keeps the cards', () => {
    const out = pruneBoard(placed(), deleted)
    expect(out.objects.map((o) => o.id)).toEqual(['aud', 'msg'])
    expect(out.placements).toHaveLength(0)
  })

  it('leaves every card it kept still attached to the campaign', () => {
    const out = pruneBoard(placed(), deleted)
    expect(out.connectors).toEqual([
      { from: 'aud', to: 'campaign' },
      { from: 'msg', to: 'campaign' },
    ])
  })

  it('re-points a wire INTO the object onto its cards too', () => {
    const b = placed()
    b.objects.push({ id: 'brand1', kind: 'brand', text: '' })
    b.connectors = [{ from: 'brand1', to: 'pl1' }]
    expect(pruneBoard(b, deleted).connectors).toEqual([
      { from: 'brand1', to: 'aud' },
      { from: 'brand1', to: 'msg' },
    ])
  })

  it('inherits a deliverable, not just the brief', () => {
    const b = placed()
    b.connectors = [{ from: 'pl1', to: 'linkedin|post' }]
    expect(pruneBoard(b, deleted).connectors).toEqual([
      { from: 'aud', to: 'linkedin|post' },
      { from: 'msg', to: 'linkedin|post' },
    ])
  })

  it('drops the wire when the object held nothing that survived', () => {
    // Nothing to inherit it, so there is no card to carry the campaign's context and the edge would
    // point at a node that is not there.
    const b = placed()
    b.objects = []
    b.placements = [{ id: 'pl1', smartObjectId: 'so1', memberIds: [] }]
    expect(pruneBoard(b, deleted).connectors).toEqual([])
  })

  it('never invents a self-edge or a duplicate', () => {
    // A member already wired to the campaign in its own right, plus the object's wire, must not end
    // up with the same edge twice; and a member wired to its own container must not end up wired to
    // itself, which reachesOutput would read as a card pointing at nothing.
    const b = placed()
    b.connectors = [
      { from: 'pl1', to: 'campaign' },
      { from: 'aud', to: 'campaign' },
      { from: 'aud', to: 'pl1' },
    ]
    const out = pruneBoard(b, deleted)
    expect(out.connectors).toEqual([
      { from: 'aud', to: 'campaign' },
      { from: 'msg', to: 'campaign' },
      { from: 'aud', to: 'msg' },
    ])
  })

  it('leaves boards alone while the object is still in the library', () => {
    const out = pruneBoard(placed(), { ...deleted, smartObjectIds: new Set(['so1']) })
    expect(out.placements).toHaveLength(1)
    expect(out.connectors).toEqual([{ from: 'pl1', to: 'campaign' }])
  })
})
