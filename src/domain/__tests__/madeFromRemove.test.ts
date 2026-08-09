import { describe, expect, it } from 'vitest'
import { madeFromRemoval } from '../madeFromRemove'
import type { MadeFromEntry } from '../madeFrom'
import type { CanvasObject, CanvasObjectKind, FlowBoard } from '../flowBoard'

/**
 * WHAT DELETE ON A MADE FROM CHIP IS ALLOWED TO MEAN.
 *
 * The cell shows one chip per thing reaching the asset and says nothing about HOW it arrives, which
 * is the whole difficulty: a record pinned on this asset and a record reaching it from the campaign
 * brief look identical, and only one of them is this asset's to take away. Taking the campaign's off
 * "this cell" would either do nothing — the pin clears and the card puts it straight back — or strip
 * it from every other asset in the campaign, and neither is what pressing Delete on one row means.
 *
 * So the answer is read off the board rather than guessed: cut the wires this asset owns, run the
 * same resolver the cell renders from, and see whether the card still arrives.
 */

const ROW = { id: 'r1', channel: 'email', assetType: 'nurture' }
const nameFor = (o: CanvasObject) => o.name ?? ''
const settable = (kind: CanvasObjectKind) => kind !== 'note'

const board = (objects: CanvasObject[], connectors: { from: string; to: string }[]): FlowBoard => ({
  key: 'K',
  objects,
  placements: [],
  pos: {},
  connectors,
})

const entry = (over: Partial<MadeFromEntry> = {}): MadeFromEntry => ({
  kind: 'message',
  refId: 'm1',
  label: 'Storm angle',
  primary: true,
  ...over,
})

const MSG: CanvasObject = { id: 'c1', kind: 'message', text: '', refId: 'm1' }

describe('what removing a Made from chip can mean', () => {
  /** Nothing on the board supplies it, so the asset's pin is the whole of it and clearing it is done. */
  it('clears the pin when no card is supplying the kind', () => {
    const out = madeFromRemoval({ entry: entry(), row: ROW, board: board([], []), settable, nameFor })
    expect(out).toEqual({ can: true, cut: [] })
  })

  /**
   * A card wired to THIS asset is the asset's own answer, drawn on the canvas instead of pinned in
   * the cell. Cutting that one wire takes it off this asset and touches no other.
   */
  it('cuts a card wired straight to this asset', () => {
    const out = madeFromRemoval({
      entry: entry({ cardId: 'c1' }),
      row: ROW,
      board: board([MSG], [{ from: 'c1', to: 'r1' }]),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: true, cut: [{ from: 'c1', to: 'r1' }] })
  })

  /**
   * THE CASE THIS FUNCTION EXISTS FOR. A card wired to the campaign brief reaches every asset in the
   * campaign. There is no wire this row owns, so there is nothing to cut and clearing the pin would
   * leave the card supplying the same record — the chip would come straight back.
   */
  it('refuses a card reaching the asset from the campaign brief', () => {
    const out = madeFromRemoval({
      entry: entry({ cardId: 'c1' }),
      row: ROW,
      board: board([MSG], [{ from: 'c1', to: 'campaign' }]),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: false, reason: 'campaign-wide' })
  })

  /** Wired both ways: cutting the row's own wire still leaves the brief's, so it is still not ours. */
  it('refuses when the row’s own wire is not the only way in', () => {
    const out = madeFromRemoval({
      entry: entry({ cardId: 'c1' }),
      row: ROW,
      board: board([MSG], [{ from: 'c1', to: 'r1' }, { from: 'c1', to: 'campaign' }]),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: false, reason: 'campaign-wide' })
  })

  /**
   * Brand is the campaign's owner rather than something pinned on an asset — the same refusal the
   * drawer makes, for the same reason: unbinding it is a decision for the Brand card, not for one of
   * its thirty assets.
   */
  it('refuses the brand outright', () => {
    const out = madeFromRemoval({
      entry: entry({ kind: 'brand', refId: 'b1' }),
      row: ROW,
      board: board([], []),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: false, reason: 'brand' })
  })

  /** A second card of the same kind is listed so the cell tells the truth, and is read-only there. */
  it('refuses a secondary entry, which is not what the cell resolves to', () => {
    const out = madeFromRemoval({
      entry: entry({ cardId: 'c2', primary: false }),
      row: ROW,
      board: board([], []),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: false, reason: 'secondary' })
  })

  it('refuses a kind this cell cannot set', () => {
    const out = madeFromRemoval({
      entry: entry({ kind: 'note' }),
      row: ROW,
      board: board([], []),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: false, reason: 'not-settable' })
  })

  /**
   * A card wired to this asset but holding nothing is not supplying the kind, so it is not what is
   * keeping the chip there — the pin is, and clearing it is the whole job.
   */
  it('ignores a wired card that names no record', () => {
    const empty: CanvasObject = { id: 'c1', kind: 'message', text: '' }
    const out = madeFromRemoval({
      entry: entry(),
      row: ROW,
      board: board([empty], [{ from: 'c1', to: 'r1' }]),
      settable,
      nameFor,
    })
    expect(out).toEqual({ can: true, cut: [] })
  })
})
