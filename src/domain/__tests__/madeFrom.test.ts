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

  it('carries the card behind an entry, so the cell can open it', () => {
    const out = madeFrom({ kinds: KINDS, cards: [card('c1', 'voice', 'v1')], nameOf })
    expect(out[0].cardId).toBe('c1')
  })

  it('says nothing at all about an asset nothing reaches', () => {
    expect(madeFrom({ kinds: KINDS, cards: [], nameOf })).toEqual([])
  })
})
