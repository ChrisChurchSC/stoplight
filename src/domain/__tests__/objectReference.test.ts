import { describe, expect, it } from 'vitest'
import { wiredCardDocsFor, wiredObjectsFor, wiredRefsFor, type WiredCardDoc } from '../boardResolve'
import type { CanvasObject, FlowBoard, SmartPlacement } from '../flowBoard'
import { type SmartObject } from '../smartObject'
import { REFERENCE_LIMIT, makeObjectReference, pickReference, titleFromDoc, type ObjectReference } from '../objectReference'
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
  const ids = (found: WiredCardDoc[]): string[] => found.map((f) => f.card.id)
  const withDoc = (id: string, kind: CanvasObject['kind'], text: string): CanvasObject =>
    obj(id, kind, { reference: makeObjectReference(`${id}.md`, text, 0) })
  /** No record anywhere holds a document, so every case below is about the card's own slot. */
  const NO_DOCS = new Map<string, ObjectReference>()

  it('carries a card wired straight into the brief', () => {
    const b = board([withDoc('c1', 'audience', 'They buy on renewal.')], [{ from: 'c1', to: 'campaign' }])
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual(['c1'])
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
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual(['c1'])
  })

  it('reads the cards inside a smart object placed on the board', () => {
    // Bundling a card says where it lives. It has never meant "stop reading what this one says".
    const b = board(
      [withDoc('c1', 'person', 'Fishes most weekends.'), obj('c2', 'voice')],
      [{ from: 'p1', to: 'campaign' }],
      [{ id: 'p1', smartObjectId: 'so_buyer', memberIds: ['c1', 'c2'] }],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual(['c1'])
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
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual(['c1'])
  })

  it('ignores a card with no document, and one that reaches nothing', () => {
    const b = board(
      [obj('c1', 'audience'), withDoc('c2', 'person', 'Unwired.'), withDoc('c3', 'voice', '   ')],
      [
        { from: 'c1', to: 'campaign' },
        { from: 'c3', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual([])
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
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS)).sort()).toEqual(['c1', 'c2'])
  })

  it('scopes to the target it was asked about', () => {
    // A card wired to one deliverable is not context for the whole campaign, which is the entire
    // reason somebody draws the narrower wire.
    const b = board([withDoc('c1', 'season', 'The fortnight before.')], [{ from: 'c1', to: 'email|nurture' }])
    expect(ids(wiredCardDocsFor(b, 'email|nurture', NO_DOCS))).toEqual(['c1'])
    expect(ids(wiredCardDocsFor(b, 'campaign', NO_DOCS))).toEqual([])
  })

  /**
   * THE DOCUMENT USUALLY BELONGS TO THE RECORD, and these are the cases that separates.
   *
   * Handing a card a .md writes it onto the object the card names, so the same brief is true of that
   * object on every board. What a card holds of its own is an override, and an override is only
   * worth having if it actually wins and if the thing it overrides is genuinely shared.
   */
  const recordDoc = (id: string, text: string): Map<string, ObjectReference> =>
    new Map([[id, makeObjectReference(`${id}.md`, text, 0)]])

  it("reads the record's document through a card that carries none of its own", () => {
    const b = board([obj('c1', 'audience', { refId: 'aud_1' })], [{ from: 'c1', to: 'campaign' }])
    const found = wiredCardDocsFor(b, 'campaign', recordDoc('aud_1', 'They buy on renewal.'))
    expect(found.map((f) => [f.card.id, f.from, f.ref.text])).toEqual([['c1', 'record', 'They buy on renewal.']])
  })

  it("lets a card's own document win over the record's, for this board only", () => {
    const b = board(
      [obj('c1', 'audience', { refId: 'aud_1', reference: makeObjectReference('local.md', 'Renewals only.', 0) })],
      [{ from: 'c1', to: 'campaign' }],
    )
    const found = wiredCardDocsFor(b, 'campaign', recordDoc('aud_1', 'The library version.'))
    expect(found.map((f) => [f.from, f.ref.text])).toEqual([['card', 'Renewals only.']])
  })

  it('sends a record\'s document once however many cards name it', () => {
    // The ordinary shape of a board: one audience pointed at from three channels. It is one brief,
    // and three copies would read to the writer as three sources that happen to agree.
    const b = board(
      [obj('c1', 'audience', { refId: 'aud_1' }), obj('c2', 'audience', { refId: 'aud_1' })],
      [
        { from: 'c1', to: 'campaign' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    expect(ids(wiredCardDocsFor(b, 'campaign', recordDoc('aud_1', 'One brief.')))).toEqual(['c1'])
  })

  it('keeps an override alongside the record it overrides, when both are wired', () => {
    // Genuinely two documents: one is the object's, one exists only on this board. Deduping them
    // together would silently drop whichever the walk reached second.
    const b = board(
      [
        obj('c1', 'audience', { refId: 'aud_1' }),
        obj('c2', 'audience', { refId: 'aud_1', reference: makeObjectReference('local.md', 'Just here.', 0) }),
      ],
      [
        { from: 'c1', to: 'campaign' },
        { from: 'c2', to: 'campaign' },
      ],
    )
    const found = wiredCardDocsFor(b, 'campaign', recordDoc('aud_1', 'The library version.'))
    expect(found.map((f) => f.from).sort()).toEqual(['card', 'record'])
  })

  it('ignores a record document when the card names no record at all', () => {
    // The state every card is in before its document has minted one. There is nothing to look up.
    const b = board([obj('c1', 'audience')], [{ from: 'c1', to: 'campaign' }])
    expect(ids(wiredCardDocsFor(b, 'campaign', recordDoc('aud_1', 'Not this card.')))).toEqual([])
  })
})

describe('pickReference', () => {
  const ref = (text: string) => makeObjectReference('d.md', text, 0)

  it('prefers the card, falls back to the record, and reports which', () => {
    expect(pickReference(ref('card'), ref('record'))).toMatchObject({ from: 'card' })
    expect(pickReference(undefined, ref('record'))).toMatchObject({ from: 'record' })
    expect(pickReference(undefined, undefined)).toBeNull()
  })

  it('treats a whitespace-only override as no override', () => {
    // Otherwise clearing an override by emptying it would silently hide the record's document
    // instead of revealing it again, and nothing on screen would say why the brief went missing.
    expect(pickReference(ref('   \n  '), ref('record'))).toMatchObject({ from: 'record' })
  })
})

/**
 * A DOCUMENT MINTS THE RECORD IT DESCRIBES, so it has to be able to name one.
 *
 * An object called "Untitled" in Records is the failure this exists to prevent: it cannot be found,
 * compared or reused, which is most of the point of putting it in a library.
 */
describe('titleFromDoc', () => {
  it('prefers the heading the author wrote', () => {
    expect(titleFromDoc('persona-v2.md', '# Enterprise ops lead\n\nThey buy on renewal.')).toBe('Enterprise ops lead')
  })

  it('strips the marks a heading carries', () => {
    expect(titleFromDoc('x.md', '## **Enterprise ops** ##')).toBe('Enterprise ops')
  })

  it('tidies a filename when the document has no heading', () => {
    expect(titleFromDoc('persona_enterprise-ops.md', 'They buy on renewal.')).toBe('Persona enterprise ops')
  })

  it('falls back to the first line for a paste, which has no filename worth showing', () => {
    expect(titleFromDoc('Pasted text', '- They buy on renewal.\nAnd they churn on price.')).toBe(
      'They buy on renewal.',
    )
  })

  it('never returns empty, however little it was given', () => {
    expect(titleFromDoc('', '   ')).toBe('Untitled')
  })

  it('ignores a heading far down the document, which is a section and not the subject', () => {
    const body = `${'A line of prose.\n'.repeat(60)}# Appendix`
    expect(titleFromDoc('the-brief.md', body)).toBe('The brief')
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
