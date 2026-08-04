import { describe, expect, it } from 'vitest'
import { wiredCardDocsFor, wiredObjectsFor, wiredRefsFor } from '../boardResolve'
import type { CanvasObject, FlowBoard, SmartPlacement } from '../flowBoard'
import { type SmartObject } from '../smartObject'
import { REFERENCE_LIMIT, makeObjectReference } from '../objectReference'
import type { FlowReference } from '../clients'

/**
 * A DOCUMENT ATTACHED TO AN OBJECT REACHES THE WRITER.
 *
 * wiredRefsFor dissolves a smart object into the records inside it, which is the right answer to
 * "what does this campaign cite" and is exactly why a document attached to an object had nowhere to
 * go: by the end of that walk the object is gone and only its parts remain. wiredObjectsFor is the
 * same walk answering the other question, and these pin the property that makes the pair safe —
 * the two must agree about what is wired, because a disagreement would put a brief in front of the
 * writer describing an object whose records never arrived, and each function would still look
 * correct read on its own.
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

const library = (id: string, refs: FlowReference[], reference?: SmartObject['reference']): SmartObject => ({
  id,
  name: id,
  refs,
  reference,
})

const doc = (text: string) => ({ name: 'brief.md', text, addedAt: 0 })

const names = (objects: SmartObject[]): string[] => objects.map((o) => o.id)

describe('wiredObjectsFor', () => {
  it('carries an object wired straight into the brief', () => {
    const b = board([obj('c1', 'brand', { smartObjectId: 'so_buyer' })], [{ from: 'c1', to: 'campaign' }])
    const lib = [library('so_buyer', [], doc('# The RevOps buyer'))]
    expect(names(wiredObjectsFor(b, lib, 'campaign'))).toEqual(['so_buyer'])
  })

  it('follows the same chain the records follow, so a document two hops back still arrives', () => {
    // The flow the board exists for: an object feeds a message card, the message feeds the brief.
    // If this walked one hop the document would vanish exactly where the old records rule lost the
    // brand at the head of a chain.
    const b = board(
      [obj('c1', 'brand', { smartObjectId: 'so_buyer' }), obj('msg1', 'message', { refId: 'm_1' })],
      [
        { from: 'c1', to: 'msg1' },
        { from: 'msg1', to: 'campaign' },
      ],
    )
    const lib = [library('so_buyer', [{ type: 'company', id: 'co_acme', label: 'Acme' }], doc('# Acme'))]
    expect(names(wiredObjectsFor(b, lib, 'campaign'))).toEqual(['so_buyer'])
    // ...and the records still arrive by the other walk. The pair agreeing is the actual invariant.
    expect(wiredRefsFor(b, lib, 'campaign').map((r) => `${r.type}:${r.id}`)).toEqual([
      'message:m_1',
      'company:co_acme',
    ])
  })

  it('resolves a placement, which is the other way a board names a library object', () => {
    const b = board(
      [],
      [{ from: 'p1', to: 'campaign' }],
      [{ id: 'p1', smartObjectId: 'so_buyer' } as SmartPlacement],
    )
    expect(names(wiredObjectsFor(b, [library('so_buyer', [], doc('x'))], 'campaign'))).toEqual(['so_buyer'])
  })

  it('counts one object once however many times it is placed', () => {
    // Two placements of the same library object is one object with one document. Sending it twice
    // would read to the writer as two briefs that happen to agree.
    const b = board(
      [],
      [
        { from: 'p1', to: 'campaign' },
        { from: 'p2', to: 'campaign' },
      ],
      [
        { id: 'p1', smartObjectId: 'so_buyer' } as SmartPlacement,
        { id: 'p2', smartObjectId: 'so_buyer' } as SmartPlacement,
      ],
    )
    expect(names(wiredObjectsFor(b, [library('so_buyer', [], doc('x'))], 'campaign'))).toEqual(['so_buyer'])
  })

  it('ignores an object that reaches nothing', () => {
    // Unwired is unwired. A document on an object nobody connected is not context, it is a file
    // sitting in a library, and the board's whole contract is that a wire is what makes a thing count.
    const b = board([obj('c1', 'brand', { smartObjectId: 'so_buyer' })], [])
    expect(names(wiredObjectsFor(b, [library('so_buyer', [], doc('x'))], 'campaign'))).toEqual([])
  })

  it('terminates on a cycle, as the records walk does', () => {
    const b = board(
      [obj('c1', 'brand', { smartObjectId: 'so_a' }), obj('c2', 'message', { smartObjectId: 'so_b' })],
      [
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'c1' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    const lib = [library('so_a', [], doc('a')), library('so_b', [], doc('b'))]
    expect(names(wiredObjectsFor(b, lib, 'campaign')).sort()).toEqual(['so_a', 'so_b'])
  })
})

/**
 * THE SAME PROPERTY ONE RUNG DOWN: a document attached to a CARD.
 *
 * A card can now be given a .md instead of being described, and that document is the card's whole
 * contribution rather than a source that filled some fields in. So the walk that finds it has to
 * hold to the same rules as the objects' one — a wire is what makes it count, a cycle terminates,
 * and one document is sent once — because the failure it prevents is worse here: a card's brief is
 * often the only thing the card carries, and a card whose document does not travel is a card that
 * silently contributes nothing at all.
 */
describe('wiredCardDocsFor', () => {
  const ids = (objects: CanvasObject[]): string[] => objects.map((o) => o.id)
  const withDoc = (id: string, kind: CanvasObject['kind'], text: string): CanvasObject =>
    obj(id, kind, { reference: makeObjectReference(`${id}.md`, text, 0) })

  it('carries a card wired straight into the brief', () => {
    const b = board([withDoc('c1', 'audience', 'They buy on renewal.')], [{ from: 'c1', to: 'campaign' }])
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual(['c1'])
  })

  it('carries a card several hops back, exactly as its records travel', () => {
    // brand -> message -> brief. The chain is the flow the board exists to support, and a document
    // that only travelled on a direct wire would drop the card at the head of it.
    const b = board(
      [withDoc('c1', 'brand', 'We only do emergencies.'), obj('c2', 'message')],
      [
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual(['c1'])
  })

  it('reads the cards inside a smart object placed on the board', () => {
    // Bundling a card says where it lives. It has never meant "stop reading what this one says".
    const b = board(
      [withDoc('c1', 'person', 'Fishes most weekends.'), obj('c2', 'voice')],
      [{ from: 'p1', to: 'campaign' }],
      [{ id: 'p1', smartObjectId: 'so_buyer', memberIds: ['c1', 'c2'] }],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual(['c1'])
  })

  it('sends one card once, however many ways it is reached', () => {
    // Two copies of one brief read to the writer as two briefs that happen to agree, which is a
    // corroboration nobody wrote.
    const b = board(
      [withDoc('c1', 'audience', 'One brief.'), obj('c2', 'message')],
      [
        { from: 'c1', to: 'campaign' },
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual(['c1'])
  })

  it('ignores a card with no document, and one that reaches nothing', () => {
    const b = board(
      [obj('c1', 'audience'), withDoc('c2', 'person', 'Unwired.'), withDoc('c3', 'voice', '   ')],
      [
        { from: 'c1', to: 'campaign' },
        { from: 'c3', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual([])
  })

  it('terminates on a cycle', () => {
    const b = board(
      [withDoc('c1', 'brand', 'a'), withDoc('c2', 'message', 'b')],
      [
        { from: 'c1', to: 'c2' },
        { from: 'c2', to: 'c1' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign')).sort()).toEqual(['c1', 'c2'])
  })

  it('scopes to the target it was asked about', () => {
    // A card wired to one deliverable is not context for the whole campaign, which is the entire
    // reason somebody draws the narrower wire.
    const b = board([withDoc('c1', 'season', 'The fortnight before.')], [{ from: 'c1', to: 'email|nurture' }])
    expect(ids(wiredCardDocsFor(b, 'email|nurture'))).toEqual(['c1'])
    expect(ids(wiredCardDocsFor(b, 'campaign'))).toEqual([])
  })
})

describe('makeObjectReference', () => {
  it('keeps a normal document whole', () => {
    const r = makeObjectReference('brief.md', '# Buyer\n\nThey care about onboarding time.', 7)
    expect(r.text).toBe('# Buyer\n\nThey care about onboarding time.')
    expect(r.truncated).toBeUndefined()
    expect(r.addedAt).toBe(7)
  })

  it('flags a cut rather than shipping part of a brief as though it were all of one', () => {
    const r = makeObjectReference('brief.md', 'x'.repeat(REFERENCE_LIMIT + 500), 0)
    expect(r.truncated).toBe(true)
    expect(r.text.length).toBeLessThanOrEqual(REFERENCE_LIMIT)
  })

  it('cuts at a paragraph break so the document ends on a whole thought', () => {
    // A cut mid-sentence reads to the writer as a fact that trails off, which is worse than
    // stopping a paragraph early.
    const head = 'a'.repeat(REFERENCE_LIMIT - 100)
    const r = makeObjectReference('brief.md', `${head}\n\n${'b'.repeat(400)}`, 0)
    expect(r.text).toBe(head)
    expect(r.truncated).toBe(true)
  })

  it('cuts flat when there is no break late enough to be worth honouring', () => {
    // One long block with a break near the very start: obeying it would throw away far more than
    // the limit saved, so the limit wins.
    const r = makeObjectReference('brief.md', `intro\n\n${'c'.repeat(REFERENCE_LIMIT + 200)}`, 0)
    expect(r.text.length).toBe(REFERENCE_LIMIT)
    expect(r.truncated).toBe(true)
  })
})
