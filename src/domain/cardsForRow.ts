import { deliverableKeyFor, type CanvasObject, type CanvasObjectKind, type FlowBoard } from './flowBoard'
import { upstreamCardIds } from './boardResolve'

/**
 * THE CARDS THAT REACH ONE ASSET, by kind.
 *
 * The canvas answers "what is this post written from" by having you look at it: the lines run from a
 * Brand card and a Message card and a Voice card into the brief, and from the brief down to the
 * post. The grid could not answer it at all. It listed the copy and the schedule and the budget, and
 * said nothing about the thing that decided what the copy SAYS, so the two surfaces were describing
 * different halves of the same asset.
 *
 * Three routes reach an asset, and this walks all three in the order the resolver does: wired
 * straight into the row, into its channel, or into the campaign every asset inherits. A channel cut
 * off from the brief skips the third, for the same reason it takes none of the campaign's
 * instructions — the picture and the writing have to agree, and here the grid IS the picture.
 *
 * `nameFor` is passed in rather than resolved here. A card names a record in one of a dozen
 * collections that live in the store, and a domain module has no business reaching for those; the
 * caller knows how to turn a card into a word.
 */
export interface RowCard {
  id: string
  kind: CanvasObjectKind
  label: string
}

export function cardsForRow(
  board: FlowBoard,
  row: { id: string; channel: string; assetType?: string; branchOf?: string },
  nameFor: (o: CanvasObject) => string,
): RowCard[] {
  const objectById = new Map(board.objects.map((o) => [o.id, o]))
  const delivKey = deliverableKeyFor(row)
  const cut = (board.detached ?? []).includes(delivKey)
  const targets = cut ? [row.id, delivKey] : [row.id, delivKey, 'campaign']

  const seen = new Set<string>()
  const out: RowCard[] = []
  for (const t of targets) {
    for (const id of upstreamCardIds(board, t)) {
      if (seen.has(id)) continue
      seen.add(id)
      // A placement (a smart object dropped on the board) has no kind of its own: it is a bag of
      // cards, and upstreamCardIds already returns those separately, so it contributes nothing here.
      const o = objectById.get(id)
      if (!o) continue
      out.push({ id: o.id, kind: o.kind, label: nameFor(o) })
    }
  }
  return out
}
