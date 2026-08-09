import { cardsForRow } from './cardsForRow'
import type { CanvasObject, CanvasObjectKind, FlowBoard } from './flowBoard'
import type { MadeFromEntry } from './madeFrom'

/**
 * WHAT "TAKE THIS OFF THIS ASSET" CAN ACTUALLY MEAN — the question Delete has to answer before it
 * does anything, because the honest answer is not the same for every chip in the column.
 *
 * A Made from entry can be reaching the asset three ways, and only two of them are the asset's to
 * change:
 *
 *   a PIN on the asset            → the asset's own answer, and clearing it is the whole job.
 *   a card wired to THIS asset    → also the asset's own answer, drawn on the canvas instead of
 *                                   pinned here. Cutting that one wire removes it from this asset
 *                                   and touches no other.
 *   a card wired to the CAMPAIGN  → not the asset's to change. That card reaches every asset in the
 *     (or to the deliverable)       campaign, so "remove it from this cell" would either do nothing
 *                                   or quietly strip it from thirty other assets. There is no third
 *                                   thing it could mean, and guessing between those two is worse
 *                                   than saying so.
 *
 * The last case is the reason this is a function and not two lines at the call site. It is invisible
 * from the cell — a chip supplied by the brief and a chip pinned on the row look identical — so the
 * only way to tell is to ask the board, and the only way to ask it honestly is to cut the wire and
 * see whether the card still arrives. That is what `cardsForRow` is run twice for: no hand-rolled
 * reasoning about a graph that already has a resolver.
 *
 * BRAND IS REFUSED OUTRIGHT, the same way the drawer refuses it: it is the campaign's owner rather
 * than something pinned on an asset, and unbinding it is a decision for the Brand card, not for one
 * of its thirty assets.
 */
export type MadeFromRemoval =
  /** Clear the asset's pin for this kind. `cut` is empty unless a wire has to go with it. */
  | { can: true; cut: { from: string; to: string }[] }
  /** Nothing this cell can do, and why — the caller turns `reason` into a sentence. */
  | { can: false; reason: 'brand' | 'not-settable' | 'secondary' | 'campaign-wide' }

export function madeFromRemoval(args: {
  entry: MadeFromEntry
  row: { id: string; channel: string; assetType?: string; branchOf?: string }
  board: FlowBoard
  /** Whether this kind can be set from the grid at all. The caller owns that rule. */
  settable: (kind: CanvasObjectKind) => boolean
  nameFor: (o: CanvasObject) => string
}): MadeFromRemoval {
  const { entry, row, board, settable, nameFor } = args
  if (entry.kind === 'brand') return { can: false, reason: 'brand' }
  if (!settable(entry.kind)) return { can: false, reason: 'not-settable' }
  /**
   * Only the kind's PRIMARY answers for the asset. A second card of the same kind is listed so the
   * cell tells the truth about what reaches the writer, and it is read-only there for the same
   * reason its caret is missing: acting on it would look like it changed that card and would
   * quietly change the other.
   */
  if (!entry.primary) return { can: false, reason: 'secondary' }

  // Nothing on the board supplies this kind, so the pin is the whole of it.
  const supplying = cardsForRow(board, row, nameFor).filter((c) => c.kind === entry.kind && (c.refId || c.doc))
  if (!supplying.length) return { can: true, cut: [] }

  // Cut every wire those cards have to THIS asset, then ask the resolver again. Anything still
  // arriving is arriving through the campaign or the deliverable, which this cell does not own.
  const ids = new Set(supplying.map((c) => c.id))
  const cut = board.connectors.filter((c) => ids.has(c.from) && c.to === row.id)
  const without = { ...board, connectors: board.connectors.filter((c) => !cut.includes(c)) }
  const persists = cardsForRow(without, row, nameFor).some((c) => ids.has(c.id) && (c.refId || c.doc))
  return persists ? { can: false, reason: 'campaign-wide' } : { can: true, cut }
}
