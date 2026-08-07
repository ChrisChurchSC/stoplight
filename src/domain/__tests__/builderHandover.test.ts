import { describe, expect, it } from 'vitest'
import { deliverableKeyFor, pruneBoard, remapBuiltTargets, renameEndpoint } from '../flowBoard'
import type { FlowBoard } from '../flowBoard'

/**
 * WHAT HAPPENS TO A WIRE DRAWN BEFORE THE THING IT POINTS AT EXISTS.
 *
 * The builder lets you wire an Audience card into an email before either the campaign or the email
 * exists, which is the right order to work in and the reason build mode has a board at all. But a
 * deliverable is two different ids either side of Build: a minted node id while you are configuring
 * it, and deliverableKeyFor once it is a group of real assets. Nothing translated between them.
 *
 * The result was a bug that erased its own evidence. attachToTarget materialises a card's records
 * onto the deliverable's ROWS, and in build mode there are none, so it returned silently and the
 * records never reached the writer. Then adoptBuilderBoard handed the board over verbatim and the
 * first openView pruned the wire for pointing at an endpoint the campaign had never heard of. What
 * was left was an Audience card sitting on the canvas, unwired, contributing nothing, and a
 * context-gap toast telling the person to add an audience card.
 *
 * These pin the translation and the deletion it prevents. The orchestration around them (collecting
 * the mapping while seeding, then writing the refs onto the fresh rows) lives in FlowsView's build,
 * which is the only place both ids are ever in hand.
 */

const emailRow = { channel: 'email', assetType: 'nurture' }
const NODE = 'dl_m8x2k_a91fb'
const KEY = deliverableKeyFor(emailRow)

/** The builder's board at the moment Build is pressed: a named Audience card wired to an email node. */
const handedOver = (): FlowBoard => ({
  key: 'Spring launch',
  objects: [{ id: 'c1', kind: 'audience', text: '', refId: 'seg_revops' }],
  placements: [],
  pos: { c1: { x: 0, y: 0 }, [NODE]: { x: 200, y: 0 } },
  connectors: [
    { from: 'c1', to: NODE },
    { from: 'c1', to: 'campaign' },
  ],
})

/** The campaign right after Build: the node is gone, the deliverable it became is what exists. */
const afterBuild = {
  objectKinds: new Set(['audience']),
  smartObjectIds: new Set<string>(),
  targetIds: new Set([KEY]),
}

describe('handing the builder board to the campaign it built', () => {
  it('repoints a wire from the build node to the deliverable it became', () => {
    const board = handedOver()
    const next = remapBuiltTargets(board.connectors, new Map([[NODE, KEY]]))
    expect(next).toEqual([
      { from: 'c1', to: 'email|nurture' },
      { from: 'c1', to: 'campaign' },
    ])
  })

  it('leaves every other endpoint alone', () => {
    // The brief is 'campaign' on both sides of Build, and a node that seeded nothing has no key to
    // be given. Touching either would be inventing an endpoint rather than translating one.
    const next = remapBuiltTargets(handedOver().connectors, new Map([['dl_seeded_nothing', 'x|y']]))
    expect(next).toEqual(handedOver().connectors)
  })

  it('is what stops the wire being pruned, which is how this went unnoticed', () => {
    const board = handedOver()
    // Without the remap: the endpoint is not on the board, not a live target, and has no colon.
    const unpruned = pruneBoard(board, afterBuild)
    expect(unpruned.connectors).toEqual([{ from: 'c1', to: 'campaign' }])

    // With it: the wire survives, so the board still explains where the copy's context came from.
    const remapped = { ...board, connectors: remapBuiltTargets(board.connectors, new Map([[NODE, KEY]])) }
    expect(pruneBoard(remapped, afterBuild).connectors).toEqual([
      { from: 'c1', to: 'email|nurture' },
      { from: 'c1', to: 'campaign' },
    ])
  })
})

/**
 * AND WHAT HAPPENS TO A WIRE WHEN THE THING IT POINTS AT IS RENAMED.
 *
 * The mirror of the case above, and the same loss by a different door. A deliverable's key IS its
 * identity, and deliverableKeyFor folds branchOf into it, so unbranching a channel renames it.
 * Every card wired to the old key then pointed at a name nothing answers to, and the next openView
 * pruned those edges as dangling: a card wired to a channel quietly stopped feeding it, and the
 * wire could not even be undrawn, because it was already gone. The key carries no colon, so
 * pruneBoard's escape hatch for build-mode sub-cards does not cover it.
 *
 * Unbranching can also MERGE, into a channel the campaign already has, which is why the dedupe and
 * the self-edge drop are part of the contract rather than tidiness.
 */
describe('renaming a deliverable takes its wires with it', () => {
  const OLD = 'email|nurture|\u21b3Launch film'
  const NEW = 'email|nurture'

  it('moves a wire pointing at the old key', () => {
    expect(renameEndpoint([{ from: 'co_1', to: OLD }], OLD, NEW)).toEqual([{ from: 'co_1', to: NEW }])
  })

  it('moves a wire pointing OUT of it too', () => {
    expect(renameEndpoint([{ from: OLD, to: 'campaign' }], OLD, NEW)).toEqual([{ from: NEW, to: 'campaign' }])
  })

  it('leaves every other wire exactly as it was', () => {
    const cs = [{ from: 'co_1', to: 'campaign' }, { from: 'co_2', to: 'blog|article' }]
    expect(renameEndpoint(cs, OLD, NEW)).toEqual(cs)
  })

  it('merges two wires that collapse onto the same pair', () => {
    const cs = [{ from: 'co_1', to: OLD }, { from: 'co_1', to: NEW }]
    expect(renameEndpoint(cs, OLD, NEW)).toEqual([{ from: 'co_1', to: NEW }])
  })

  it('drops an edge that would become a loop on the merged card', () => {
    expect(renameEndpoint([{ from: OLD, to: NEW }], OLD, NEW)).toEqual([])
  })

  it('is a no-op when the key did not actually change', () => {
    const cs = [{ from: 'co_1', to: OLD }]
    expect(renameEndpoint(cs, OLD, OLD)).toEqual(cs)
  })

  it('survives the prune afterwards, which is the whole point', () => {
    const b: FlowBoard = {
      key: 'K',
      objects: [{ id: 'co_1', kind: 'audience', text: '' }],
      placements: [],
      pos: {},
      connectors: [{ from: 'co_1', to: OLD }],
    }
    const live = { objectKinds: new Set(['audience']), smartObjectIds: new Set<string>(), targetIds: new Set([NEW]) }
    expect(pruneBoard(b, live).connectors).toEqual([])
    const renamed = { ...b, connectors: renameEndpoint(b.connectors, OLD, NEW) }
    expect(pruneBoard(renamed, live).connectors).toEqual([{ from: 'co_1', to: NEW }])
  })
})
