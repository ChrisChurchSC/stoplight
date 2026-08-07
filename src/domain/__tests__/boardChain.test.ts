import { describe, expect, it } from 'vitest'
import { hasWiredContext, reachesOutput, wiredRefsFor } from '../boardResolve'
import type { CanvasObject, FlowBoard, SmartPlacement } from '../flowBoard'
import type { SmartObject } from '../smartObject'
import type { FlowReference } from '../clients'

/**
 * RECORDS CHAIN THROUGH THE BOARD.
 *
 * The flow the canvas is built around is "start at a brand card, wire it through the cards that
 * shape the message, then wire that into the brief". wiredRefsFor used to answer at a single hop,
 * so the brand at the head of that chain reached nothing and the campaign came out unbranded. These
 * pin the transitive rule, and just as importantly they pin the two things that make a transitive
 * walk over a USER-DRAWN graph safe: it terminates on a cycle, and it dedupes across the whole walk
 * rather than per hop.
 *
 * They also pin what did NOT change. hasWiredContext is a different question ("does anything here
 * reach an output"), and a cluster of cards wired only to each other still answers no.
 */

const obj = (id: string, kind: CanvasObject['kind'], extra: Partial<CanvasObject> = {}): CanvasObject => ({
  id,
  kind,
  text: '',
  ...extra,
})

const board = (
  objects: CanvasObject[],
  connectors: { from: string; to: string }[],
  placements: SmartPlacement[] = [],
): FlowBoard => ({ key: 'K', objects, placements, pos: {}, connectors })

const library = (id: string, refs: FlowReference[]): SmartObject => ({ id, name: id, refs })

/** Records as "type:id" pairs, which is all wiredRefsFor promises: labels live on the slices. */
const ids = (refs: FlowReference[]): string[] => refs.map((r) => `${r.type}:${r.id}`)

describe('wiredRefsFor chains', () => {
  it('a two-hop chain carries both records', () => {
    // brand card -> message card -> brief. The brand touches no wire into the brief and must still
    // reach it, which is the whole reason this changed.
    const b = board(
      [obj('brand1', 'brand', { smartObjectId: 'so_brand' }), obj('msg1', 'message', { refId: 'm_1' })],
      [
        { from: 'brand1', to: 'msg1' },
        { from: 'msg1', to: 'campaign' },
      ],
    )
    const refs = wiredRefsFor(b, [library('so_brand', [{ type: 'company', id: 'co_acme', label: 'Acme' }])], 'campaign')
    // Nearest first: the card wired straight in, then what feeds it.
    expect(ids(refs)).toEqual(['message:m_1', 'company:co_acme'])
  })

  it('a three-hop chain carries all three records, nearest first', () => {
    const b = board(
      [
        obj('proof1', 'proof-point', { refId: 'p_1' }),
        obj('aud1', 'audience', { refId: 's_1' }),
        obj('msg1', 'message', { refId: 'm_1' }),
      ],
      [
        { from: 'proof1', to: 'aud1' },
        { from: 'aud1', to: 'msg1' },
        { from: 'msg1', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['message:m_1', 'segment:s_1', 'proof:p_1'])
  })

  it('a cycle terminates and returns each record once', () => {
    // A -> B -> A is a thing you can draw. Without a visited set this walk never returns and the tab
    // dies with it, so the assertion that matters most here is that the test finishes at all.
    const b = board(
      [obj('a', 'audience', { refId: 's_1' }), obj('bb', 'proof-point', { refId: 'p_1' })],
      [
        { from: 'a', to: 'bb' },
        { from: 'bb', to: 'a' },
        { from: 'a', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1', 'proof:p_1'])
  })

  it('a card wired to itself terminates', () => {
    const b = board(
      [obj('a', 'audience', { refId: 's_1' })],
      [
        { from: 'a', to: 'a' },
        { from: 'a', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1'])
  })

  it('a diamond returns the shared head once', () => {
    // A -> B -> D and A -> C -> D. A is reached down two paths and appears once: dedupe holds across
    // the whole traversal, not per hop.
    const b = board(
      [
        obj('a', 'audience', { refId: 's_1' }),
        obj('bb', 'message', { refId: 'm_1' }),
        obj('cc', 'proof-point', { refId: 'p_1' }),
      ],
      [
        { from: 'a', to: 'bb' },
        { from: 'a', to: 'cc' },
        { from: 'bb', to: 'campaign' },
        { from: 'cc', to: 'campaign' },
      ],
    )
    const refs = wiredRefsFor(b, [], 'campaign')
    expect(ids(refs)).toEqual(['message:m_1', 'proof:p_1', 'segment:s_1'])
    expect(refs.filter((r) => r.id === 's_1')).toHaveLength(1)
  })

  it('two cards naming the SAME record down different paths yield one entry', () => {
    const b = board(
      [obj('a1', 'audience', { refId: 's_1' }), obj('a2', 'audience', { refId: 's_1' })],
      [
        { from: 'a1', to: 'a2' },
        { from: 'a2', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1'])
  })

  it('the same board resolves in the same order twice', () => {
    const b = board(
      [
        obj('a', 'audience', { refId: 's_1' }),
        obj('bb', 'message', { refId: 'm_1' }),
        obj('cc', 'proof-point', { refId: 'p_1' }),
      ],
      [
        { from: 'cc', to: 'bb' },
        { from: 'a', to: 'campaign' },
        { from: 'bb', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(ids(wiredRefsFor(b, [], 'campaign')))
    // Wires drawn straight into the brief come before anything reached through them.
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1', 'message:m_1', 'proof:p_1'])
  })
})

describe('wiredRefsFor single hop, unchanged', () => {
  it('a card wired straight in contributes its record', () => {
    const b = board([obj('a', 'audience', { refId: 's_1' })], [{ from: 'a', to: 'campaign' }])
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1'])
  })

  it('a card that names no record contributes nothing', () => {
    // "Wired but empty" has to stay distinguishable from "wired and carrying something".
    const b = board([obj('n1', 'note')], [{ from: 'n1', to: 'campaign' }])
    expect(wiredRefsFor(b, [], 'campaign')).toEqual([])
  })

  it('a card showing a smart object contributes every record inside it', () => {
    const b = board([obj('a', 'audience', { smartObjectId: 'so_1' })], [{ from: 'a', to: 'campaign' }])
    const lib = library('so_1', [
      { type: 'segment', id: 's_1', label: 'RevOps' },
      { type: 'proof', id: 'p_1', label: 'Case' },
    ])
    expect(ids(wiredRefsFor(b, [lib], 'campaign'))).toEqual(['segment:s_1', 'proof:p_1'])
  })

  it('a placed smart object contributes all of its refs', () => {
    const b = board(
      [obj('m1', 'message', { refId: 'm_1' })],
      [{ from: 'pl1', to: 'campaign' }],
      [{ id: 'pl1', smartObjectId: 'so_1', memberIds: ['m1'] }],
    )
    const lib = library('so_1', [
      { type: 'company', id: 'co_1', label: 'Acme' },
      { type: 'person', id: 'pe_1', label: 'Dana' },
    ])
    expect(ids(wiredRefsFor(b, [lib], 'campaign'))).toEqual(['company:co_1', 'person:pe_1'])
  })

  it('a placement is walked THROUGH as well as read from', () => {
    // The old code returned early on a placement. Under a transitive walk that stops the chain at the
    // first smart object on it, which is the shape the brand library encourages you to draw.
    const b = board(
      [obj('a', 'audience', { refId: 's_1' })],
      [
        { from: 'a', to: 'pl1' },
        { from: 'pl1', to: 'campaign' },
      ],
      [{ id: 'pl1', smartObjectId: 'so_1', memberIds: [] }],
    )
    const lib = library('so_1', [{ type: 'company', id: 'co_1', label: 'Acme' }])
    expect(ids(wiredRefsFor(b, [lib], 'campaign'))).toEqual(['company:co_1', 'segment:s_1'])
  })

  it('a deliverable target resolves independently of the brief', () => {
    const b = board(
      [obj('a', 'audience', { refId: 's_1' }), obj('p1', 'proof-point', { refId: 'p_1' })],
      [
        { from: 'a', to: 'campaign' },
        { from: 'p1', to: 'linkedin|text' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'linkedin|text'))).toEqual(['proof:p_1'])
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual(['segment:s_1'])
  })

  it('an unwired board resolves to nothing', () => {
    expect(wiredRefsFor(board([obj('a', 'audience', { refId: 's_1' })], []), [], 'campaign')).toEqual([])
  })
})

describe('hasWiredContext is a different question and did not move', () => {
  it('a chain of cards wired only to each other reaches no output', () => {
    // Records now chain, but a chain that ends nowhere still ships nothing: the gate on generating
    // from an empty board is unaffected by the traversal change.
    const b = board(
      [obj('a', 'brand'), obj('bb', 'message', { refId: 'm_1' })],
      [{ from: 'a', to: 'bb' }],
    )
    expect(hasWiredContext(b)).toBe(false)
    expect(wiredRefsFor(b, [], 'campaign')).toEqual([])
  })

  it('the same chain wired into the brief reaches an output', () => {
    const b = board(
      [obj('a', 'brand', { smartObjectId: 'so_1' }), obj('bb', 'message', { refId: 'm_1' })],
      [
        { from: 'a', to: 'bb' },
        { from: 'bb', to: 'campaign' },
      ],
    )
    expect(hasWiredContext(b)).toBe(true)
    expect(ids(wiredRefsFor(b, [library('so_1', [{ type: 'company', id: 'co_1', label: 'Acme' }])], 'campaign'))).toEqual([
      'message:m_1',
      'company:co_1',
    ])
  })
})

/**
 * Outputs do not conduct.
 *
 * Connectors between outputs are real: dragging the brief hub onto a deliverable persists a
 * deliverable -> campaign wire. Before this rule, walking back from the campaign climbed into that
 * deliverable and collected every card scoped to it alone, so "this deliverable only" quietly became
 * "the whole campaign".
 */
describe('outputs do not conduct', () => {
  it('a card scoped to one deliverable does not reach the campaign through it', () => {
    const b = board(
      [obj('proof1', 'proof-point', { refId: 'p_1' })],
      [
        // Deliberately scoped to the deliverable and nothing else.
        { from: 'proof1', to: 'linkedin|text' },
        // The brief hub dragged onto that deliverable, which persists reversed.
        { from: 'linkedin|text', to: 'campaign' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual([])
    // It still reaches the deliverable it was actually wired to.
    expect(ids(wiredRefsFor(b, [], 'linkedin|text'))).toEqual(['proof:p_1'])
  })

  it('a chain of cards still carries through to the deliverable it ends at', () => {
    const b = board(
      [obj('aud1', 'audience', { refId: 's_1' }), obj('msg1', 'message', { refId: 'm_1' })],
      [
        { from: 'aud1', to: 'msg1' },
        { from: 'msg1', to: 'linkedin|text' },
      ],
    )
    expect(ids(wiredRefsFor(b, [], 'linkedin|text')).sort()).toEqual(['message:m_1', 'segment:s_1'])
  })
})

/**
 * A CARD INSIDE A SMART OBJECT IS ATTACHED WHEN THE OBJECT IS.
 *
 * reachesOutput drives one thing: whether a card looks like part of the campaign (full-strength on
 * the board, no "unattached" tag in the outline). It followed the card's OWN wires, and a card drawn
 * inside a placed smart object has none — you wire the object, not the cards in it. So every card in
 * a wired object was dimmed and tagged unattached while wiredRefsFor was handing its record to the
 * writer through the placement, which is the same board saying "this is not in the campaign" and
 * "this is in the campaign" about one card. Reported as an Audience card reading unattached.
 *
 * Pinned against wiredRefsFor in the same test, because the bug was never in either function alone:
 * it was the two of them disagreeing.
 */
describe('reachesOutput and smart-object members', () => {
  const member = obj('aud1', 'audience', { refId: 's_1', smartObjectId: 'so_1' })
  const placed: SmartPlacement = { id: 'place1', smartObjectId: 'so_1', memberIds: ['aud1'] }
  const lib = [library('so_1', [{ type: 'segment', id: 's_1', label: 'Founders' }])]

  it('reads attached when its object is wired to the brief, and its record is on the campaign', () => {
    const b = board([member], [{ from: 'place1', to: 'campaign' }], [placed])
    expect(reachesOutput(b, 'place1')).toBe(true)
    expect(reachesOutput(b, 'aud1')).toBe(true)
    // The half that was always right, and what makes the other half's answer a contradiction.
    expect(ids(wiredRefsFor(b, lib, 'campaign'))).toEqual(['segment:s_1'])
  })

  it('inherits a deliverable, not just the brief', () => {
    // The object may be wired to one channel rather than the campaign, and the member should say
    // what it actually reaches rather than being special-cased to the hub.
    const b = board([member], [{ from: 'place1', to: 'linkedin|text' }], [placed])
    expect(reachesOutput(b, 'aud1')).toBe(true)
  })

  it('still reads unattached when its object is wired to nothing', () => {
    // The negative case is the whole point of the tag: an object dropped on the board and left loose
    // must not start reporting its cards as part of the campaign.
    const b = board([member], [], [placed])
    expect(reachesOutput(b, 'place1')).toBe(false)
    expect(reachesOutput(b, 'aud1')).toBe(false)
    expect(ids(wiredRefsFor(b, lib, 'campaign'))).toEqual([])
  })

  it('leaves a loose card alone', () => {
    const b = board([obj('aud2', 'audience', { refId: 's_2' })], [])
    expect(reachesOutput(b, 'aud2')).toBe(false)
  })
})

/**
 * A LONG CHAIN IS STILL A CHAIN.
 *
 * reachesOutput decides whether a card LOOKS part of the campaign; wiredRefsFor decides whether its
 * record actually reaches the writer. They walk the same graph in opposite directions and they have
 * to agree. reachesOutput used to stop after MAX_OBJECT_DEPTH (3) hops — a constant about nesting
 * smart objects inside one another, not about how long a chain somebody drew — while upstreamCardIds
 * is uncapped on purpose. So at exactly four hops the two diverged: the segment was handed to the
 * campaign and to every asset written under it, and the board dimmed the card and tagged it
 * "unattached" anyway. Redrawing the wire fixed nothing, because the wire was never the problem.
 *
 * Every case here asserts BOTH answers on one board, because a test that checked only the display
 * would have passed happily while the two surfaces contradicted each other.
 */
describe('reachesOutput does not give up on a long chain', () => {
  /** aud -> m1 -> ... -> m(n-1) -> campaign, so the audience card is `hops` edges from the brief. */
  const chain = (hops: number): FlowBoard => {
    const mids = Array.from({ length: hops - 1 }, (_, i) => `m${i}`)
    const ids = ['aud', ...mids]
    return board(
      [obj('aud', 'audience', { refId: 's_1' }), ...mids.map((m, i) => obj(m, 'message', { refId: `m_${i}` }))],
      ids.map((id, i) => ({ from: id, to: ids[i + 1] ?? 'campaign' })),
    )
  }

  for (const hops of [1, 2, 3, 4, 5, 8]) {
    it(`reads attached at ${hops} hop${hops === 1 ? '' : 's'}, and its record is on the campaign`, () => {
      const b = chain(hops)
      expect(reachesOutput(b, 'aud')).toBe(true)
      expect(ids(wiredRefsFor(b, [], 'campaign'))).toContain('segment:s_1')
    })
  }

  it('still says no when the chain ends in a card rather than an output', () => {
    // The rule the cap was standing in for, and the one that actually matters: a cluster wired only
    // to itself reaches nothing, however long it is.
    const b = board(
      [
        obj('aud', 'audience', { refId: 's_1' }),
        obj('m0', 'message', { refId: 'm_0' }),
        obj('m1', 'message', { refId: 'm_1' }),
        obj('m2', 'message', { refId: 'm_2' }),
        obj('m3', 'message', { refId: 'm_3' }),
      ],
      [
        { from: 'aud', to: 'm0' },
        { from: 'm0', to: 'm1' },
        { from: 'm1', to: 'm2' },
        { from: 'm2', to: 'm3' },
      ],
    )
    expect(reachesOutput(b, 'aud')).toBe(false)
    expect(ids(wiredRefsFor(b, [], 'campaign'))).toEqual([])
  })

  it('terminates on a cycle rather than running forever', () => {
    // The visited set is what bounds the walk now that the cap is gone, so a ring drawn by hand has
    // to stop on its own. If this regresses it hangs rather than failing, which is why it is here.
    const b = board(
      [obj('aud', 'audience', { refId: 's_1' }), obj('m0', 'message'), obj('m1', 'message')],
      [
        { from: 'aud', to: 'm0' },
        { from: 'm0', to: 'm1' },
        { from: 'm1', to: 'aud' },
      ],
    )
    expect(reachesOutput(b, 'aud')).toBe(false)
  })

  it('a long chain that ends at a deliverable counts too', () => {
    const b = chain(5)
    const rewired = { ...b, connectors: b.connectors.map((c) => (c.to === 'campaign' ? { ...c, to: 'linkedin|text' } : c)) }
    expect(reachesOutput(rewired, 'aud')).toBe(true)
    expect(ids(wiredRefsFor(rewired, [], 'linkedin|text'))).toContain('segment:s_1')
  })
})
