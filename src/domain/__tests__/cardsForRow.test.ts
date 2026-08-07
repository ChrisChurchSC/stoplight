import { describe, expect, it } from 'vitest'
import { cardsForRow } from '../cardsForRow'
import type { CanvasObject, FlowBoard } from '../flowBoard'

/**
 * WHAT THE GRID SHOWS AN ASSET IS WRITTEN FROM.
 *
 * The canvas answers this by being looked at: lines run from a Brand card and a Message card into
 * the brief, and from the brief down to the post. The grid had no answer at all, so it described an
 * asset's copy, schedule and budget while staying silent on what decided the copy.
 *
 * Three routes reach an asset and all three have to be walked, because which one a card came in by
 * is invisible in the result and must be: a Voice wired to the campaign and a Voice wired to this
 * one post both reach it, and the person is asking the same question either way.
 *
 * The cut case is the one worth pinning hardest. A channel severed from the brief takes none of the
 * campaign's instructions, so a grid that kept listing the campaign's cards against its rows would
 * be contradicting both the canvas and the copy those rows actually get.
 */

const obj = (id: string, kind: CanvasObject['kind'], text = ''): CanvasObject => ({ id, kind, text })

const board = (over: Partial<FlowBoard> = {}): FlowBoard => ({
  key: 'Storm season',
  objects: [
    obj('brand1', 'brand'),
    obj('msg1', 'message'),
    obj('voice1', 'voice'),
    obj('proof1', 'proof-point'),
  ],
  placements: [],
  pos: {},
  connectors: [],
  ...over,
})

const ROW = { id: 'row_1', channel: 'youtube', assetType: 'long-form' }
const KEY = 'youtube|long-form'
const name = (o: CanvasObject) => o.id

describe('the cards that reach an asset', () => {
  it('finds a card wired to the campaign', () => {
    const b = board({ connectors: [{ from: 'brand1', to: 'campaign' }] })
    expect(cardsForRow(b, ROW, name).map((c) => c.kind)).toEqual(['brand'])
  })

  it('finds a card wired to the asset’s channel', () => {
    const b = board({ connectors: [{ from: 'voice1', to: KEY }] })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['voice1'])
  })

  it('finds a card wired straight to the asset', () => {
    const b = board({ connectors: [{ from: 'msg1', to: 'row_1' }] })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['msg1'])
  })

  it('finds all three routes at once, without repeating a card that arrives twice', () => {
    const b = board({
      connectors: [
        { from: 'brand1', to: 'campaign' },
        { from: 'voice1', to: KEY },
        { from: 'msg1', to: 'row_1' },
        // brand1 again, by a second route
        { from: 'brand1', to: KEY },
      ],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id).sort()).toEqual(['brand1', 'msg1', 'voice1'])
  })

  /** Cards chain: what reaches the brief reaches the post, however many hops back it started. */
  it('walks a chain, not just the last card in it', () => {
    const b = board({
      connectors: [
        { from: 'proof1', to: 'msg1' },
        { from: 'msg1', to: 'campaign' },
      ],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id).sort()).toEqual(['msg1', 'proof1'])
  })

  /**
   * The cut. Its own channel and its own row still reach it; the campaign does not. This is the same
   * rule the writer applies, and the grid has to match it or it is describing a different asset.
   */
  it('drops the campaign’s cards when the channel is cut off from the brief', () => {
    const b = board({
      detached: [KEY],
      connectors: [
        { from: 'brand1', to: 'campaign' },
        { from: 'voice1', to: KEY },
      ],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['voice1'])
  })

  it('cuts only the channel named', () => {
    const b = board({
      detached: ['linkedin|post'],
      connectors: [{ from: 'brand1', to: 'campaign' }],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['brand1'])
  })

  /** A card with no record picked is still connected, and still reaching the writer with nothing. */
  it('returns a card that names nothing, so an empty one can be seen', () => {
    const b = board({ connectors: [{ from: 'msg1', to: 'campaign' }] })
    expect(cardsForRow(b, ROW, () => '')).toEqual([{ id: 'msg1', kind: 'message', label: '' }])
  })

  it('is empty on a board with no wires', () => {
    expect(cardsForRow(board(), ROW, name)).toEqual([])
  })
})

/**
 * A SMART OBJECT'S CARDS REACH THE ASSET, AND THE GRID HAS TO SAY SO.
 *
 * You wire the object, not the cards inside it, so its members carry no edge of their own and the
 * upstream walk stops at the placement. cardsForRow looked each returned id up in `objects` and
 * skipped what it did not find, under a comment claiming the members came back separately. They did
 * not. So every card inside a smart object was invisible to the grid: "Made from" showed no
 * audience for an asset whose audience was reaching the copy writer through that very object.
 * Reported as the audience tag not showing as connected on the grid.
 *
 * The canvas half of this was fixed twice already (reachesOutput walking the container, and the
 * placement's wires surviving its object's deletion). This is the third surface asking the same
 * question and getting a different answer, so these assert against wiredRefsFor — the writer's own
 * answer — rather than against a hand-written expectation.
 */
describe('cards inside a placed smart object', () => {
  const aud = (id: string): CanvasObject => ({ id, kind: 'audience', text: '', refId: 's_1', smartObjectId: 'so1' })
  const withObject = (over: Partial<FlowBoard> = {}): FlowBoard =>
    board({
      objects: [aud('aud1'), { ...obj('msg2', 'message'), smartObjectId: 'so1' }],
      placements: [{ id: 'pl1', smartObjectId: 'so1', memberIds: ['aud1', 'msg2'] }],
      ...over,
    })

  it('are listed when the object is wired to the campaign', () => {
    const b = withObject({ connectors: [{ from: 'pl1', to: 'campaign' }] })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['aud1', 'msg2'])
  })

  it('carry their kind and record, so Made from can show the audience', () => {
    const b = withObject({ connectors: [{ from: 'pl1', to: 'campaign' }] })
    const found = cardsForRow(b, ROW, name).find((c) => c.kind === 'audience')
    expect(found).toEqual({ id: 'aud1', kind: 'audience', refId: 's_1', label: 'aud1' })
  })

  it('are listed when the object is wired to the channel or to the row', () => {
    for (const target of [KEY, ROW.id]) {
      const b = withObject({ connectors: [{ from: 'pl1', to: target }] })
      expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['aud1', 'msg2'])
    }
  })

  it('are NOT listed when the object is wired to nothing', () => {
    // The negative case is the point of the column: an object sitting on the board unwired reaches
    // no asset, and must not start showing up against every row.
    expect(cardsForRow(withObject(), ROW, name)).toEqual([])
  })

  it('go with the campaign when the channel is cut off from the brief', () => {
    const b = withObject({ detached: [KEY], connectors: [{ from: 'pl1', to: 'campaign' }] })
    expect(cardsForRow(b, ROW, name)).toEqual([])
  })

  it('lists a member once when it also carries a wire of its own', () => {
    const b = withObject({
      connectors: [
        { from: 'pl1', to: 'campaign' },
        { from: 'aud1', to: 'campaign' },
      ],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id)).toEqual(['aud1', 'msg2'])
  })

  it('reaches a card wired INTO the object, as well as the ones inside it', () => {
    // brand1 has to be on the board for the walk to accept it as a card, so this case rebuilds the
    // object list rather than using withObject's.
    const b = board({
      objects: [obj('brand1', 'brand'), aud('aud1'), { ...obj('msg2', 'message'), smartObjectId: 'so1' }],
      placements: [{ id: 'pl1', smartObjectId: 'so1', memberIds: ['aud1', 'msg2'] }],
      connectors: [
        { from: 'brand1', to: 'pl1' },
        { from: 'pl1', to: 'campaign' },
      ],
    })
    expect(cardsForRow(b, ROW, name).map((c) => c.id).sort()).toEqual(['aud1', 'brand1', 'msg2'])
  })
})
