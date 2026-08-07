import { describe, expect, it } from 'vitest'
import { madeFrom } from '../madeFrom'
import type { RowCard } from '../cardsForRow'
import type { CanvasObjectKind } from '../flowBoard'

/**
 * THE ONE COLUMN THAT SAYS WHAT AN ASSET IS MADE FROM.
 *
 * Twelve columns became one, so everything the twelve said separately now has to be said in a single
 * cell — and the order and the resolution are what keep it truthful. The pin beats the card because
 * the writer resolves in that order; a wired card with nothing picked still shows because that is
 * the gap the column exists to expose; a second card of the same kind is listed rather than swallowed,
 * because an asset really is reading both.
 */

const KINDS: CanvasObjectKind[] = ['brand', 'message', 'voice']
const card = (id: string, kind: CanvasObjectKind, refId?: string, label = ''): RowCard => ({ id, kind, refId, label })
const NAMES: Record<string, string> = { m1: 'Storm angle', m2: 'Price angle', v1: 'Plain-spoken', b1: 'Northwind' }
const nameOf = (_k: CanvasObjectKind, refId: string) => NAMES[refId]

describe('what an asset is made from', () => {
  it('lists only the kinds that reach it, in the order given', () => {
    const out = madeFrom({
      kinds: KINDS,
      cards: [card('c2', 'voice', 'v1'), card('c1', 'message', 'm1')],
      nameOf,
    })
    expect(out.map((e) => e.kind)).toEqual(['message', 'voice'])
    expect(out.map((e) => e.label)).toEqual(['Storm angle', 'Plain-spoken'])
  })

  /**
   * The pin is what the picker sets and what the writer resolves to. The card is still listed after
   * it, because the card is still on the board and still wired to this asset: its typed direction
   * travels whether or not the record it names was overridden, so a cell that hid it would be
   * claiming nothing else reaches the asset.
   */
  it('lets the asset’s own pin beat the card wired into it', () => {
    const out = madeFrom({
      kinds: KINDS,
      cards: [card('c1', 'message', 'm1')],
      references: [{ type: 'message', id: 'm2', label: 'Price angle' }],
      nameOf,
    })
    expect(out.map((e) => [e.refId, e.primary])).toEqual([
      ['m2', true],
      ['m1', false],
    ])
  })

  it('falls back to the label the pin was written with when the record cannot be resolved', () => {
    const out = madeFrom({
      kinds: KINDS,
      cards: [],
      references: [{ type: 'voice', id: 'gone', label: 'Retired voice' }],
      nameOf,
    })
    expect(out[0].label).toBe('Retired voice')
  })

  it('shows a wired card that has picked nothing, with no name on it', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'voice')], nameOf })
    expect(out).toEqual([{ kind: 'voice', label: '', cardId: 'c1', primary: true }])
  })

  it('lists a second card of the same kind, read-only, after the one the picker sets', () => {
    const out = madeFrom({
      kinds: KINDS,
      cards: [card('c1', 'message', 'm1'), card('c2', 'message', 'm2')],
      nameOf,
    })
    expect(out.map((e) => [e.refId, e.primary])).toEqual([
      ['m1', true],
      ['m2', false],
    ])
  })

  it('counts two cards naming the same record once', () => {
    const out = madeFrom({
      kinds: KINDS,
      cards: [card('c1', 'message', 'm1'), card('c2', 'message', 'm1')],
      nameOf,
    })
    expect(out).toHaveLength(1)
  })

  it('takes the brand from the campaign binding rather than from a pin', () => {
    const out = madeFrom({ kinds: KINDS, cards: [], brandRefId: 'b1', nameOf })
    expect(out).toEqual([{ kind: 'brand', refId: 'b1', label: 'Northwind', cardId: undefined, primary: true }])
  })

  it('falls back to the wired Brand card when the binding resolves to nothing', () => {
    // The binding is `row.client` matched against brand records BY NAME, so a row whose client was
    // never set, or a brand renamed since, resolves to nothing. This used to read "No brand picked"
    // with a Brand card sitting on the canvas naming one and wired to the brief — and the same card
    // then appeared lower in the cell as "also reaching this asset", which is how you could tell the
    // entry had seen it and refused it.
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'brand', 'b1')], nameOf })
    expect(out).toEqual([{ kind: 'brand', refId: 'b1', label: 'Northwind', cardId: 'c1', primary: true }])
  })

  it('still lets the campaign binding win over a card naming a different brand', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'brand', 'b2')], brandRefId: 'b1', nameOf })
    expect(out[0]).toMatchObject({ kind: 'brand', refId: 'b1', primary: true })
  })

  it('still says nothing is picked when the wired Brand card names nothing', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'brand')], nameOf })
    expect(out).toEqual([{ kind: 'brand', label: '', cardId: 'c1', primary: true }])
  })

  /**
   * A CARD THAT IS NAMED BUT HOLDS NOTHING IS STILL NAMED.
   *
   * An Audience card called "Breadcrumbs ICP", wired to the brief and pointing at no segment, read
   * here as "No audience picked" — the cell's words for an empty label — while the canvas named it
   * in the same breath and put "Contributes nothing yet" underneath. One state, and only this
   * surface dropped the half saying something was there.
   */
  it('names a wired card that has not picked a record yet', () => {
    const out = madeFrom({ kinds: ['audience'], cards: [card('c1', 'audience', undefined, 'Breadcrumbs ICP')], nameOf })
    expect(out).toEqual([{ kind: 'audience', label: 'Breadcrumbs ICP', cardId: 'c1', primary: true }])
  })

  /** The gap has to survive being named: no refId is what the cell marks empty. */
  it('leaves a named-but-empty card carrying no record, so it still reads as unfilled', () => {
    const out = madeFrom({ kinds: ['audience'], cards: [card('c1', 'audience', undefined, 'Breadcrumbs ICP')], nameOf })
    expect(out[0].refId).toBeUndefined()
  })

  /** The record still wins where there is one: the name is the fallback, not the answer. */
  it('prefers the record over the card’s own name', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'voice', 'v1', 'What I called it')], nameOf })
    expect(out[0]).toMatchObject({ refId: 'v1', label: 'Plain-spoken' })
  })

  /** Nothing to say is still nothing to say, so the unnamed empty card is unchanged. */
  it('says nothing is picked when the wired card has no name either', () => {
    const out = madeFrom({ kinds: ['audience'], cards: [card('c1', 'audience')], nameOf })
    expect(out).toEqual([{ kind: 'audience', label: '', cardId: 'c1', primary: true }])
  })

  /** The card that can say something represents the kind, and the cell opens that same card. */
  it('takes the name from a named sibling rather than reading as empty', () => {
    const out = madeFrom({
      kinds: ['audience'],
      cards: [card('c1', 'audience'), card('c2', 'audience', undefined, 'Breadcrumbs ICP')],
      nameOf,
    })
    expect(out).toEqual([{ kind: 'audience', label: 'Breadcrumbs ICP', cardId: 'c2', primary: true }])
  })

  it('carries the card behind an entry, so the cell can open it', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'voice', 'v1')], nameOf })
    expect(out[0].cardId).toBe('c1')
  })

  it('says nothing at all about an asset nothing reaches', () => {
    expect(madeFrom({ kinds: KINDS, cards: [], nameOf })).toEqual([])
  })
})

/**
 * THE AUDIENCE AN ASSET NAMES WITHOUT A CARD BEHIND IT.
 *
 * Audience is the only kind with a plain-string mirror on the row, and it is set by surfaces that
 * mint no reference and no card: the campaign canvas's asset inspector writes a name, seeding takes
 * the brand's first segment, ingest classifies into one. So the grid showed nothing under Made from
 * for an asset the canvas was plainly showing under an audience — the same shape as the brand bug
 * above, where the column had the answer available and declined to use it.
 */
const AUD: CanvasObjectKind[] = ['audience']

describe('the audience a row names by itself', () => {
  it('shows the row’s own audience when no card and no pin name one', () => {
    const out = madeFrom({ kinds: AUD, cards: [], rowAudience: { refId: 's1', label: 'Solo founders' }, nameOf })
    expect(out).toEqual([{ kind: 'audience', refId: 's1', label: 'Solo founders', primary: true }])
  })

  /** No card exists, so the chip must not claim one: the inspector would open nothing. */
  it('carries no card id, because there is no card to open', () => {
    const out = madeFrom({ kinds: AUD, cards: [], rowAudience: { refId: 's1', label: 'Solo founders' }, nameOf })
    expect(out[0].cardId).toBeUndefined()
  })

  /**
   * An audience typed or ingested as a name the library has no record of. Saying the name is the
   * truthful readout; blank would claim the asset is written to nobody.
   */
  it('says the name even when it matches no segment record', () => {
    const out = madeFrom({ kinds: AUD, cards: [], rowAudience: { label: 'Weekend hobbyists' }, nameOf })
    expect(out).toEqual([{ kind: 'audience', refId: undefined, label: 'Weekend hobbyists', primary: true }])
  })

  /** A wire is the more specific answer, which is the opposite of the rule brand follows above. */
  it('lets a wired Audience card beat the row’s string', () => {
    const cards = [card('c1', 'audience', 's2')]
    const out = madeFrom({ kinds: AUD, cards, rowAudience: { refId: 's1', label: 'Solo founders' }, nameOf: () => 'Agency owners' })
    expect(out).toEqual([{ kind: 'audience', refId: 's2', label: 'Agency owners', cardId: 'c1', primary: true }])
  })

  /**
   * A wired card holding nothing still wins, and still reads as empty. That gap is the thing the
   * column exists to expose, and filling it from the row's string would paper over a card that is
   * reaching the writer with nothing.
   */
  it('does not fill an empty wired card from the row’s string', () => {
    const out = madeFrom({ kinds: AUD, cards: [card('c1', 'audience')], rowAudience: { refId: 's1', label: 'Solo founders' }, nameOf })
    expect(out).toEqual([{ kind: 'audience', label: '', cardId: 'c1', primary: true }])
  })

  /** Only audience has the mirror field, so nothing else may be conjured from it. */
  it('is audience-only, and adds nothing when the row names none', () => {
    expect(madeFrom({ kinds: AUD, cards: [], rowAudience: { label: '' }, nameOf })).toEqual([])
    expect(madeFrom({ kinds: AUD, cards: [], nameOf })).toEqual([])
    expect(madeFrom({ kinds: KINDS, cards: [], rowAudience: { refId: 's1', label: 'Solo founders' }, nameOf })).toEqual([])
  })
})
